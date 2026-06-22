import test from 'node:test';
import assert from 'node:assert/strict';
import { bookCalendarAppointment, checkCalendarAvailability, serializeCalendarToolError } from '../src/services/calendar/calendarOperations';

function queryResult(data: any) {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    single: async () => ({ data, error: null }),
  };
  return builder;
}

test('availability uses the trusted owner id with the connected provider adapter', async () => {
  const calls: any[] = [];
  const db = {
    from(table: string) {
      assert.equal(table, 'calendar_connections');
      return queryResult({ provider: 'google' });
    },
  };
  const slots = [{ start: '2026-06-20T10:00:00Z', end: '2026-06-20T10:30:00Z' }];
  const adapter = {
    async checkAvailability(date: string, ownerId: string, timezone?: string) {
      calls.push([date, ownerId, timezone]);
      return slots;
    },
  };

  const result = await checkCalendarAvailability({
    db,
    ownerId: 'owner-1',
    date: '2026-06-20',
    timezone: 'Asia/Kolkata',
    getAdapter: () => adapter as any,
  });

  assert.deepEqual(result, slots);
  assert.deepEqual(calls, [['2026-06-20', 'owner-1', 'Asia/Kolkata']]);
});

test('booking rejects a second appointment for the same session', async () => {
  const db = {
    from(table: string) {
      assert.equal(table, 'appointments');
      const builder: any = {
        select: () => builder,
        eq: async () => ({ data: [{ id: 'existing' }], error: null }),
      };
      return builder;
    },
  };

  await assert.rejects(
    bookCalendarAppointment({
      db,
      ownerId: 'owner-1',
      botId: 'bot-1',
      sessionId: 'session-1',
      timezone: 'UTC',
      details: {
        title: 'Consultation',
        visitorName: 'Visitor',
        visitorPhone: '+919415072638',
        startTime: '2026-06-20T10:00:00Z',
        endTime: '2026-06-20T10:30:00Z',
      },
      getAdapter: () => { throw new Error('adapter must not be called'); },
    }),
    /already been booked/,
  );
});

test('booking rechecks the exact slot before creating and persisting an event', async () => {
  const inserts: any[] = [];
  const db = {
    from(table: string) {
      if (table === 'appointments') {
        const builder: any = {
          select: () => builder,
          eq: async () => ({ data: [], error: null }),
          insert: async (value: any) => { inserts.push(value); return { error: null }; },
        };
        return builder;
      }
      if (table === 'calendar_connections') return queryResult({ provider: 'google' });
      throw new Error(`Unexpected table ${table}`);
    },
  };
  const details = {
    title: 'Consultation',
    visitorName: 'Visitor',
    visitorPhone: '+919415072638',
    startTime: '2026-06-20T10:00:00Z',
    endTime: '2026-06-20T10:30:00Z',
  };
  const adapter = {
    async checkAvailability() {
      return [{ start: details.startTime, end: details.endTime }];
    },
    async bookAppointment() {
      return { eventId: 'event-1' };
    },
  };

  const result = await bookCalendarAppointment({
    db,
    ownerId: 'owner-1',
    botId: 'bot-1',
    sessionId: 'session-1',
    timezone: 'UTC',
    details,
    getAdapter: () => adapter as any,
  });

  assert.deepEqual(result, { success: true, eventId: 'event-1' });
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].session_id, 'session-1');
});

test('booking serializes simultaneous requests for the same session', async () => {
  let releaseBooking!: () => void;
  const bookingGate = new Promise<void>(resolve => { releaseBooking = resolve; });
  const details = {
    title: 'Consultation',
    visitorName: 'Visitor',
    visitorPhone: '+919415072638',
    startTime: '2026-06-20T10:00:00Z',
    endTime: '2026-06-20T10:30:00Z',
  };
  const db = {
    from(table: string) {
      if (table === 'appointments') {
        const builder: any = {
          select: () => builder,
          eq: async () => ({ data: [], error: null }),
          insert: async () => ({ error: null }),
        };
        return builder;
      }
      if (table === 'calendar_connections') return queryResult({ provider: 'google' });
      throw new Error(`Unexpected table ${table}`);
    },
  };
  const adapter = {
    async checkAvailability() {
      return [{ start: details.startTime, end: details.endTime }];
    },
    async bookAppointment() {
      await bookingGate;
      return { eventId: 'event-1' };
    },
  };
  const input = {
    db,
    ownerId: 'owner-1',
    botId: 'bot-1',
    sessionId: 'session-concurrent',
    timezone: 'UTC',
    details,
    getAdapter: () => adapter as any,
  };

  const firstBooking = bookCalendarAppointment(input);
  await assert.rejects(bookCalendarAppointment(input), /already in progress/);
  releaseBooking();
  await firstBooking;
});

test('calendar tool errors retain replacement slots for the conversation', () => {
  const error: any = new Error('Requested slot is unavailable');
  error.slots = [{ start: '2026-06-20T11:00:00Z', end: '2026-06-20T11:30:00Z' }];

  assert.deepEqual(serializeCalendarToolError(error), {
    error: 'Requested slot is unavailable',
    slots: error.slots,
  });
});
