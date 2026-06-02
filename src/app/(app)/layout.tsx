'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import AppNav from '@/components/app-nav';
import AppBreadcrumbs from '@/components/breadcrumbs';
import { BreadcrumbProvider } from '@/components/breadcrumb-context';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-stone-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
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
