export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function text(value: unknown, label: string, max = 255): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new HttpError(400, `${label} inválido.`);
  return value.trim();
}
export function integer(value: unknown, label: string, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new HttpError(400, `${label} deve estar entre ${min} e ${max}.`);
  return parsed;
}
export function passwordError(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 12) return 'A senha deve ter ao menos 12 caracteres.';
  if (Buffer.byteLength(value, 'utf8') > 72) return 'A senha deve ter no máximo 72 bytes em UTF-8.';
  return null;
}
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
