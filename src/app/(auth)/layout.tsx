import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'DietLedger - Sign In',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      {children}
    </div>
  );
}
