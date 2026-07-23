package com.dedos.game.baselineprofile;

import androidx.benchmark.macro.StartupTimingMetric;
import androidx.benchmark.macro.junit4.MacrobenchmarkRule;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.Arrays;

import kotlin.Unit;

@RunWith(AndroidJUnit4.class)
public class StartupBenchmark {
    private static final String PACKAGE_NAME = "com.dedos.game";

    @Rule
    public MacrobenchmarkRule benchmarkRule = new MacrobenchmarkRule();

    @Test
    public void startup() {
        benchmarkRule.measureRepeated(
            PACKAGE_NAME,
            Arrays.asList(new StartupTimingMetric()),
            8,
            scope -> {
                scope.pressHome();
                scope.startActivityAndWait();
                return Unit.INSTANCE;
            }
        );
    }
}
