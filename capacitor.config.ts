import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dietledger.app',
  appName: 'DietLedger',
  webDir: 'out', // Next.js static export output directory
  server: {
    // No server needed - all static files
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      backgroundColor: '#FBF6EE',
      showSpinner: false,
    },
  },
};

export default config;
