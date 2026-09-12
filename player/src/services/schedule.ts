/** Dates are calendar dates in the declared IANA timezone, not browser local time. */
export function campaignIsActive(c: any, now = new Date()): boolean {
  if (c.status && c.status !== 'ACTIVE') return false;
  let parts: Intl.DateTimeFormatPart[];
  try { parts = new Intl.DateTimeFormat('en-CA', { timeZone: c.timezone || 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now); }
  catch { return false; }
  const get = (key: string) => parts.find(p => p.type === key)?.value || '';
  let date = `${get('year')}-${get('month')}-${get('day')}`;
  const time = `${get('hour')}:${get('minute')}`;
  const start = c.startTime || '00:00', end = c.endTime || '23:59';
  if (start > end && time <= end) date = new Date(new Date(`${date}T12:00:00Z`).getTime() - 86400_000).toISOString().slice(0, 10);
  if (date < (c.startDate instanceof Date ? c.startDate.toISOString() : String(c.startDate)).slice(0, 10) || date > (c.endDate instanceof Date ? c.endDate.toISOString() : String(c.endDate)).slice(0, 10)) return false;
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return String(c.daysOfWeek).split(',').includes(String(weekday)) && (start <= end ? time >= start && time <= end : time >= start || time <= end);
}
