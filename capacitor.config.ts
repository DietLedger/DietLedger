import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nutrilabel.app',
  appName: 'NutriLabel',
  webDir: 'out', // Next.js static export output directory
  server: {
    // No server needed - all static files
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      backgroundColor: '#1a1a1a',
      showSpinner: false,
    },
  },
};

export default config;
