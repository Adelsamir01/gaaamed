package com.dedos.game;

import android.app.GameManager;
import android.app.Activity;
import android.content.Context;
import android.os.Build;
import android.view.Display;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Small Android bridge for renderer decisions. We deliberately do not declare
 * custom Game Mode support in the manifest, so OEM performance interventions
 * remain available while the web games can still respect battery mode.
 */
@CapacitorPlugin(name = "GamePerformance")
public class GamePerformancePlugin extends Plugin {
    @PluginMethod
    public void getProfile(PluginCall call) {
        JSObject result = new JSObject();
        result.put("mode", currentGameMode());
        result.put("refreshRate", currentRefreshRate());
        result.put("lowRamDevice", isLowRamDevice());
        call.resolve(result);
    }

    private String currentGameMode() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return "standard";
        int mode = Api31Impl.getGameMode(getContext());
        if (mode == GameManager.GAME_MODE_PERFORMANCE) return "performance";
        if (mode == GameManager.GAME_MODE_BATTERY) return "battery";
        if (mode == GameManager.GAME_MODE_UNSUPPORTED) return "unsupported";
        return "standard";
    }

    @SuppressWarnings("deprecation")
    private float currentRefreshRate() {
        Display display;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            display = Api30Impl.getDisplay(getActivity());
        } else {
            display = getActivity().getWindowManager().getDefaultDisplay();
        }
        return display != null ? display.getRefreshRate() : 60f;
    }

    private boolean isLowRamDevice() {
        android.app.ActivityManager manager =
            (android.app.ActivityManager) getContext().getSystemService(android.content.Context.ACTIVITY_SERVICE);
        return manager != null && manager.isLowRamDevice();
    }

    private static class Api30Impl {
        static Display getDisplay(Activity activity) {
            return activity.getDisplay();
        }
    }

    private static class Api31Impl {
        static int getGameMode(Context context) {
            GameManager manager = context.getSystemService(GameManager.class);
            return manager != null ? manager.getGameMode() : GameManager.GAME_MODE_STANDARD;
        }
    }
}
