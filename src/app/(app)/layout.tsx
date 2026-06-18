'use client';

import { useAuth } from '@/hooks/use-auth';
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
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isPublic = isPublicRoute(pathname);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isPublic) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, isPublic, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-stone-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated && !isPublic) {
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
