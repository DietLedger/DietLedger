import type { Metadata } from 'next';
import { SetupWizard } from '@/components/setup/setup-wizard';

export const metadata: Metadata = {
  title: 'DietLedger - Setup',
};

export default function SetupPage() {
  return <SetupWizard />;
}
