package com.dedos.game;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "GameDisplay")
public class GameDisplayPlugin extends Plugin {
    @PluginMethod
    public void enterLandscape(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (getActivity() instanceof MainActivity) {
                ((MainActivity) getActivity()).enterGameDisplayMode();
            }
            call.resolve(new JSObject());
        });
    }

    @PluginMethod
    public void exitLandscape(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (getActivity() instanceof MainActivity) {
                ((MainActivity) getActivity()).exitGameDisplayMode();
            }
            call.resolve(new JSObject());
        });
    }
}
