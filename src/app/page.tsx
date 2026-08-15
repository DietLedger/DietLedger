'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useInstanceState } from '@/hooks/use-instance';
import { useAppSettings } from '@/hooks/use-settings';

export default function HomePage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { data: instance, isLoading: instanceLoading } = useInstanceState();
  const { data: settings, isLoading: settingsLoading } = useAppSettings({ enabled: isAuthenticated });
  const router = useRouter();

  useEffect(() => {
    if (instanceLoading || isLoading) return;
    if (!instance?.onboardingComplete) {
      router.replace('/setup');
      return;
    }
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    // Admins configured everything during setup; skip the welcome flow.
    if (user?.isAdmin) {
      router.replace('/recipes');
      return;
    }
    // Non-admin — wait for settings, then route to welcome if not finished.
    if (settingsLoading) return;
    if (settings && !settings.onboardingComplete) {
      router.replace('/welcome');
    } else {
      router.replace('/recipes');
    }
  }, [isAuthenticated, isLoading, user, instance, instanceLoading, settings, settingsLoading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <div className="text-stone-400 text-sm">Loading...</div>
    </div>
  );
}
