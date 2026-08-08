function readVint(buffer: Buffer, offset: number): { value: number; length: number } | null {
  const first = buffer[offset];
  if (first === undefined || first === 0) return null;
  let length = 1;
  let mask = 0x80;
  while (length <= 8 && (first & mask) === 0) { length++; mask >>= 1; }
  if (length > 8 || offset + length > buffer.length) return null;
  let value = first & (mask - 1);
  for (let i = 1; i < length; i++) value = value * 256 + buffer[offset + i];
  return { value, length };
}

function findBytes(buffer: Buffer, bytes: number[]): number {
  for (let i = 0; i <= buffer.length - bytes.length; i++) {
    let matches = true;
    for (let j = 0; j < bytes.length; j++) if (buffer[i + j] !== bytes[j]) { matches = false; break; }
    if (matches) return i;
  }
  return -1;
}

function webmDuration(buffer: Buffer): number | null {
  let timecodeScale = 1_000_000;
  const scaleIndex = findBytes(buffer, [0x2a, 0xd7, 0xb1]);
  if (scaleIndex >= 0) {
    const size = readVint(buffer, scaleIndex + 3);
    if (size && size.value > 0 && size.value <= 8) {
      timecodeScale = 0;
      const start = scaleIndex + 3 + size.length;
      for (let i = 0; i < size.value; i++) timecodeScale = timecodeScale * 256 + buffer[start + i];
    }
  }
  const durationIndex = findBytes(buffer, [0x44, 0x89]);
  if (durationIndex >= 0) {
    const size = readVint(buffer, durationIndex + 2);
    if (size && [4, 8].includes(size.value)) {
      const start = durationIndex + 2 + size.length;
      const raw = size.value === 4 ? buffer.readFloatBE(start) : buffer.readDoubleBE(start);
      const seconds = raw * timecodeScale / 1_000_000_000;
      if (Number.isFinite(seconds) && seconds > 0) return seconds;
    }
  }

  // MediaRecorder WebM files often omit the Duration element. Derive it from
  // cluster and block timecodes so long recordings are not treated as 10s.
  const clusterMarker = Buffer.from([0x1f, 0x43, 0xb6, 0x75]);
  let clusterOffset = buffer.indexOf(clusterMarker);
  let maxTimecode = 0;
  while (clusterOffset >= 0) {
    const nextCluster = buffer.indexOf(clusterMarker, clusterOffset + 4);
    const clusterEnd = nextCluster >= 0 ? nextCluster : buffer.length;
    let clusterTimecode = 0;
    const timecodeElement = buffer.indexOf(Buffer.from([0xe7]), clusterOffset + 4);
    if (timecodeElement >= 0 && timecodeElement < Math.min(clusterEnd, clusterOffset + 128)) {
      const size = readVint(buffer, timecodeElement + 1);
      if (size && size.value > 0 && size.value <= 8) {
        const start = timecodeElement + 1 + size.length;
        for (let i = 0; i < size.value; i++) clusterTimecode = clusterTimecode * 256 + buffer[start + i];
      }
    }
    let blockOffset = buffer.indexOf(Buffer.from([0xa3]), clusterOffset + 4);
    while (blockOffset >= 0 && blockOffset < clusterEnd) {
      const size = readVint(buffer, blockOffset + 1);
      if (size) {
        const payload = blockOffset + 1 + size.length;
        const track = readVint(buffer, payload);
        if (track && payload + track.length + 2 <= buffer.length) {
          const relative = buffer.readInt16BE(payload + track.length);
          maxTimecode = Math.max(maxTimecode, clusterTimecode + relative);
        }
        blockOffset = buffer.indexOf(Buffer.from([0xa3]), payload + Math.max(1, size.value));
      } else {
        blockOffset = buffer.indexOf(Buffer.from([0xa3]), blockOffset + 1);
      }
    }
    clusterOffset = nextCluster;
  }
  const derivedSeconds = maxTimecode * timecodeScale / 1_000_000_000;
  return derivedSeconds > 0 ? derivedSeconds : null;
}

function mp4Duration(buffer: Buffer): number | null {
  const marker = Buffer.from('mvhd');
  const index = buffer.indexOf(marker);
  if (index < 0 || index + 28 >= buffer.length) return null;
  const version = buffer[index + 4];
  const timescaleOffset = version === 1 ? index + 24 : index + 16;
  const durationOffset = version === 1 ? index + 28 : index + 20;
  const timescale = buffer.readUInt32BE(timescaleOffset);
  const duration = version === 1
    ? Number(buffer.readBigUInt64BE(durationOffset))
    : buffer.readUInt32BE(durationOffset);
  return timescale > 0 && duration > 0 ? duration / timescale : null;
}

export function detectMediaDuration(buffer: Buffer, mimeType: string): number | null {
  try {
    const seconds = mimeType.includes('webm') ? webmDuration(buffer)
      : (mimeType.includes('mp4') || mimeType.includes('quicktime')) ? mp4Duration(buffer)
      : null;
    return seconds ? Math.max(1, Math.ceil(seconds)) : null;
  } catch {
    return null;
  }
}
