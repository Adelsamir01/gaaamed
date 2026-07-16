import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gaaamed.app',
  appName: 'قييمد',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
    allowMixedContent: true,
  },
};

export default config;
