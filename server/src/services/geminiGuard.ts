/**
 * GeminiGuard — Algorithmic Traffic Management Layer
 * ===================================================
 * Prevents exceeding Google AI Studio Free-Tier limits:
 *   - Max 10 RPM  (Requests Per Minute)
 *   - Max 250,000 TPM (Tokens Per Minute)
 *   - Max 3 Concurrent Live Sessions
 *
 * Data Structures Used:
 *   - Sliding Window Counter  → RPM enforcement (ring-buffer timestamps, O(1) amortised)
 *   - Semaphore + FIFO Queue  → Concurrent session gating (linked-list head/tail, O(1))
 *   - Map<sessionId, handle>  → Session registry for hard-timeout enforcement (O(1))
 *
 * It also enforces the live-call session lifecycle:
 *   - 4-minute wrap warning
 *   - 5-minute hard stop
 *
 * CRITICAL: This module is purely infrastructure. It wraps around I/O boundaries
 * and never touches the conversational logic, audio pipeline, or tool-call handlers.
 */

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_CONCURRENT_SESSIONS  = 3;
const MAX_RPM                  = 10;
const RPM_WINDOW_MS            = 60_000;          // 1-minute sliding window
const MAX_WAIT_QUEUE_SIZE      = 5;               // Max clients queued for a slot
const SESSION_QUEUE_TIMEOUT_MS = 30_000;          // 30 s max wait before rejection
const SESSION_WRAP_WARNING_MS  = 4 * 60_000;      // Warn the assistant to wrap up after 4 min
const SESSION_MAX_DURATION_MS  = 5 * 60_000;      // 5 min hard session cap
const TPM_BUDGET               = 240_000;         // 240K (10K safety margin below 250K hard limit)
const TOKENS_PER_CHAR          = 0.25;            // ~4 chars / token (conservative for English)

// ─── Types ────────────────────────────────────────────────────────────────────
interface QueueEntry {
  resolve: () => void;
  reject:  (reason: string) => void;
  timer:   ReturnType<typeof setTimeout>;
}

interface SessionRecord {
  sessionId:   string;
  startedAt:   number;
  warningHandle: ReturnType<typeof setTimeout>;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

// ─── GeminiGuard Class ────────────────────────────────────────────────────────
class GeminiGuard {
  // --- Concurrent Session Semaphore ---
  private activeSessions = 0;
  private readonly sessionRegistry = new Map<string, SessionRecord>();

  // --- FIFO Waiting Queue (linked-list simulation via Array — bounded) ---
  private readonly waitQueue: QueueEntry[] = [];

  // --- Sliding Window RPM Counter ---
  // Stores timestamps (ms) of the last MAX_RPM requests inside the window.
  // We use a fixed-size ring buffer so memory is bounded regardless of traffic.
  private readonly rpmWindow: number[] = new Array(MAX_RPM).fill(0);
  private rpmIndex = 0;  // points to the oldest entry in the ring

  // --- TPM Accumulator (rolling 1-minute estimate) ---
  private tpmTokens = 0;
  private tpmWindowStart = Date.now();

  // ─── RPM: Sliding Window Check ─────────────────────────────────────────────
  /**
   * Records a new request and checks whether we are within the RPM budget.
   * Uses a ring-buffer to store the last MAX_RPM timestamps.
   * Time Complexity: O(1) amortised.
   *
   * @throws Error if the RPM budget is exhausted for this minute window.
   */
  checkRPM(): void {
    const now = Date.now();
    const oldestTimestamp = this.rpmWindow[this.rpmIndex];

    // If the oldest entry in our ring is still within the window,
    // we have MAX_RPM requests in the last 60 seconds → over limit.
    if (oldestTimestamp > 0 && now - oldestTimestamp < RPM_WINDOW_MS) {
      const retryAfterMs = RPM_WINDOW_MS - (now - oldestTimestamp);
      throw new RateLimitError(
        `RPM budget exhausted. ${MAX_RPM} requests already made in the last 60s. Retry after ${Math.ceil(retryAfterMs / 1000)}s.`,
        retryAfterMs
      );
    }

    // Slot is available — write the current timestamp into the ring.
    this.rpmWindow[this.rpmIndex] = now;
    this.rpmIndex = (this.rpmIndex + 1) % MAX_RPM;
  }

  /**
   * Waits until there is budget available in the sliding window.
   * Safe to call from a background (non-blocking) context.
   */
  async waitForRPMSlot(): Promise<void> {
    const now = Date.now();
    const oldestTimestamp = this.rpmWindow[this.rpmIndex];
    if (oldestTimestamp > 0 && now - oldestTimestamp < RPM_WINDOW_MS) {
      const waitMs = RPM_WINDOW_MS - (now - oldestTimestamp) + 100; // +100ms jitter
      console.log(`[GeminiGuard] RPM wait: sleeping ${Math.ceil(waitMs / 1000)}s before retry`);
      await sleep(waitMs);
    }
    this.checkRPM(); // re-check after wait; throws if still over (defensive)
  }

  // ─── TPM: Lightweight Token Estimation ─────────────────────────────────────
  /**
   * Estimates token count from a string using char-based heuristic.
   * Resets the accumulator every minute.
   * Time Complexity: O(n) for string length, O(1) for accumulator check.
   *
   * @throws Error if adding these tokens would exceed the TPM budget.
   */
  estimateAndCheckTPM(text: string): void {
    const now = Date.now();
    // Reset accumulator if the minute window has rolled over
    if (now - this.tpmWindowStart > RPM_WINDOW_MS) {
      this.tpmTokens = 0;
      this.tpmWindowStart = now;
    }

    const estimatedTokens = Math.ceil(text.length * TOKENS_PER_CHAR);
    if (this.tpmTokens + estimatedTokens > TPM_BUDGET) {
      throw new RateLimitError(
        `TPM budget exceeded. Accumulated ~${this.tpmTokens} tokens this minute. Estimated cost: ~${estimatedTokens} tokens.`,
        RPM_WINDOW_MS - (now - this.tpmWindowStart)
      );
    }
    this.tpmTokens += estimatedTokens;
  }

  // ─── Session Semaphore: Acquire ─────────────────────────────────────────────
  /**
   * Acquires a session slot. If all 3 slots are taken, the caller is queued
   * in a FIFO queue (up to MAX_WAIT_QUEUE_SIZE). Returns a Promise that resolves
   * when a slot is granted or rejects after SESSION_QUEUE_TIMEOUT_MS.
   *
   * Time Complexity: O(1) for enqueue and dequeue operations.
   */
  acquireSession(sessionId: string): Promise<void> {
    if (this.activeSessions < MAX_CONCURRENT_SESSIONS) {
      // Fast path: slot available
      this.activeSessions++;
      console.log(`[GeminiGuard] Session acquired: ${sessionId}. Active: ${this.activeSessions}/${MAX_CONCURRENT_SESSIONS}`);
      return Promise.resolve();
    }

    // Slow path: queue the caller
    if (this.waitQueue.length >= MAX_WAIT_QUEUE_SIZE) {
      return Promise.reject('Session queue is full. All 3 Gemini Live sessions are busy and the waiting queue is full.');
    }

    console.log(`[GeminiGuard] Session queued: ${sessionId}. Queue depth: ${this.waitQueue.length + 1}`);

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Remove from queue on timeout
        const idx = this.waitQueue.findIndex(e => e.timer === timer);
        if (idx !== -1) this.waitQueue.splice(idx, 1);
        reject('Session queue timeout. Could not acquire a slot within 30 seconds.');
      }, SESSION_QUEUE_TIMEOUT_MS);

      this.waitQueue.push({ resolve, reject, timer });
    });
  }

  // ─── Session Semaphore: Release ─────────────────────────────────────────────
  /**
   * Releases a session slot and grants it to the next queued caller (FIFO).
   * Also cancels the session's hard-timeout timer.
   *
   * Time Complexity: O(1).
   */
  releaseSession(sessionId: string): void {
    const record = this.sessionRegistry.get(sessionId);
    if (record) {
      clearTimeout(record.warningHandle);
      clearTimeout(record.timeoutHandle);
      this.sessionRegistry.delete(sessionId);
    }

    if (this.waitQueue.length > 0) {
      // Dequeue the next waiting caller — slot is transferred directly
      const next = this.waitQueue.shift()!;
      clearTimeout(next.timer);
      // activeSessions count stays the same (one released → one granted)
      console.log(`[GeminiGuard] Session released: ${sessionId}. Granting to queued caller. Active: ${this.activeSessions}/${MAX_CONCURRENT_SESSIONS}`);
      next.resolve();
    } else {
      this.activeSessions = Math.max(0, this.activeSessions - 1);
      console.log(`[GeminiGuard] Session released: ${sessionId}. Active: ${this.activeSessions}/${MAX_CONCURRENT_SESSIONS}`);
    }
  }

  // ─── Session Hard Timeout ───────────────────────────────────────────────────
  /**
   * Registers a 4-minute wrap warning and a hard 5-minute timeout for a session.
   * If the session is still active after the warning period, `onWarning` is invoked.
   * If the session is not closed by the hard cap, `onTimeout` is invoked.
   * This prevents zombie sessions from permanently occupying a slot.
   */
  registerSessionLifecycle(sessionId: string, onWarning: () => void, onTimeout: () => void): void {
    const warningHandle = setTimeout(() => {
      console.warn(`[GeminiGuard] Session ${sessionId} reached wrap warning (${SESSION_WRAP_WARNING_MS / 60000} min).`);
      onWarning();
    }, SESSION_WRAP_WARNING_MS);

    const timeoutHandle = setTimeout(() => {
      console.warn(`[GeminiGuard] Session ${sessionId} exceeded max duration (${SESSION_MAX_DURATION_MS / 60000} min). Force-closing.`);
      onTimeout();
      // releaseSession is called by the ws.on('close') handler triggered by onTimeout
    }, SESSION_MAX_DURATION_MS);

    this.sessionRegistry.set(sessionId, {
      sessionId,
      startedAt: Date.now(),
      warningHandle,
      timeoutHandle
    });
  }

  // ─── Status Report ──────────────────────────────────────────────────────────
  /**
   * Returns a plain object snapshot of guard state.
   * Used by the /health endpoint for observability.
   */
  getStatus() {
    const now = Date.now();
    // Count active requests in the sliding window
    const windowStart = now - RPM_WINDOW_MS;
    const activeRPM = this.rpmWindow.filter(ts => ts > windowStart).length;

    // Reset TPM if window rolled
    const tpmTokens = (now - this.tpmWindowStart < RPM_WINDOW_MS)
      ? this.tpmTokens
      : 0;

    return {
      activeSessions:       this.activeSessions,
      maxSessions:          MAX_CONCURRENT_SESSIONS,
      waitQueueDepth:       this.waitQueue.length,
      maxWaitQueueSize:     MAX_WAIT_QUEUE_SIZE,
      rpmUsed:              activeRPM,
      rpmBudget:            MAX_RPM,
      tpmEstimatedUsed:     tpmTokens,
      tpmBudget:            TPM_BUDGET,
    };
  }
}

// ─── Custom Error Class ───────────────────────────────────────────────────────
export class RateLimitError extends Error {
  public readonly retryAfterMs: number;
  constructor(message: string, retryAfterMs = 0) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Singleton Export ─────────────────────────────────────────────────────────
export const geminiGuard = new GeminiGuard();
