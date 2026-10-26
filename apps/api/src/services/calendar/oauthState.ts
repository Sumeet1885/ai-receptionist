import { createHash, randomBytes as nodeRandomBytes } from 'node:crypto';

const STATE_TTL_MS = 10 * 60 * 1000;

function hashState(state: string) {
  return createHash('sha256').update(state).digest('hex');
}

interface CreateStateInput {
  db: any;
  ownerId: string;
  provider: string;
  now?: Date;
  randomBytes?: (size: number) => Buffer;
}

interface ConsumeStateInput {
  db: any;
  state: string;
  provider: string;
}

export async function createCalendarOAuthState(input: CreateStateInput): Promise<string> {
  const now = input.now || new Date();
  const state = (input.randomBytes || nodeRandomBytes)(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + STATE_TTL_MS).toISOString();
  const { error } = await input.db.from('calendar_oauth_states').insert({
    state_hash: hashState(state),
    owner_id: input.ownerId,
    provider: input.provider,
    expires_at: expiresAt,
  });

  if (error) throw error;
  return state;
}

export async function consumeCalendarOAuthState(input: ConsumeStateInput): Promise<string> {
  if (!input.state || !input.provider) {
    throw new Error('OAuth state and provider are required');
  }

  const { data, error } = await input.db.rpc('consume_calendar_oauth_state', {
    p_state_hash: hashState(input.state),
    p_provider: input.provider,
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.owner_id) {
    throw new Error('OAuth state is invalid, expired, or already used');
  }
  return row.owner_id;
}
