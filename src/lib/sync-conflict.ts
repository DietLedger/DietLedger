export async function computeHash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(data);
  try {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
  }
}

export function computeChecksum(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

export function detectConflict(
  localTimestamp: string,
  remoteTimestamp: string,
  localChecksum: string,
  remoteChecksum: string,
): boolean {
  if (localChecksum === remoteChecksum) return false;
  const localTime = new Date(localTimestamp).getTime();
  const remoteTime = new Date(remoteTimestamp).getTime();
  return Math.abs(localTime - remoteTime) < 1000;
}

export function autoResolve(
  localData: string,
  remoteData: string,
  localTimestamp: string,
  remoteTimestamp: string,
): { resolution: 'local' | 'remote'; data: string } {
  const localTime = new Date(localTimestamp).getTime();
  const remoteTime = new Date(remoteTimestamp).getTime();
  if (localTime >= remoteTime) {
    return { resolution: 'local', data: localData };
  }
  return { resolution: 'remote', data: remoteData };
}

export function mergeFields(
  localObj: Record<string, unknown>,
  remoteObj: Record<string, unknown>,
): Record<string, unknown> | null {
  const merged: Record<string, unknown> = { ...remoteObj };
  const localChanged = new Set<string>();
  const remoteChanged = new Set<string>();

  for (const key of Object.keys(localObj)) {
    if (localObj[key] !== remoteObj[key]) {
      localChanged.add(key);
    }
  }
  for (const key of Object.keys(merged)) {
    if (merged[key] !== localObj[key]) {
      remoteChanged.add(key);
    }
  }

  const overlap = [...localChanged].filter(k => remoteChanged.has(k));
  if (overlap.length > 0) return null;

  for (const key of localChanged) {
    merged[key] = localObj[key];
  }
  return merged;
}
