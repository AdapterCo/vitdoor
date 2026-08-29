import { prisma } from './prisma.js';
import { refreshFeed } from './rssService.js';
import { bumpScreenManifestVersions } from './manifest.js';
import { sendManifestToScreen } from './websocket.js';

const REFRESH_INTERVAL_MS = 15 * 60_000;

/** Atualiza todos os feeds RSS em uso pelos rodapés de layout e, quando o
 *  conteúdo muda, incrementa a versão do manifesto e notifica as telas afetadas. */
export async function runRssRefreshTick(): Promise<void> {
  try {
    const layouts = await prisma.layout.findMany({ select: { id: true, canvasConfigJson: true } });
    const feedToLayoutIds = new Map<string, Set<string>>();
    for (const layout of layouts) {
      let config: any;
      try {
        config = JSON.parse(layout.canvasConfigJson);
      } catch {
        continue;
      }
      if (config?.ticker?.mode !== 'RSS') continue;
      for (const theme of config.ticker.themes ?? []) {
        if (typeof theme?.url !== 'string') continue;
        if (!feedToLayoutIds.has(theme.url)) feedToLayoutIds.set(theme.url, new Set());
        feedToLayoutIds.get(theme.url)!.add(layout.id);
      }
    }
    if (feedToLayoutIds.size === 0) return;

    const changedLayoutIds = new Set<string>();
    for (const [url, layoutIds] of feedToLayoutIds) {
      const changed = await refreshFeed(url);
      if (changed) for (const id of layoutIds) changedLayoutIds.add(id);
    }
    if (changedLayoutIds.size === 0) return;

    const screens = await prisma.screen.findMany({
      where: { activeLayoutId: { in: [...changedLayoutIds] } },
      select: { id: true }
    });
    const ids = screens.map((screen) => screen.id);
    if (!ids.length) return;
    await bumpScreenManifestVersions(ids);
    for (const id of ids) await sendManifestToScreen(id);
  } catch (error) {
    console.error('RSS refresh tick falhou:', error);
  }
}

export function startRssRefreshJob(): void {
  void runRssRefreshTick();
  setInterval(() => void runRssRefreshTick(), REFRESH_INTERVAL_MS);
}
