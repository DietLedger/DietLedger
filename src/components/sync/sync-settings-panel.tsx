'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Server, Wifi, WifiOff, AlertTriangle, RefreshCw } from 'lucide-react';
import { useSyncStore } from '@/lib/sync-store';
import type { SyncServerConfig, SyncStatus } from '@/lib/types';

function StatusBadge({ status, error }: { status: SyncStatus | null; error?: string | null }) {
  if (status === 'syncing') {
    return <span className="flex items-center gap-1 text-xs text-blue-600"><RefreshCw className="w-3 h-3 animate-spin" />Syncing</span>;
  }
  if (status === 'error' || error) {
    return <span className="flex items-center gap-1 text-xs text-red-600"><WifiOff className="w-3 h-3" />{error || 'Error'}</span>;
  }
  if (status === 'conflict') {
    return <span className="flex items-center gap-1 text-xs text-amber-600"><AlertTriangle className="w-3 h-3" />Conflicts</span>;
  }
  if (status === 'success') {
    return <span className="flex items-center gap-1 text-xs text-emerald-600"><Wifi className="w-3 h-3" />Connected</span>;
  }
  return <span className="flex items-center gap-1 text-xs text-stone-400"><Server className="w-3 h-3" />Not synced</span>;
}

export default function SyncSettingsPanel() {
  const { servers, loadServers, addServer, updateServer, removeServer, syncServer, initialSync, syncingServerId } = useSyncStore();
  const [addOpen, setAddOpen] = useState(false);
  const [editServer, setEditServer] = useState<SyncServerConfig | null>(null);

  React.useEffect(() => { loadServers(); }, [loadServers]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-stone-700">Sync Servers</h3>
          <p className="text-xs text-stone-400 mt-1">
            Configure servers to synchronize your data across devices.
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1">
              <Plus className="w-3.5 h-3.5" />Add Server
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Sync Server</DialogTitle>
            </DialogHeader>
            <ServerForm
              onSave={async (config) => {
                await addServer(config);
                setAddOpen(false);
                initialSync(config.id);
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {servers.length === 0 && (
        <div className="text-center py-8 text-stone-400">
          <Server className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No sync servers configured</p>
          <p className="text-xs mt-1">Add a server to sync your data across devices</p>
        </div>
      )}

      {servers.map((server) => (
        <div key={server.id} className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-stone-500" />
              <span className="font-medium text-sm">{server.label || server.serverUrl}</span>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={syncingServerId === server.id ? 'syncing' : server.lastSyncStatus} error={server.lastSyncError} />
              <Switch
                checked={server.enabled}
                onCheckedChange={(checked) => updateServer({ ...server, enabled: checked, updatedAt: new Date().toISOString() })}
              />
            </div>
          </div>

          <div className="text-xs text-stone-400 space-y-0.5">
            <p>URL: {server.serverUrl}</p>
            {server.lastSyncedAt && (
              <p>Last synced: {new Date(server.lastSyncedAt).toLocaleString()}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-xs"
              onClick={() => syncServer(server.id)}
              disabled={!server.enabled || !server.apiKey || syncingServerId === server.id}
            >
              <RefreshCw className={`w-3 h-3 ${syncingServerId === server.id ? 'animate-spin' : ''}`} />
              Sync Now
            </Button>
            <Dialog open={editServer?.id === server.id} onOpenChange={(open) => { if (!open) setEditServer(null); }}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setEditServer(server)}>
                  Edit
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Sync Server</DialogTitle>
                </DialogHeader>
                <ServerForm
                  server={server}
                  onSave={async (config) => {
                    await updateServer(config);
                    setEditServer(null);
                  }}
                />
              </DialogContent>
            </Dialog>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-red-600 hover:text-red-700"
              onClick={() => removeServer(server.id)}
            >
              Remove
            </Button>
          </div>

          {server.enabled && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-stone-500">Auto-sync interval</Label>
                <span className="text-xs text-stone-400">
                  {server.syncIntervalMinutes === 0 ? 'Manual only' : `Every ${server.syncIntervalMinutes} min`}
                </span>
              </div>
              <Slider
                value={[server.syncIntervalMinutes]}
                onValueChange={([val]) => updateServer({ ...server, syncIntervalMinutes: val, updatedAt: new Date().toISOString() })}
                min={0}
                max={60}
                step={5}
                className="w-full"
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function validateServerUrl(url: string): string | null {
  if (!url) return null;
  if (url.startsWith('https://')) return null;
  if (url.startsWith('http://')) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') return null;
    } catch {}
    return 'Insecure connection. Use https:// to encrypt your data.';
  }
  return null;
}

function ServerForm({
  server,
  onSave,
}: {
  server?: SyncServerConfig;
  onSave: (config: SyncServerConfig) => Promise<void>;
}) {
  const [label, setLabel] = useState(server?.label || '');
  const [serverUrl, setServerUrl] = useState(server?.serverUrl || '');
  const [apiKey, setApiKey] = useState(server?.apiKey || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [registering, setRegistering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'existing' | 'register'>(server ? 'existing' : 'register');
  const [urlError, setUrlError] = useState<string | null>(null);

  const checkUrl = (url: string) => {
    setUrlError(validateServerUrl(url));
  };

  const handleRegister = async () => {
    const base = serverUrl.replace(/\/$/, '');
    const error = validateServerUrl(base);
    if (error) {
      setUrlError(error);
      return;
    }
    setRegistering(true);
    try {
      const base = serverUrl.replace(/\/$/, '');
      const res = await fetch(`${base}/api/sync/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          deviceName: navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop',
          deviceType: 'browser',
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        try {
          const json = JSON.parse(text);
          throw new Error(json.error || `Registration failed (${res.status})`);
        } catch {
          throw new Error(`Registration failed (${res.status}): ${text}`);
        }
      }
      const json = await res.json();
      const data = json.data || json;
      setApiKey(data.apiKey);
      setMode('existing');

      const config: SyncServerConfig = {
        id: server?.id || crypto.randomUUID(),
        label: label || base,
        serverUrl: base,
        apiKey: data.apiKey,
        userId: data.userId,
        deviceId: data.deviceId,
        enabled: true,
        autoSync: true,
        syncIntervalMinutes: 5,
        lastSyncedAt: null,
        lastSyncStatus: null,
        lastSyncError: null,
        createdAt: server?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await onSave(config);
    } catch (err) {
      alert(String(err));
    } finally {
      setRegistering(false);
    }
  };

  const handleSave = async () => {
    const base = serverUrl.replace(/\/$/, '');
    const error = validateServerUrl(base);
    if (error) {
      setUrlError(error);
      return;
    }
    setSaving(true);
    try {
      const base = serverUrl.replace(/\/$/, '');
      const config: SyncServerConfig = {
        id: server?.id || crypto.randomUUID(),
        label: label || base,
        serverUrl: base,
        apiKey,
        userId: server?.userId || '',
        deviceId: server?.deviceId || crypto.randomUUID(),
        enabled: true,
        autoSync: true,
        syncIntervalMinutes: 5,
        lastSyncedAt: server?.lastSyncedAt || null,
        lastSyncStatus: server?.lastSyncStatus || null,
        lastSyncError: null,
        createdAt: server?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await onSave(config);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm">Label</Label>
        <Input placeholder="My Sync Server" value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1" />
      </div>
      <div>
        <Label className="text-sm">Server URL</Label>
        <Input placeholder="https://sync.example.com" value={serverUrl} onChange={(e) => { setServerUrl(e.target.value); checkUrl(e.target.value); }} className="mt-1" />
        {urlError && <p className="text-xs text-red-600 mt-1">{urlError}</p>}
      </div>

      {!server && !apiKey && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button variant={mode === 'register' ? 'default' : 'outline'} size="sm" onClick={() => setMode('register')}>
              Register New Account
            </Button>
            <Button variant={mode === 'existing' ? 'default' : 'outline'} size="sm" onClick={() => setMode('existing')}>
              Use Existing API Key
            </Button>
          </div>

          {mode === 'register' && (
            <>
              <div>
                <Label className="text-sm">Email</Label>
                <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-sm">Password</Label>
                <Input type="password" placeholder="Choose a password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1" />
              </div>
              <Button onClick={handleRegister} disabled={registering || !serverUrl || !email || !password || !!urlError} className="w-full">
                {registering ? 'Registering...' : 'Register & Connect'}
              </Button>
            </>
          )}
        </div>
      )}

      {(mode === 'existing' || apiKey) && (
        <div>
          <Label className="text-sm">API Key</Label>
          <Input type="password" placeholder="dl_..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="mt-1" />
        </div>
      )}

      <Button onClick={handleSave} disabled={saving || !serverUrl || !apiKey || !!urlError} className="w-full">
        {saving ? 'Saving...' : 'Save Server'}
      </Button>
    </div>
  );
}
