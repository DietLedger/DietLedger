import AppNav from '@/components/app-nav';
import AppBreadcrumbs from '@/components/breadcrumbs';
import { BreadcrumbProvider } from '@/components/breadcrumb-context';

export default function AppLayout({ children }: { children: React.ReactNode }) {
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
