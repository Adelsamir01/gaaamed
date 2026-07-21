import { Capacitor, registerPlugin } from "@capacitor/core";
import { useEffect } from "react";

interface GameDisplayPlugin {
  enterLandscape(): Promise<void>;
  exitLandscape(): Promise<void>;
}

const gameDisplay = registerPlugin<GameDisplayPlugin>("GameDisplay");

export function useBankDisplayMode(): void {
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      void gameDisplay.enterLandscape().catch(() => undefined);
      return () => {
        void gameDisplay.exitLandscape().catch(() => undefined);
      };
    }

    void enterBrowserLandscape();
    return () => {
      exitBrowserLandscape();
    };
  }, []);
}

export async function enterBrowserLandscape(): Promise<void> {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.();
    }
  } catch {
    // Fullscreen still requires a user gesture in some mobile browsers.
  }

  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: "landscape") => Promise<void>;
    };
    await orientation.lock?.("landscape");
  } catch {
    // Browser orientation locking is optional; Android uses the native plugin.
  }
}

function exitBrowserLandscape(): void {
  try {
    screen.orientation.unlock?.();
  } catch {
    // Some browsers do not expose orientation unlock.
  }

  if (document.fullscreenElement) {
    void document.exitFullscreen?.().catch(() => undefined);
  }
}
