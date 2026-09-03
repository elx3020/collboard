/**
 * End of the ISO week (Sunday 23:59:59.999 UTC) containing `at`.
 *
 * ISO-8601 weeks run Monday to Sunday. UTC throughout, matching the server
 * clock. A consequence worth knowing: a notification read on Sunday evening
 * lives only hours, while one read Monday morning lives nearly seven days.
 * That is inherent to calendar-week retention, not a defect.
 */
export function endOfIsoWeek(at: Date): Date {
  const d = new Date(at.getTime());
  const day = d.getUTCDay(); // 0 = Sunday … 6 = Saturday

  d.setUTCDate(d.getUTCDate() + (day === 0 ? 0 : 7 - day));
  d.setUTCHours(23, 59, 59, 999);

  return d;
}
