import { test, expect } from '@playwright/test';
import { csvCell, csvRow } from '../src/csv';
test('CSV escapes formulas, semicolons, quotes and multiline names', () => {
  expect(csvCell('=1+1')).toBe('"\'=1+1"');
  expect(csvCell(' \t@SUM(A1)')).toBe('"\' \t@SUM(A1)"');
  expect(csvCell('a;"b"\nc')).toBe('"a;""b""\nc"');
  expect(csvRow(['Name', false, 3])).toBe('"Name";"false";"3"\n');
});
