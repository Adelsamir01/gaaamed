package com.dedos.game;

import android.app.Application;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewOutcomeReceiver;
import androidx.webkit.WebViewStartUpConfig;
import androidx.webkit.WebViewStartUpResult;
import androidx.webkit.WebViewStartupException;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Starts Chromium's expensive initialization as early as Android allows.
 *
 * Dedos needs a WebView immediately, so MainActivity does not wait for this
 * callback. Work completed between Application.onCreate and activity inflation
 * still comes off the launch-critical UI thread on supported WebView versions.
 */
public class DedosApplication extends Application {
    private static final String TAG = "DedosWebViewStartup";
    private ExecutorService webViewStartupExecutor;

    @Override
    public void onCreate() {
        super.onCreate();
        webViewStartupExecutor = Executors.newSingleThreadExecutor();
        WebViewStartUpConfig config = new WebViewStartUpConfig.Builder(webViewStartupExecutor).build();
        WebViewCompat.startUpWebView(
            this,
            config,
            new WebViewOutcomeReceiver<WebViewStartUpResult, WebViewStartupException>() {
                @Override
                public void onResult(@NonNull WebViewStartUpResult result) {
                    Log.d(TAG, "WebView background startup completed");
                    shutdownExecutor();
                }

                @Override
                public void onError(@NonNull WebViewStartupException error) {
                    Log.w(TAG, "WebView background startup was unavailable", error);
                    shutdownExecutor();
                }
            }
        );
    }

    private void shutdownExecutor() {
        if (webViewStartupExecutor != null) {
            webViewStartupExecutor.shutdown();
            webViewStartupExecutor = null;
        }
    }
}
