import type { Metadata } from 'next';
import { UserWizard } from '@/components/setup/user-wizard';

export const metadata: Metadata = {
  title: 'DietLedger - Welcome',
};

export default function WelcomePage() {
  return <UserWizard />;
}
