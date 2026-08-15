'use client';

import { useAuth } from '@/hooks/use-auth';
import { useInstanceState } from '@/hooks/use-instance';
import { useAppSettings } from '@/hooks/use-settings';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import AppNav from '@/components/app-nav';
import AppBreadcrumbs from '@/components/breadcrumbs';
import { BreadcrumbProvider } from '@/components/breadcrumb-context';

const PUBLIC_ROUTES = ['/share', '/community'];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(route + '/'));
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { data: instance, isLoading: instanceLoading } = useInstanceState();
  // Per-user settings (incl. onboardingComplete) only matter once authed.
  const { data: settings, isLoading: settingsLoading } = useAppSettings({ enabled: isAuthenticated });
  const router = useRouter();
  const pathname = usePathname();
  const isPublic = isPublicRoute(pathname);
  // Admins already configured profile + preferences during instance setup, so
  // they skip the per-user welcome flow.
  const needsUserOnboarding =
    isAuthenticated && !user?.isAdmin && !isPublic && !settingsLoading && !!settings && !settings.onboardingComplete;

  useEffect(() => {
    if (isLoading || instanceLoading) return;
    // Instance not yet set up — route every (app) visitor to the setup wizard.
    if (!instance?.onboardingComplete) {
      router.replace('/setup');
      return;
    }
    if (!isAuthenticated && !isPublic) {
      router.replace('/login');
      return;
    }
    if (needsUserOnboarding) {
      router.replace('/welcome');
    }
  }, [isLoading, instanceLoading, isAuthenticated, isPublic, instance, needsUserOnboarding, router]);

  if (isLoading || instanceLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-stone-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (!instance?.onboardingComplete) {
    return null;
  }

  if (!isAuthenticated && !isPublic) {
    return null;
  }

  // Authed non-admin mid-onboarding (redirecting to /welcome).
  if (needsUserOnboarding) {
    return null;
  }

  if (!isAuthenticated && isPublic) {
    return <div className="min-h-screen flex flex-col bg-stone-50">{children}</div>;
  }

  return (
    <BreadcrumbProvider>
      <div className="min-h-screen flex flex-col bg-stone-50">
        <AppNav />
        <AppBreadcrumbs />
        <div className="flex-1">
          {children}
        </div>
      </div>
    </BreadcrumbProvider>
  );
}
