'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Download, X, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  const isStandalone = typeof window !== 'undefined' && 
    window.matchMedia('(display-mode: standalone)').matches;

  useEffect(() => {
    if (isStandalone) return;

    // Listen for the beforeinstallprompt event
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Show prompt after a short delay
      const timer = setTimeout(() => setShowPrompt(true), 3000);
      return () => clearTimeout(timer);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Listen for successful install
    const installedHandler = () => {
      setShowPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, [isStandalone]);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShowPrompt(false);
  }, [deferredPrompt]);

  if (isStandalone || !showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 bg-white border border-emerald-200 rounded-xl shadow-lg p-4 animate-in slide-in-from-bottom-4">
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-100 shrink-0">
          <Smartphone className="w-5 h-5 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-stone-900">Install NutriLabel</p>
          <p className="text-xs text-stone-500 mt-0.5">
            Add to your home screen for quick access, even offline.
          </p>
        </div>
        <button
          onClick={() => setShowPrompt(false)}
          className="text-stone-400 hover:text-stone-600 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex gap-2 mt-3">
        <Button
          onClick={handleInstall}
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 flex-1 gap-1.5"
        >
          <Download className="w-3.5 h-3.5" />
          Install App
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowPrompt(false)}
          className="text-stone-500"
        >
          Not now
        </Button>
      </div>
    </div>
  );
}
