import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize, KeyboardStyle } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'com.dedos.game',
  appName: 'ديدوس',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    Keyboard: {
      resize: KeyboardResize.Native,
      style: KeyboardStyle.Dark,
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      // The app renders its own clickable notification while foregrounded.
      // Keep native banners and sounds for background/lock-screen delivery only.
      presentationOptions: [],
    },
  },
};

export default config;
