'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import { authenticatedFetch, getApiAuthHeaders } from '@/lib/api-auth';
import { authenticatedPrincipalID, sessionGeneration } from '@/lib/auth-session';

const endpoint = '/api/personal-keys';
const grants = [
  ['profiles:read', 'Read person profiles'], ['profiles:write', 'Manage profiles (deleting a profile removes its diary and measurements)'],
  ['diary:read', 'Read food diary'], ['diary:write', 'Add, edit, and delete diary entries'],
  ['weight:read', 'Read weight and clinical measurements'], ['weight:write', 'Add, edit, and delete weight and clinical measurements'],
  ['catalog:read', 'Read the food catalog'], ['catalog:live', 'Use your configured USDA credential for live search (also needs catalog read)'],
  ['custom-foods:read', 'Read your custom foods and storage defaults'], ['custom-foods:write', 'Manage custom foods and storage defaults (edits to published foods are visible to others)'],
  ['meal-plans:read', 'Read meal plans, grocery lists, and pantry staples'], ['meal-plans:write', 'Manage meal plans, grocery lists, and pantry staples'],
  ['recipes:read', 'Read recipes and categories'], ['recipes:write', 'Manage recipes, ingredients, categories on recipes, and cooked status'],
  ['books:read', 'Read books, chapters, and pages'], ['books:write', 'Manage books, chapters, and pages'],
  ['sharing:read', 'Read shares visible to your account'], ['sharing:publish', 'Publish or change visibility of your own shares'],
  ['transfer:export', 'Export or back up your content, including permitted dependencies and selected profile/plan records'],
  ['transfer:import', 'Import, replace, and repair your own content and dependencies'],
  ['preferences:read', 'Read preferences and location'], ['preferences:write', 'Change preferences and location'],
  ['design:read', 'Read templates and brand kits'], ['design:write', 'Manage personal templates and brand kits'],
  ['dietary:read', 'Read dietary criteria and assessments'], ['dietary:write', 'Manage dietary profiles and allergen rules'],
] as const;

type PersonalKey = { id: string; name: string; scopes: string[]; expiresAt: string };

function PersonalKeysPanel({ account }: { account: string }) {
  const [keys, setKeys] = useState<PersonalKey[]>([]);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [scopes, setScopes] = useState<string[]>([]);
  const [secret, setSecret] = useState<{ value: string; generation: number } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const active = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const clearSecret = useCallback(() => { setSecret(null); setCopyStatus(''); }, []);

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await authenticatedFetch(endpoint, { signal, cache: 'no-store' });
      if (!response.ok) throw new Error();
      const body = await response.json();
      if (!signal.aborted && authenticatedPrincipalID() === account) setKeys(body.data);
    } catch {
      if (!signal.aborted && authenticatedPrincipalID() === account) setError('Could not load personal keys. Try reloading this page.');
    }
  }, [account]);

  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    void load(controller.signal);
    window.addEventListener('pagehide', clearSecret);
    window.addEventListener('dietledger:unauthorized', clearSecret);
    return () => {
      active.current = null;
      controller.abort();
      window.removeEventListener('pagehide', clearSecret);
      window.removeEventListener('dietledger:unauthorized', clearSecret);
    };
  }, [clearSecret, load]);

  async function mutate(method: 'POST' | 'DELETE', id?: string) {
    const signal = active.current?.signal;
    if (busy.current || !signal || signal.aborted) return;
    const generation = sessionGeneration();
    const isCurrent = () => !signal.aborted && authenticatedPrincipalID() === account && generation === sessionGeneration();
    if (!isCurrent()) { setError('Sign in to DietLedger web to manage keys.'); return; }
    const headers = getApiAuthHeaders();
    if (!headers.Authorization) { setError('Sign in to DietLedger web to manage keys.'); return; }
    busy.current = true;
    setPending(true);
    setError('');
    clearSecret();
    try {
      // Never automatically resend an issuance or revocation, including after a 401.
      const response = await fetch(id ? `${endpoint}/${encodeURIComponent(id)}` : endpoint, {
        method, headers: { ...headers, 'Content-Type': 'application/json', 'X-CSRF-Token': 'dietledger' },
        ...(method === 'POST' ? { body: JSON.stringify({ name: name.trim(), scopes, password }) } : {}),
        credentials: 'omit', redirect: 'error', cache: 'no-store', signal,
      });
      if (!isCurrent()) return;
      if (!response.ok) {
        const message = response.status === 401 ? 'Session expired. Sign in to DietLedger web and try again.'
          : response.status === 403 ? 'A trusted HTTPS web session is required. Check your password when creating a key.'
          : response.status === 409 ? 'Key limit reached. Revoke a stored key before creating another.'
          : response.status === 429 ? 'Too many attempts. Wait before trying again.' : 'Could not confirm the key change. Check the list before trying again.';
        setError(message);
        if (response.status !== 401) await load(signal);
        return;
      }
      if (method === 'POST') {
        const body = await response.json();
        if (!isCurrent()) return;
        if (typeof body.data?.key !== 'string') throw new Error();
        setSecret({ value: body.data.key, generation });
        setName('');
        setScopes([]);
      }
      await load(signal);
    } catch {
      if (isCurrent()) {
        setError('Could not confirm the key change. Check the list before trying again. If a new key was created but not shown, revoke it.');
        await load(signal);
      }
    } finally {
      busy.current = false;
      if (!signal.aborted) {
        setPassword('');
        setPending(false);
      }
    }
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() && password && scopes.length) void mutate('POST');
  }

  const full = scopes.length === grants.length;
  const visibleKey = secret?.generation === sessionGeneration() ? secret.value : null;
  return (
    <div className="max-w-3xl space-y-6">
      <p>Use a key to connect an independent client to this account. Keys expire after 90 days. Use a separate key per client and revoke keys you no longer need.</p>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {visibleKey && (
        <section aria-label="One-time key" className="space-y-3 rounded border p-4">
          <p>Copy your key now. It won&apos;t be shown again. Your clipboard may keep a copy.</p>
          <code className="block break-all">{visibleKey}</code>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={async () => {
              try { await navigator.clipboard.writeText(visibleKey); setCopyStatus('Copied'); }
              catch { setCopyStatus('Copy failed. You can select and copy the key manually.'); }
            }}>Copy key</Button>
            <Button type="button" variant="outline" onClick={clearSecret}>Hide key</Button>
          </div>
          {copyStatus && <p role="status">{copyStatus}</p>}
        </section>
      )}
      <form className="space-y-4 rounded border p-4" onSubmit={create}>
        <Label htmlFor="personal-key-name">Key name</Label>
        <Input id="personal-key-name" required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
        <fieldset className="space-y-2" disabled={pending}>
          <legend className="font-medium">Access</legend>
          <label className="flex items-start gap-2"><input type="checkbox" checked={full} onChange={(event) => setScopes(event.target.checked ? grants.map(([id]) => id) : [])} />Full personal access</label>
          <p className="text-sm text-muted-foreground">Includes clinical data, record deletions, sharing and transfer. It never grants account deletion, personal wipes, credential management, or admin actions.</p>
          <details>
            <summary>Choose individual permissions</summary>
            <div className="space-y-1 pt-2">
              {grants.map(([id, label]) => <label key={id} className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={scopes.includes(id)} onChange={(event) => setScopes((old) => event.target.checked ? [...old, id] : old.filter((scope) => scope !== id))} />{label}
              </label>)}
            </div>
          </details>
        </fieldset>
        <Label htmlFor="personal-key-password">Current password</Label>
        <Input id="personal-key-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        <Button type="submit" disabled={pending || !name.trim() || !password || !scopes.length}>Create key</Button>
      </form>
      <section className="space-y-2" aria-label="Stored personal keys">
        <h2 className="text-lg font-semibold">Stored keys</h2>
        {keys.length === 0 ? <p>No personal keys.</p> : <ul className="space-y-2">{keys.map((key) => (
          <li key={key.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3">
            <div>
              <p className="font-medium">{key.name}</p>
              <p className="text-sm text-muted-foreground">Expires {new Date(key.expiresAt).toLocaleDateString()} · {key.scopes.length} permissions</p>
            </div>
            <Button type="button" variant="destructive" disabled={pending} aria-label={`Revoke ${key.name}`} onClick={() => {
              if (window.confirm('Revoke this key and disconnect any clients using it?')) void mutate('DELETE', key.id);
            }}>Revoke</Button>
          </li>
        ))}</ul>}
      </section>
    </div>
  );
}

export default function PersonalKeysPage() {
  const { user } = useAuth();
  return <main className="space-y-4 p-6">
    <h1 className="text-2xl font-bold">Personal API keys</h1>
    {user?.id && <PersonalKeysPanel key={user.id} account={user.id} />}
  </main>;
}
