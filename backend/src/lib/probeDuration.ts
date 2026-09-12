import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
export async function probeDuration(filename: string): Promise<number | null> {
  try {
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filename], { timeout: 10_000, maxBuffer: 64 * 1024, windowsHide: true });
    const seconds = Math.ceil(Number(stdout.trim()));
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch { console.warn('Não foi possível detectar a duração; usando o valor informado.'); return null; }
}
