const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Compact age of a timestamp: `45s`, `5m`, `2h`, `4d`.
 *
 * Days are the largest unit and are not capped — an unread notification never
 * expires, so `45d` is a legitimate result. Future timestamps (clock skew
 * between server and browser) clamp to `0s` rather than printing a negative.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const seconds = Math.floor((now.getTime() - new Date(iso).getTime()) / 1000);

  if (seconds < MINUTE) return `${Math.max(seconds, 0)}s`;
  if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)}m`;
  if (seconds < DAY) return `${Math.floor(seconds / HOUR)}h`;
  return `${Math.floor(seconds / DAY)}d`;
}
