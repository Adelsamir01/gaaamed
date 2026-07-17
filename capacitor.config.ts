import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dedos.game',
  appName: 'ديدوس',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
    allowMixedContent: true,
  },
};

export default config;
