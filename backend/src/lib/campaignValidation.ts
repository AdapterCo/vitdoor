import { HttpError, text, integer } from './validation.js';
export function validateCampaign(input: any) {
  const date = (value: any, end = false) => {
    const str = value instanceof Date ? value.toISOString().slice(0, 10) : typeof value === 'string' ? value.slice(0, 10) : '';
    const parsed = new Date(`${str}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== str) throw new HttpError(400, 'Data invalida.');
    return end ? new Date(parsed.getTime() + 86400000 - 1) : parsed;
  };
  const startDate = date(input.startDate), endDate = date(input.endDate, true);
  if (endDate < startDate) throw new HttpError(400, 'Data final anterior a inicial.');
  const startTime = input.startTime ?? '00:00', endTime = input.endTime ?? '23:59';
  if (![startTime, endTime].every(t => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t))) throw new HttpError(400, 'Horario invalido.');
  const daysOfWeek = input.daysOfWeek ?? '0,1,2,3,4,5,6';
  if (typeof daysOfWeek !== 'string' || !/^[0-6](,[0-6])*$/.test(daysOfWeek) || new Set(daysOfWeek.split(',')).size !== daysOfWeek.split(',').length) throw new HttpError(400, 'Dias da semana invalidos.');
  const status = input.status ?? 'ACTIVE';
  if (!['ACTIVE', 'INACTIVE', 'PAUSED', 'EXPIRED', 'COMPLETED'].includes(status)) throw new HttpError(400, 'Status invalido.');
  const timezone = input.timezone ?? 'America/Sao_Paulo';
  try { if (typeof timezone !== 'string' || timezone.length > 100) throw new Error(); new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { throw new HttpError(400, 'Fuso horario invalido.'); }
  return { name: text(input.name, 'Nome'), advertiserName: input.advertiserName ? text(input.advertiserName, 'Anunciante') : null, playlistId: input.playlistId ? text(input.playlistId, 'Playlist', 36) : null, startDate, endDate, startTime, endTime, daysOfWeek, status, timezone, priority: integer(input.priority ?? 1, 'Prioridade', 1, 1000), maxImpressions: input.maxImpressions == null || input.maxImpressions === '' ? null : integer(input.maxImpressions, 'Limite', 1, 2147483647) };
}
