export interface LegacyBrowserCleanupResult {
  reloadRequired: boolean;
}

const isLegacyWorker = (worker: ServiceWorker | null) =>
  worker?.scriptURL === new URL('/sw.js', location.origin).href;

async function acknowledgeRetirement(worker: ServiceWorker | null): Promise<boolean> {
  if (!isLegacyWorker(worker) || !worker?.postMessage || typeof MessageChannel === 'undefined') return false;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (retired: boolean) => {
      clearTimeout(timer);
      channel.port1.close();
      channel.port2.close();
      resolve(retired);
    };
    const timer = setTimeout(() => finish(false), 500);
    channel.port1.onmessage = (event) => finish(event.data?.type === 'DIETLEDGER_RETIRED');
    try { worker.postMessage({ type: 'DIETLEDGER_RETIRE' }, [channel.port2]); }
    catch { finish(false); }
  });
}

async function upgradeLegacyWorker(registration: ServiceWorkerRegistration): Promise<boolean> {
  if (await acknowledgeRetirement(registration.active)) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      registration.update(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Legacy worker update timed out')), 5000); }),
    ]);
  } catch { return false; }
  finally { clearTimeout(timer); }
  // skipWaiting + clients.claim in the tombstone replaces old controllers,
  // including other open tabs. Unregister alone cannot do that.
  const deadline = Date.now() + 5000;
  const checked = new Set<ServiceWorker>();
  while (Date.now() < deadline) {
    const active = registration.active;
    if (active?.state === 'activated' && !checked.has(active)) {
      checked.add(active);
      if (await acknowledgeRetirement(active)) return true;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return false;
}

// Authentication callers should await this on logout/account switch. A true
// result requires reconnecting/closing old tabs; never imply unregister is a purge.
export async function retireLegacyBrowserCache(): Promise<LegacyBrowserCleanupResult> {
  if (typeof window === 'undefined') return { reloadRequired: false };
  let reloadRequired = false;
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const legacy = registrations.filter((registration) => {
        const workers = [registration.active, registration.waiting, registration.installing].filter(Boolean) as ServiceWorker[];
        return registration.scope === new URL('/', location.origin).href &&
          workers.some(isLegacyWorker);
      });
      for (const registration of legacy) {
        const workers = [registration.active, registration.waiting, registration.installing].filter(Boolean) as ServiceWorker[];
        // Do not adopt or unregister a registration being handed to other code.
        if (!workers.every(isLegacyWorker) || !await upgradeLegacyWorker(registration)) reloadRequired = true;
      }
      const controller = navigator.serviceWorker.controller;
      if (isLegacyWorker(controller) && !await acknowledgeRetirement(controller)) reloadRequired = true;
    }
  } catch {
    // If worker inspection failed, we cannot prove that legacy control is gone.
    reloadRequired = true;
  }
  try {
    if ('caches' in window) await caches.delete('dietledger-v1');
  } catch {
    // Browser privacy settings can disable CacheStorage. Do not clear other data.
    reloadRequired = true;
  }
  return { reloadRequired };
}
