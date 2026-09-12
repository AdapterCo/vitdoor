export function csvCell(value: unknown): string {
  let str = String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(str)) str = "'" + str;
  return '"' + str.replace(/"/g, '""') + '"';
}
export function csvRow(values: unknown[]): string { return values.map(csvCell).join(';') + '\n'; }
