const DEFAULT_TIMEZONE = 'Asia/Kolkata';

type TimezoneResolver = () => string | undefined;

const browserTimezone: TimezoneResolver = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone;

export function resolveVisitorTimezone(
  resolveTimezone: TimezoneResolver = browserTimezone,
): string {
  try {
    return resolveTimezone()?.trim() || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function createChatReplyBody(
  sessionId: string,
  userMessage: string,
  resolveTimezone?: TimezoneResolver,
) {
  return {
    sessionId,
    userMessage,
    timezone: resolveVisitorTimezone(resolveTimezone),
  };
}

