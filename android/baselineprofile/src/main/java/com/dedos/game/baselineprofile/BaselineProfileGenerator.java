package com.dedos.game.baselineprofile;

import android.os.SystemClock;

import androidx.benchmark.macro.junit4.BaselineProfileRule;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

import kotlin.Unit;

@RunWith(AndroidJUnit4.class)
public class BaselineProfileGenerator {
    private static final String PACKAGE_NAME = "com.dedos.game";

    @Rule
    public BaselineProfileRule baselineProfileRule = new BaselineProfileRule();

    @Test
    public void criticalUserJourney() {
        baselineProfileRule.collect(
            PACKAGE_NAME,
            15,
            3,
            null,
            true,
            scope -> {
                scope.pressHome();
                scope.startActivityAndWait();
                // Allow Capacitor, the WebView bridge, and the first React frame
                // to complete so their native launch paths enter the profile.
                SystemClock.sleep(1_500);
                return Unit.INSTANCE;
            }
        );
    }
}
