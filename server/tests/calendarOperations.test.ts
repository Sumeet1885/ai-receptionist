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

// Relative to "today" rather than a hardcoded literal, so these fixtures never silently drift
// into the past as real time passes (which is exactly what broke the old hardcoded 2026-06-20
// fixture once that date rolled by - see the maxBookingDaysAhead window guard below).
function isoDateDaysFromNow(daysFromNow: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

test('availability uses the trusted owner id with the connected provider adapter', async () => {
  const calls: any[] = [];
  const db = {
    from(table: string) {
      assert.equal(table, 'calendar_connections');
      return queryResult({ provider: 'google' });
    },
  };
  const date = isoDateDaysFromNow(7);
  const slots = [{ start: `${date}T10:00:00Z`, end: `${date}T10:30:00Z` }];
  const adapter = {
    async checkAvailability(date: string, ownerId: string, timezone?: string) {
      calls.push([date, ownerId, timezone]);
      return slots;
    },
  };

  const result = await checkCalendarAvailability({
    db,
    ownerId: 'owner-1',
    date,
    timezone: 'Asia/Kolkata',
    getAdapter: () => adapter as any,
  });

  assert.deepEqual(result, slots);
  assert.deepEqual(calls, [[date, 'owner-1', 'Asia/Kolkata']]);
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
        startTime: `${isoDateDaysFromNow(7)}T10:00:00Z`,
        endTime: `${isoDateDaysFromNow(7)}T10:30:00Z`,
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
  const bookingDate = isoDateDaysFromNow(7);
  const details = {
    title: 'Consultation',
    visitorName: 'Visitor',
    visitorPhone: '+919415072638',
    startTime: `${bookingDate}T10:00:00Z`,
    endTime: `${bookingDate}T10:30:00Z`,
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
  const bookingDate = isoDateDaysFromNow(7);
  const details = {
    title: 'Consultation',
    visitorName: 'Visitor',
    visitorPhone: '+919415072638',
    startTime: `${bookingDate}T10:00:00Z`,
    endTime: `${bookingDate}T10:30:00Z`,
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

test('calendar auth failures are converted into an owner action message', () => {
  const error: any = new Error('invalid_grant');
  error.code = 400;
  error.response = { data: { error: 'invalid_grant' } };

  assert.deepEqual(serializeCalendarToolError(error), {
    error: 'The business calendar connection has expired or was revoked. Please ask the business owner to reconnect Google Calendar before checking availability.',
    actionRequired: 'reconnect_calendar',
  });
});

test('checkCalendarAvailability rejects a date past the owner-configured booking window', async () => {
  const db = { from: () => queryResult({ provider: 'google' }) };
  const adapter = { checkAvailability: async () => { throw new Error('adapter must not be called'); } };

  await assert.rejects(
    checkCalendarAvailability({
      db,
      ownerId: 'owner-1',
      date: isoDateDaysFromNow(31),
      timezone: 'UTC',
      maxBookingDaysAhead: 30,
      getAdapter: () => adapter as any,
    }),
    /can only be booked up to 30 day\(s\) ahead/,
  );
});

test('checkCalendarAvailability rejects a date in the past regardless of any configured window', async () => {
  const db = { from: () => queryResult({ provider: 'google' }) };
  const adapter = { checkAvailability: async () => { throw new Error('adapter must not be called'); } };

  await assert.rejects(
    checkCalendarAvailability({
      db,
      ownerId: 'owner-1',
      date: isoDateDaysFromNow(-1),
      timezone: 'UTC',
      getAdapter: () => adapter as any,
    }),
    /in the past/,
  );
});

test('checkCalendarAvailability allows a date inside the configured window and an unlimited window by default', async () => {
  const db = { from: () => queryResult({ provider: 'google' }) };
  const slots = [{ start: 'x', end: 'y' }];
  const adapter = { checkAvailability: async () => slots };

  const withinWindow = await checkCalendarAvailability({
    db,
    ownerId: 'owner-1',
    date: isoDateDaysFromNow(10),
    timezone: 'UTC',
    maxBookingDaysAhead: 30,
    getAdapter: () => adapter as any,
  });
  assert.deepEqual(withinWindow, slots);

  const farOutWithNoLimit = await checkCalendarAvailability({
    db,
    ownerId: 'owner-1',
    date: isoDateDaysFromNow(400),
    timezone: 'UTC',
    getAdapter: () => adapter as any,
  });
  assert.deepEqual(farOutWithNoLimit, slots);
});

test('bookCalendarAppointment rejects a startTime past the owner-configured booking window', async () => {
  const db = {
    from(table: string) {
      if (table === 'appointments') {
        const builder: any = { select: () => builder, eq: async () => ({ data: [], error: null }) };
        return builder;
      }
      if (table === 'calendar_connections') return queryResult({ provider: 'google' });
      throw new Error(`Unexpected table ${table}`);
    },
  };
  const farDate = isoDateDaysFromNow(31);

  await assert.rejects(
    bookCalendarAppointment({
      db,
      ownerId: 'owner-1',
      botId: 'bot-1',
      sessionId: 'session-window',
      timezone: 'UTC',
      maxBookingDaysAhead: 30,
      details: {
        title: 'Consultation',
        visitorName: 'Visitor',
        visitorPhone: '+919415072638',
        startTime: `${farDate}T10:00:00Z`,
        endTime: `${farDate}T10:30:00Z`,
      },
      getAdapter: () => { throw new Error('adapter must not be called'); },
    }),
    /can only be booked up to 30 day\(s\) ahead/,
  );
});
