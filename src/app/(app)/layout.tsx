import AppNav from '@/components/app-nav';
import AppBreadcrumbs from '@/components/breadcrumbs';
import { BreadcrumbProvider } from '@/components/breadcrumb-context';
import SyncInitializer from '@/components/sync/sync-initializer';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <BreadcrumbProvider>
      <SyncInitializer>
        <div className="min-h-screen flex flex-col bg-stone-50">
          <AppNav />
          <AppBreadcrumbs />
          <div className="flex-1">
            {children}
          </div>
        </div>
      </SyncInitializer>
    </BreadcrumbProvider>
  );
}
