package co.median.android;

import android.app.ActivityManager;
import android.content.ComponentCallbacks2;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Message;
import android.util.Base64;
import android.widget.Toast;

import android.app.Application;

import androidx.annotation.RequiresApi;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.preference.PreferenceManager;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import android.util.Log;

import co.median.core.bridge.BridgeModule;
import co.median.core.bridge.PluginLoader;
import co.median.core.bridge.PluginRegistry;
import co.median.core.lifecycle.ActivityHost;
import co.median.core.lifecycle.ApplicationHost;
import co.median.core.util.GNLog;

/**
 * Created by weiyin on 9/2/15.
 * Copyright 2014 GoNative.io LLC
 */
public class GoNativeApplication extends Application {

    private final String CUSTOM_CSS_FILE = "customCSS.css";
    private final String CUSTOM_JS_FILE = "customJS.js";
    private final String ANDROID_CUSTOM_CSS_FILE = "androidCustomCSS.css";
    private final String ANDROID_CUSTOM_JS_FILE = "androidCustomJS.js";

    private WebViewPool webViewPool;
    private Message webviewMessage;
    private GoNativeWindowManager goNativeWindowManager;
    private boolean isFirstLaunch = false;

    private final static String TAG = GoNativeApplication.class.getSimpleName();

    // median-core plugin lifecycle hub (replaces the legacy Bridge). Plugins register into the
    // shared PluginRegistry; the registry is empty until plugins are migrated to median-core.
    private ActivityHost activityHost;

    private boolean appBackgrounded = false;

    private String customCss;
    private String customJs;

    @Override
    public void onCreate() {
        super.onCreate();

        // GeckoView content, GPU and crash helper processes run no app code
        if (!isMainProcess()) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // App theme setup for API 31 and above
            setupAppTheme();
        }

        AppCompatDelegate.setCompatVectorFromResourcesEnabled(true);

        PluginLoader.INSTANCE.loadAll();
        StringBuilder registered = new StringBuilder();
        for (BridgeModule m : PluginRegistry.INSTANCE.allModules()) {
            if (registered.length() > 0) registered.append(", ");
            registered.append(m.getId());
        }
        Log.i(TAG, "Plugins registered via ServiceLoader: [" + registered + "]");
        this.activityHost = new ActivityHost(PluginRegistry.INSTANCE);
        new ApplicationHost(PluginRegistry.INSTANCE).onApplicationCreate(this);

        String configError = MedianConfig.get().getLoadError();
        if (configError != null) {
            Toast.makeText(this, "Invalid appConfig json", Toast.LENGTH_LONG).show();
            GNLog.getInstance().logError(TAG, "AppConfig error: " + configError);
        }

        // some global webview setup
        WebViewSetup.setupWebviewGlobals(this);

        webViewPool = new WebViewPool();

        goNativeWindowManager = new GoNativeWindowManager();

        // load custom CSS and JS files
        loadCustomCssFiles();
        loadCustomJSFiles();

        SharedPreferences sharedPreferences = PreferenceManager.getDefaultSharedPreferences(this);
        if (!sharedPreferences.getBoolean("hasLaunched", false)) {
            isFirstLaunch = true;
            sharedPreferences.edit().putBoolean("hasLaunched", true).apply();
        }
    }

    private boolean isMainProcess() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return getPackageName().equals(Application.getProcessName());
        }
        ActivityManager am = (ActivityManager) getSystemService(ACTIVITY_SERVICE);
        if (am == null || am.getRunningAppProcesses() == null) return true;
        for (ActivityManager.RunningAppProcessInfo info : am.getRunningAppProcesses()) {
            if (info.pid == android.os.Process.myPid()) return getPackageName().equals(info.processName);
        }
        return true;
    }

    @RequiresApi(api = Build.VERSION_CODES.S)
    private void setupAppTheme() {
        // Note: Devices running on API 31 and above use UiModeManager#setApplicationNightMode to set the theme.
        // This setting remains persistent and does not need to be applied every time the app starts.

        String configAppTheme = ThemeUtils.getConfigAppTheme(this);

        if (ThemeUtils.isInitialAppThemeSet(this)) return; // Theme already set, do nothing

        ThemeUtils.setAppThemeApi31AndAbove(this, configAppTheme);
        ThemeUtils.initialAppThemeSet(this);
    }

    public ActivityHost getActivityHost() {
        return activityHost;
    }

    public WebViewPool getWebViewPool() {
        return webViewPool;
    }

    public Message getWebviewMessage() {
        return webviewMessage;
    }

    public void setWebviewMessage(Message webviewMessage) {
        this.webviewMessage = webviewMessage;
    }

    public Map<String, Object> getAnalyticsProviderInfo() {
        return activityHost.getAnalyticsProviderInfo();
    }

    public GoNativeWindowManager getWindowManager() {
        return goNativeWindowManager;
    }

    @Override
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        if (level == ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN) {
            // App has gone into the background
            setAppBackgrounded(true);
        }
    }

    public boolean isAppBackgrounded() {
        return appBackgrounded;
    }

    public void setAppBackgrounded(boolean appBackgrounded) {
        this.appBackgrounded = appBackgrounded;
    }

    private void loadCustomCssFiles() {
        boolean hasCustomCSS = MedianConfig.get().getConfigRoot().getStyling().getHasCustomCSS();
        boolean hasAndroidCustomCSS = MedianConfig.get().getConfigRoot().getStyling().getHasAndroidCustomCSS();
        if (!hasCustomCSS && !hasAndroidCustomCSS) return;

        List<String> filePaths = new ArrayList<>();
        // read customCSS.css file
        if(hasCustomCSS) {
            filePaths.add(CUSTOM_CSS_FILE);
        }
        // read android customCSS.css file
        if(hasAndroidCustomCSS){
            filePaths.add(ANDROID_CUSTOM_CSS_FILE);
        }
        if(filePaths.size() == 0) return;
        try {
            this.customCss = Base64.encodeToString(readAssetsToString(filePaths).getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);
        } catch (Exception ex) {
            GNLog.getInstance().logError(TAG, "Error loading custom CSS files", ex);
        }
    }

    private void loadCustomJSFiles() {
        boolean hasCustomJS = MedianConfig.get().getConfigRoot().getScript().getHasCustomJS();
        boolean hasAndroidCustomJS = MedianConfig.get().getConfigRoot().getScript().getHasAndroidCustomJS();
        if (!hasCustomJS && !hasAndroidCustomJS) return;

        List<String> filePaths = new ArrayList<>();
        // read customJS file
        if(hasCustomJS){
            filePaths.add(CUSTOM_JS_FILE);
        }
        // read android customJS file
        if(hasAndroidCustomJS){
            filePaths.add(ANDROID_CUSTOM_JS_FILE);
        }
        if(filePaths.size() == 0) return;
        try {
            this.customJs = Base64.encodeToString(readAssetsToString(filePaths).getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);
        } catch (Exception ex) {
            GNLog.getInstance().logError(TAG, "Error loading custom JS files", ex);
        }
    }

    public String getCustomCss() {
        return customCss;
    }

    public String getCustomJs() {
        return customJs;
    }

    private String readAssetsToString(List<String> paths) {
        StringBuilder builder = new StringBuilder();
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        for (String path : paths) {
            try {
                IOUtils.copy(new BufferedInputStream(this.getAssets().open(path)), baos);
                builder.append(baos);
                baos.reset();
            } catch (IOException ioe) {
                GNLog.getInstance().logError(TAG, "Error reading " + path, ioe);
            }
        }
        IOUtils.close(baos);
        return builder.toString();
    }

    public boolean isFirstLaunch() {
        return isFirstLaunch;
    }
}
