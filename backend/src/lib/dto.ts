export function tenantDto(tenant: any) {
  return pick(tenant, ['id', 'name', 'slug', 'logoUrl', 'brandColor', 'maxScreens', 'unlimitedScreens', 'maxStorageMb', 'status', 'createdAt', 'updatedAt', '_count']);
}

export function mediaDto(media: any) {
  if (!media) return null;
  const result = pick(media, ['id', 'folderId', 'name', 'type', 'url', 'thumbnailUrl', 'durationSeconds', 'sizeBytes', 'tags', 'validUntil', 'mimeType', 'version', 'ctaJson', 'createdAt', 'updatedAt']);
  if (typeof result.ctaJson === 'string') { try { result.cta = JSON.parse(result.ctaJson); } catch { result.cta = null; } delete result.ctaJson; }
  if (typeof result.sizeBytes === 'bigint') result.sizeBytes = Number(result.sizeBytes);
  return result;
}

export function mediaFolderDto(folder: any) {
  return {
    ...pick(folder, ['id', 'name', 'createdAt', 'updatedAt']),
    ...(folder?._count ? { _count: pick(folder._count, ['medias']) } : {})
  };
}

export function playerMediaDto(media: any) {
  if (!media) return null;
  const result = pick(media, ['id', 'name', 'type', 'url', 'thumbnailUrl', 'durationSeconds', 'sizeBytes', 'checksum', 'mimeType', 'version', 'ctaJson']);
  if (typeof result.ctaJson === 'string') { try { result.cta = JSON.parse(result.ctaJson); } catch { result.cta = null; } delete result.ctaJson; }
  if (typeof result.sizeBytes === 'bigint') result.sizeBytes = Number(result.sizeBytes);
  return result;
}

export function layoutDto(layout: any) {
  if (!layout) return null;
  return {
    ...pick(layout, ['id', 'name', 'description', 'orientation', 'canvasConfigJson', 'isTemplate', 'createdAt', 'updatedAt']),
    ...(Array.isArray(layout.screens) ? { screens: layout.screens.map((screen: any) => pick(screen, ['id', 'name'])) } : {})
  };
}

export function playerLayoutDto(layout: any) {
  if (!layout) return null;
  let canvasConfig: any = null;
  try { canvasConfig = JSON.parse(layout.canvasConfigJson); } catch { canvasConfig = null; }
  return {
    ...pick(layout, ['id', 'name', 'description', 'orientation', 'updatedAt']),
    canvasConfig
  };
}

export function playlistDto(playlist: any, forPlayer = false) {
  if (!playlist) return null;
  return {
    ...pick(playlist, ['id', 'name', 'description', 'category', 'isLoop', 'createdAt', 'updatedAt']),
    ...(Array.isArray(playlist.screens) ? { screens: playlist.screens.map((screen: any) => pick(screen, ['id', 'name'])) } : {}),
    ...(Array.isArray(playlist.items) ? {
      items: playlist.items.map((item: any) => ({
        ...pick(item, ['id', 'mediaId', 'layoutId', 'orderIndex', 'durationSeconds']),
        media: forPlayer ? playerMediaDto(item.media) : mediaDto(item.media),
        layout: forPlayer ? playerLayoutDto(item.layout) : layoutDto(item.layout)
      }))
    } : {})
  };
}

export function screenDto(screen: any) {
  return {
    ...pick(screen, ['id', 'name', 'paired', 'orientation', 'resolution', 'ipAddress', 'locationName', 'groupName', 'status', 'lastPing', 'volume', 'storageFreeMb', 'ramUsagePercent', 'cpuUsagePercent', 'appVersion', 'currentMediaName', 'lastScreenshotUrl', 'activePlaylistId', 'activeLayoutId', 'manifestVersion', 'createdAt', 'updatedAt']),
    ...(screen.activePlaylist ? { activePlaylist: pick(screen.activePlaylist, ['id', 'name']) } : {}),
    ...(screen.activeLayout ? { activeLayout: pick(screen.activeLayout, ['id', 'name']) } : {})
  };
}

export function campaignDto(campaign: any) {
  return {
    ...pick(campaign, ['id', 'name', 'advertiserName', 'playlistId', 'startDate', 'endDate', 'daysOfWeek', 'startTime', 'endTime', 'priority', 'maxImpressions', 'currentImpressions', 'status', 'createdAt', 'updatedAt']),
    ...(campaign.playlist ? { playlist: pick(campaign.playlist, ['id', 'name']) } : {})
  };
}

export function alertDto(alert: any) {
  if (!alert) return null;
  return {
    ...pick(alert, ['id', 'title', 'message', 'alertType', 'active', 'durationSeconds', 'createdAt']),
    ...(Array.isArray(alert.targets) ? { screenIds: alert.targets.map((target: any) => target.screenId) } : {})
  };
}

function pick(value: any, keys: string[]): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key of keys) if (value?.[key] !== undefined) result[key] = value[key];
  return result;
}
