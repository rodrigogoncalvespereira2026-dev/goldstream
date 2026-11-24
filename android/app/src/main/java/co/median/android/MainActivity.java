package co.median.android;

import android.Manifest;
import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ObjectAnimator;
import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.res.Configuration;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.AsyncTask;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Parcel;
import android.telephony.PhoneStateListener;
import android.telephony.SignalStrength;
import android.telephony.TelephonyManager;
import android.text.TextUtils;
import android.util.Log;
import android.view.ContextMenu;
import android.view.KeyEvent;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.view.WindowManager;
import android.view.animation.AccelerateInterpolator;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import android.widget.RelativeLayout;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.ActionBar;
import androidx.appcompat.app.AppCompatActivity;
import androidx.browser.customtabs.CustomTabColorSchemeParams;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.splashscreen.SplashScreenViewProvider;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;

import com.google.android.material.dialog.MaterialAlertDialogBuilder;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.net.CookieHandler;
import java.net.URISyntaxException;
import java.util.Collections;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Stack;
import java.util.UUID;
import java.util.regex.Pattern;

import co.median.android.widget.GoNativeSwipeRefreshLayout;
import co.median.android.widget.MedianProgressView;
import co.median.android.widget.SwipeHistoryNavigationLayout;
import co.median.android.widget.WebViewContainerView;
import co.median.core.bridge.AndroidBridgeModule;
import co.median.core.bridge.AnimatedSplashCompletedListener;
import co.median.core.bridge.BridgeMessage;
import co.median.core.bridge.BridgeModule;
import co.median.core.bridge.CommandResponder;
import co.median.core.bridge.MedianProgressViewItem;
import co.median.core.bridge.MessageRouter;
import co.median.core.bridge.PluginJSInjector;
import co.median.core.bridge.PluginRegistry;
import co.median.core.bridge.commands.AndroidCommandFactory;
import co.median.core.platform.AndroidAppHost;
import co.median.core.platform.AndroidAssetReader;
import co.median.core.webview.GoNativeWebviewInterface;
import co.median.core.config.ConfigObserver;
import co.median.core.config.ContextMenuConfig;
import co.median.core.config.DeepLinkDomainsConfig;
import co.median.core.config.GeneralConfig;
import co.median.core.config.MaxWindowsConfig;
import co.median.core.config.NavigationTitleRule;
import co.median.core.config.nav2.ResolvedNavigation;
import co.median.core.config.ScreenOrientation;
import co.median.core.config.SplashScreenConfig;
import co.median.core.config.SplashScreenPlatformConfig;
import co.median.core.util.GNLog;
import co.median.core.util.LeanUtils;

public class MainActivity extends AppCompatActivity implements
        AndroidAppHost,
        GoNativeSwipeRefreshLayout.OnRefreshListener {
    private static final String webviewDatabaseSubdir = "webviewDatabase";
    private static final String TAG = MainActivity.class.getName();
    public static final String INTENT_TARGET_URL = "targetUrl";
    public static final String EXTRA_WEBVIEW_WINDOW_OPEN = "io.gonative.android.MainActivity.Extra.WEBVIEW_WINDOW_OPEN";
    public static final String EXTRA_IGNORE_INTERCEPT_MAXWINDOWS = "ignoreInterceptMaxWindows";
    private static final int REQUEST_PERMISSION_GENERIC = 199;
    private static final int REQUEST_WEBFORM = 300;
    public static final int REQUEST_WEB_ACTIVITY = 400;
    private static final String ON_RESUME_CALLBACK = "median_app_resumed";
    private static final String ON_RESUME_CALLBACK_GN = "gonative_app_resumed";
    private static final String ON_RESUME_CALLBACK_NPM = "_median_app_resumed";
    private static final String CALLBACK_APP_BROWSER_CLOSED = "median_appbrowser_closed";

    private static final String CONFIGURATION_CHANGED = "configurationChanged";
    private static final String SAVED_STATE_ACTIVITY_ID = "activityId";
    private static final String SAVED_STATE_IS_ROOT = "isRoot";
    private static final String SAVED_STATE_URL_LEVEL = "urlLevel";
    private static final String SAVED_STATE_PARENT_URL_LEVEL = "parentUrlLevel";
    private static final String SAVED_STATE_SCROLL_X = "scrollX";
    private static final String SAVED_STATE_SCROLL_Y = "scrollY";
    private static final String SAVED_STATE_WEBVIEW_STATE = "webViewState";
    private static final String SAVED_STATE_IGNORE_THEME_SETUP = "ignoreThemeSetup";

    private boolean isActivityPaused = false;

    private WebViewContainerView mWebviewContainer;

    private GoNativeWebviewInterface mWebview;
    boolean isPoolWebview = false;
    private Stack<String> backHistory = new Stack<>();

    private View webviewOverlay;
    private String initialUrl;

    private MedianProgressView mProgress;
    private MySwipeRefreshLayout swipeRefreshLayout;
    private SwipeHistoryNavigationLayout swipeNavLayout;
    private RelativeLayout fullScreenLayout;
    private ConnectivityManager cm = null;
    private TabManager tabManager;
    private ActionManager actionManager;
    private SideNavManager sideNavManager;
    private boolean isRoot;
    private boolean webviewIsHidden = false;
    private Handler handler = new Handler();
    private float hideWebviewAlpha = 0.0f;
    private boolean isFirstHideWebview = false;
    private String activityId;

    private final Runnable statusChecker = new Runnable() {
        @Override
        public void run() {
            runOnUiThread(() -> checkReadyStatus());
            handler.postDelayed(statusChecker, 100); // 0.1 sec
        }
    };
    private FileDownloader fileDownloader;
    private FileWriterSharer fileWriterSharer;
    private ConnectivityChangeReceiver connectivityReceiver;
    private KeyboardManager keyboardManager;
    private final MedianPrintManager printManager = new MedianPrintManager(this);
    private BroadcastReceiver webviewLimitReachedReceiver;
    private boolean startedLoading = false; // document readystate checke
    protected String postLoadJavascript;
    protected String postLoadJavascriptForRefresh;
    private Stack<Bundle>previousWebviewStates;
    private LocationServiceHelper locationServiceHelper;
    private ArrayList<PermissionsCallbackPair> pendingPermissionRequests = new ArrayList<>();
    private ArrayList<Intent> pendingStartActivityAfterPermissions = new ArrayList<>();
    private String connectivityCallback;
    private String connectivityOnceCallback;
    private PhoneStateListener phoneStateListener;
    private SignalStrength latestSignalStrength;
    private boolean restoreBrightnessOnNavigation = false;
    private ActivityResultLauncher<String> requestPermissionLauncher;
    private ActivityResultLauncher<Intent> appBrowserActivityLauncher;
    private String deviceInfoCallback = "";
    private boolean flagThemeConfigurationChange = false;
    private boolean isContentReady;
    private SplashScreenViewProvider splashScreenViewProvider;
    private String launchSource;
    private MedianEventsManager eventsManager;
    private String appTheme;
    private String contextMenuUrl;
    private UrlLoader urlLoader;
    private boolean shouldRemoveSplash = false;
    private SystemBarManager systemBarManager;
    private float baseZoomScale = 3f;
    private float currentWebViewZoomScale = -1f;
    // Runtime-resolved swipe-nav enablement (config default, disabled when the OS uses gesture nav).
    // median-core config is immutable, so this mutable state lives shell-side.
    private boolean swipeGesturesEnabled;
    // median.android.swipeGestures.enable() / disable(): app-wide, like V1's AppConfig.swipeGestures,
    // so windows opened later start from it. Null until the page calls it.
    private static Boolean swipeGesturesFromJs;
    // Runtime system-bar overlay flags, seeded from styling.androidEnableOverlayIn* (C3);
    // updated by updateStatusBarOverlay/updateSystemNavBarOverlay.
    private boolean enableOverlayInStatusBar =
            MedianConfig.get().getConfigRoot().getStyling().getAndroidEnableOverlayInStatusBar();
    private boolean enableOverlayInSystemNavBar =
            MedianConfig.get().getConfigRoot().getStyling().getAndroidEnableOverlayInSystemNavBar();
    // nav2: config observer registered in onCreate, removed in onDestroy (A2)
    private ConfigObserver configObserver;
    // nav2: last state applied by applyNav2Navigation — per-activity damping (A1)
    private String lastAppliedNav2Url;
    private ResolvedNavigation lastAppliedNav2;

    public boolean isSwipeGesturesEnabled() {
        return swipeGesturesEnabled;
    }

    public boolean isStatusBarOverlayEnabled() {
        return enableOverlayInStatusBar;
    }

    public boolean isSystemNavBarOverlayEnabled() {
        return enableOverlayInSystemNavBar;
    }

    // True when the OS is in full-screen gesture-navigation mode (port of legacy AppConfig helper).
    private boolean isAndroidGestureEnabled() {
        if (Build.VERSION.SDK_INT < 29) return false;
        try {
            int resourceId = getResources().getIdentifier("config_navBarInteractionMode", "integer", "android");
            if (resourceId > 0) {
                return getResources().getInteger(resourceId) == 2; // 2 = full-screen gestures
            }
            return false;
        } catch (Exception ex) {
            GNLog.getInstance().logError(TAG, "isAndroidGestureEnabled: ", ex);
            return false;
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        GoNativeApplication application = getGNApplication();
        GoNativeWindowManager windowManager = application.getWindowManager();
        this.isRoot = getIntent().getBooleanExtra("isRoot", true);
        this.launchSource = getIntent().getStringExtra("source");
        this.launchSource = TextUtils.isEmpty(this.launchSource) ? "default" : this.launchSource;

        // Splash events
        if (this.isRoot) {

            // always install splash to prevent theme-related crashes, even on configuration changes
            SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
            boolean configChanged = savedInstanceState != null && savedInstanceState.getBoolean(CONFIGURATION_CHANGED, false);

            // splashScreen is keyed by platform in the JSON; read the Android side.
            SplashScreenConfig splash = MedianConfig.get().getConfigRoot().getStyling().getSplashScreen();
            SplashScreenPlatformConfig splashConfig = splash != null ? splash.getAndroid() : null;
            if (splashConfig != null && splashConfig.getAnimated() && !configChanged) {
                splashScreen.setOnExitAnimationListener(provider -> {
                    this.splashScreenViewProvider = provider;

                    // Animated splash is provided by a plugin (e.g. Lottie). Plugins that don't
                    // handle it are no-ops; the listener fires when the owning plugin is done.
                    AnimatedSplashCompletedListener splashListener = () -> {
                        if (this.isContentReady) {
                            this.removeSplashWithAnimation();
                        } else {
                            this.shouldRemoveSplash = true;
                        }
                    };
                    for (BridgeModule module : PluginRegistry.INSTANCE.allModules()) {
                        if (module instanceof AndroidBridgeModule) {
                            ((AndroidBridgeModule) module).animateSplashScreen(this, provider, splashListener);
                        }
                    }

                    new Handler(Looper.getMainLooper()).postDelayed(this::removeSplashWithAnimation, 7000);
                });
            }else {
                splashScreen.setKeepOnScreenCondition(() -> !isContentReady);
                new Handler(Looper.getMainLooper()).postDelayed(this::contentReady, 7000);
            }
        }

        this.systemBarManager = new SystemBarManager(this);

        // Enable edge-to-edge. Must be called after splash setup
        this.systemBarManager.applyEdgeToEdge();

        if (MedianConfig.get().getConfigRoot().getGeneral().getKeepScreenOn()) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }

        this.hideWebviewAlpha  = MedianConfig.get().getConfigRoot().getStyling().getHideWebviewAlpha();

        this.appTheme = ThemeUtils.getConfigAppTheme(this);

        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
            // App theme setup for API 30 and below
            boolean ignoreThemeUpdate = false;
            if (savedInstanceState != null) {
                ignoreThemeUpdate = savedInstanceState.getBoolean(SAVED_STATE_IGNORE_THEME_SETUP, false);
            }

            if (ignoreThemeUpdate) {
                // Ignore app theme setup cause its already called from function setupAppTheme()
                Log.d(TAG, "onCreate: configuration change from setupAppTheme(), ignoring theme setup");
            } else {
                ThemeUtils.setAppThemeApi30AndBelow(appTheme);
            }
        }

        super.onCreate(savedInstanceState);

        this.activityId = UUID.randomUUID().toString();
        int urlLevel = getIntent().getIntExtra("urlLevel", -1);
        int parentUrlLevel = getIntent().getIntExtra("parentUrlLevel", -1);

        if (savedInstanceState != null) {
            this.activityId = savedInstanceState.getString(SAVED_STATE_ACTIVITY_ID, activityId);
            this.isRoot = savedInstanceState.getBoolean(SAVED_STATE_IS_ROOT, isRoot);
            urlLevel = savedInstanceState.getInt(SAVED_STATE_URL_LEVEL, urlLevel);
            parentUrlLevel = savedInstanceState.getInt(SAVED_STATE_PARENT_URL_LEVEL, parentUrlLevel);
        }

        windowManager.addNewWindow(activityId, isRoot);
        windowManager.setUrlLevels(activityId, urlLevel, parentUrlLevel);

        if (MedianConfig.get().getMaxWindows() != null && MedianConfig.get().getMaxWindows().getEnabled()) {
            windowManager.setIgnoreInterceptMaxWindows(activityId, getIntent().getBooleanExtra(EXTRA_IGNORE_INTERCEPT_MAXWINDOWS, false));
        }

        if (isRoot) {
            initialRootSetup();
        }

        this.fileWriterSharer = new FileWriterSharer(this);
        this.fileDownloader = new FileDownloader(this);
        this.eventsManager = new MedianEventsManager(this);

        // register launchers
        this.requestPermissionLauncher = registerForActivityResult(new ActivityResultContracts.RequestPermission(), isGranted -> {
            runGonativeDeviceInfo(deviceInfoCallback, false);
        });
        this.appBrowserActivityLauncher = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(), result -> {
                    String callback = LeanUtils.createJsForCallback(CALLBACK_APP_BROWSER_CLOSED, null);
                    runJavascript(callback);
                });

        this.locationServiceHelper = new LocationServiceHelper(this);

        // webview pools
        application.getWebViewPool().init(this);

        cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);

        setContentView(R.layout.activity_median);
        application.getActivityHost().onCreate(this, isRoot);

        final ViewGroup content = findViewById(android.R.id.content);

        this.systemBarManager.setupWindowInsetsListener(content);

        if(MedianConfig.get().getConfigRoot().getGeneral().getAndroidFullScreen()){
            toggleFullscreen(true);
        }
        // must be done AFTER toggleFullScreen to force screen orientation
        setScreenOrientationPreference();

        this.fullScreenLayout = findViewById(R.id.fullscreen);
        swipeRefreshLayout = findViewById(R.id.swipe_refresh);
        swipeRefreshLayout.setEnabled(MedianConfig.get().getConfigRoot().getNavigation().getAndroidPullToRefresh());
        swipeRefreshLayout.setOnRefreshListener(this);
        swipeRefreshLayout.setCanChildScrollUpCallback(() -> mWebview.getWebViewScrollY() > 10);

        swipeGesturesEnabled = swipeGesturesFromJs != null
                ? swipeGesturesFromJs
                : MedianConfig.get().getConfigRoot().getNavigation().getSwipeGestures();
        if (isAndroidGestureEnabled()) {
            swipeGesturesEnabled = false;
        }
        swipeNavLayout = findViewById(R.id.swipe_history_nav);
        swipeNavLayout.setEnabled(swipeGesturesEnabled);
        swipeNavLayout.setSwipeNavListener(new SwipeHistoryNavigationLayout.OnSwipeNavListener() {
            @Override
            public boolean canSwipeLeftEdge() {
                if (mWebview.getMaxHorizontalScroll() > 0) {
                    if (mWebview.getScrollX() > 0) return false;
                }
                return canGoBack();
            }

            @Override
            public boolean canSwipeRightEdge() {
                if (mWebview.getMaxHorizontalScroll() > 0) {
                    if (mWebview.getScrollX() < mWebview.getMaxHorizontalScroll()) return false;
                }
                return canGoForward();
            }

            @NonNull
            @Override
            public String getGoBackLabel() {
                return "";
            }

            @Override
            public boolean navigateBack() {
                if (swipeGesturesEnabled && canGoBack()) {
                    goBack();
                    return true;
                }
                return false;
            }

            @Override
            public boolean navigateForward() {
                if (swipeGesturesEnabled && canGoForward()) {
                    goForward();
                    return true;
                }
                return false;
            }

            @Override
            public void leftSwipeReachesLimit() {

            }

            @Override
            public void rightSwipeReachesLimit() {

            }

            @Override
            public boolean isSwipeEnabled() {
                return swipeGesturesEnabled;
            }
        });

        swipeRefreshLayout.setColorSchemeColors(ContextCompat.getColor(this, R.color.pull_to_refresh_color));
        swipeNavLayout.setActiveColor(ContextCompat.getColor(this, R.color.pull_to_refresh_color));
        swipeRefreshLayout.setProgressBackgroundColorSchemeColor(ContextCompat.getColor(this, R.color.swipe_nav_background));
        swipeNavLayout.setBackgroundColor(ContextCompat.getColor(this, R.color.swipe_nav_background));

        // Progress indicator setup: use a plugin-provided progress view (e.g. Lottie) if any; else default.
        this.mProgress = findViewById(R.id.progress);
        MedianProgressViewItem progressItem = null;
        for (BridgeModule module : PluginRegistry.INSTANCE.allModules()) {
            if (module instanceof AndroidBridgeModule) {
                progressItem = ((AndroidBridgeModule) module).getProgressView(this);
                if (progressItem != null) break;
            }
        }
        if (progressItem != null) {
            this.mProgress.setProgressView(progressItem);
        } else {
            this.mProgress.setupDefaultProgress();
        }

        // proxy cookie manager for httpUrlConnection (syncs to webview cookies)
        CookieHandler.setDefault(new WebkitCookieManagerProxy());


        this.postLoadJavascript = getIntent().getStringExtra("postLoadJavascript");
        this.postLoadJavascriptForRefresh = this.postLoadJavascript;

        this.previousWebviewStates = new Stack<>();

        // tab navigation
        this.tabManager = new TabManager(this, findViewById(R.id.bottom_navigation));
        tabManager.showTabs(false);

        // actions in action bar
        this.actionManager = new ActionManager(this);
        this.actionManager.setupActionBar(isRoot);

        this.sideNavManager = new SideNavManager(this);
        this.sideNavManager.setupNavigationMenu(isRoot);

        // Hide action bar if showActionBar is FALSE and showNavigationMenu is FALSE
        if (!MedianConfig.get().getConfigRoot().getStyling().getShowActionBar() && !MedianConfig.get().getShowNavigationMenu()) {
            Objects.requireNonNull(getSupportActionBar()).hide();
        }

        // WebView setup
        this.webviewOverlay = findViewById(R.id.webviewOverlay);
        this.mWebviewContainer = this.findViewById(R.id.webviewContainer);
        this.mWebview = this.mWebviewContainer.getWebview();

        this.urlLoader = new UrlLoader(this, !MedianConfig.get().getConfigRoot().getGeneral().getInjectMedianJS());

        this.mWebviewContainer.setupWebview(this, isRoot);
        // Ponte página <-> aviso da música (antes de carregar a página).
        WebAudioBridge.attach(this, this.mWebview);

        if (!MedianConfig.get().getConfigRoot().getServices().getGeckoView().getActive()) {
            // Shows the navigation bars when the user continues scrolling at the end of the page
            // while auto-hide-on-scroll is enabled.
            ((LeanWebView) mWebview).setOnScrollYEndListener(this::slideInNavigationBars);
        }

        setupWebviewTheme(appTheme);

        boolean isWebViewStateRestored = false;
        if (savedInstanceState != null) {
            Bundle webViewStateBundle = savedInstanceState.getBundle(SAVED_STATE_WEBVIEW_STATE);
            if (webViewStateBundle != null) {
                // Restore page and history
                try {
                    mWebview.restoreStateFromBundle(webViewStateBundle);
                    isWebViewStateRestored = true;
                } catch (Exception e) {
                    GNLog.getInstance().logError(TAG, "Failed to restore webview state", e);
                }
            }

            // Restore scroll state
            int scrollX = savedInstanceState.getInt(SAVED_STATE_SCROLL_X, 0);
            int scrollY = savedInstanceState.getInt(SAVED_STATE_SCROLL_Y, 0);
            mWebview.scrollTo(scrollX, scrollY);
        }

        // load url
        String url;

        if (isWebViewStateRestored && !TextUtils.isEmpty(mWebview.getUrl())) {
            // WebView already has loaded URL when function mWebview.restoreStateFromBundle() was called
            url = mWebview.getUrl();
        } else {
            Intent intent = getIntent();
            url = getUrlFromIntent(intent);
            // launched from a link: median-core continues the launch to it
            if (url != null && isRoot) MedianConfig.get().applyLaunchDeeplink(url);

            if (url == null && isRoot) url = MedianConfig.get().getInitialUrl();
            // url from intent (hub and spoke nav)
            if (url == null) url = intent.getStringExtra("url");

            if (url != null) {

                // let plugins add query params to url before loading to WebView
                Map<String, String> queries = application.getActivityHost().getInitialUrlQueryItems(this, isRoot);
                if (queries != null && !queries.isEmpty()) {
                    Uri.Builder builder = Uri.parse(url).buildUpon();
                    for (Map.Entry<String, String> entry : queries.entrySet()) {
                        builder.appendQueryParameter(entry.getKey(), entry.getValue());
                    }
                    url = builder.build().toString();
                }

                this.initialUrl = url;
                this.mWebview.loadUrl(url);
            } else if (isFromWindowOpenRequest()) {
                // no worries, loadUrl will be called when this new web view is passed back to the message
            } else {
                GNLog.getInstance().logError(TAG, "No url specified for MainActivity");
            }
        }

        if (MedianConfig.get().isNativeNavigationV2()) {
            if (url != null) applyNav2Navigation(url);
        } else {
            actionManager.setTitleDisplayForUrl(url, true);

            sideNavManager.showNavigationMenu(isRoot && MedianConfig.get().getShowNavigationMenu());
        }

        this.keyboardManager = new KeyboardManager(this, content);

        // respond to navigation titles processed
        this.configObserver = new ConfigObserver() {
            @Override
            public void onNavigationTitlesChanged() {
                String url = mWebview.getUrl();
                if (url == null) return;
                String title = titleForUrl(url);
                if (title != null) {
                    setTitle(title);
                } else {
                    setupTitleDisplayForUrl(url);
                }
            }

            @Override
            public void onNavigationLevelsChanged() {
                String url = mWebview.getUrl();
                if (url == null) return;
                int level = urlLevelForUrl(url);
                setUrlLevel(level);
            }

            @Override
            public void onNavigationInstanceChanged() {
                // nav2 (2.4.1): fires only on JS-override changes — re-apply for this activity's URL
                String url = mWebview.getUrl();
                if (url == null) return;
                runOnUiThread(() -> applyNav2Navigation(url));
            }
        };
        MedianConfig.get().addObserver(this.configObserver);

        // auto close windows
        this.getGNWindowManager().addMaxWindowsListener(excessWindowId -> {
            if (TextUtils.isEmpty(excessWindowId)) {
                if (!getGNWindowManager().isRoot(activityId)) {
                    finish();
                    return true;
                }
            } else if (excessWindowId.equals(activityId)) {
                finish();
                return true;
            }
            return false;
        });

        validateGoogleService();

        if (MedianConfig.get().getConfigRoot().getServices().getGeckoView().getActive()) {
            // ignore status checking for GeckoView
            this.removeSplashWithAnimation();
        }

        setContextMenuEnabled(MedianConfig.get().getConfigRoot().getContextMenu().getEnabled());

        // Handles back press on Android 13+ when `android:enableOnBackInvokedCallback="true"` is set (required for target SDK 36+)
        getOnBackPressedDispatcher().addCallback(new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (!onConsumeBackPress()) {
                    finish();
                }
            }
        });
    }

    public String getActivityId() {
        return this.activityId;
    }

    private void initialRootSetup() {
        File databasePath = new File(getCacheDir(), webviewDatabaseSubdir);
        if (databasePath.mkdirs()) {
            Log.v(TAG, "databasePath " + databasePath.toString() + " exists");
        }

        // url inspector
        UrlInspector.getInstance().init(this);

        // Register launch
        ConfigUpdater configUpdater = new ConfigUpdater(this);
        configUpdater.registerEvent();
    }

    private String getUrlFromIntent(Intent intent) {
        if (intent == null) return null;
        // first check intent in case it was created from push notification
        String targetUrl = intent.getStringExtra(INTENT_TARGET_URL);
        if (targetUrl != null && !targetUrl.isEmpty()){
            return targetUrl;
        }

        if (Intent.ACTION_VIEW.equals(intent.getAction())) {
            Uri uri = intent.getData();
            if (uri != null && (uri.getScheme().endsWith(".http") || uri.getScheme().endsWith(".https"))) {
                Uri.Builder builder = uri.buildUpon();
                if (uri.getScheme().endsWith(".https")) {
                    builder.scheme("https");
                } else if (uri.getScheme().endsWith(".http")) {
                    builder.scheme("http");
                }
                return builder.build().toString();
            } else {
                return intent.getDataString();
            }
        }

        return null;
    }

    public boolean isFromWindowOpenRequest() {
        return getIntent().getBooleanExtra(EXTRA_WEBVIEW_WINDOW_OPEN, false);
    }

    protected void onPause() {
        super.onPause();
        GoNativeApplication application = getGNApplication();
        application.getActivityHost().onPause(this);
        this.isActivityPaused = true;
        stopCheckingReadyStatus();

        // Ao sair, a música que está a tocar tem de continuar: o serviço segura o WebView
        // (janela sempre visível e sem pausa, senão o Chromium cala o áudio) e mostra o
        // aviso. Aqui fica a rede de segurança, com a atividade ainda visível, para o caso
        // de a página não ter avisado o serviço.
        WebAudioBridge.onHostPause(this);
        BackgroundAudioService.startIfPlaying(this);

        // unregister connectivity
        if (this.connectivityReceiver != null) {
            unregisterReceiver(this.connectivityReceiver);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            CookieManager.getInstance().flush();
        }
    }

    @Override
    protected void onStart() {
        super.onStart();
        getGNApplication().getActivityHost().onStart(this);
        if (MedianConfig.get().getConfigRoot().getPermissions().getEnableWebRTCBluetoothAudio()) {
            AudioUtils.initAudioFocusListener(this);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();

        // De volta à app: o WebView e a página deixam de estar "presos" em segundo plano.
        WebAudioBridge.onHostResume(this);
        // Sem esta permissão (Android 13+) o aviso da música nunca aparece.
        WebAudioBridge.askNotificationPermission(this);

        getGNWindowManager().setCurrentActiveWindowId(activityId);

        GoNativeApplication application = getGNApplication();
        application.setAppBackgrounded(false);
        application.getActivityHost().onResume(this);
        if (this.mWebview != null) this.mWebview.onResume();

        if (isActivityPaused) {
            this.isActivityPaused = false;
            if (MedianConfig.get().getConfigRoot().getGeneral().getInjectMedianJS()) {
                runJavascript(LeanUtils.createJsForCallback(ON_RESUME_CALLBACK, null));
                runJavascript(LeanUtils.createJsForCallback(ON_RESUME_CALLBACK_GN, null));
            } else {
                runJavascript(LeanUtils.createJsForCallback(ON_RESUME_CALLBACK_NPM, null));
            }
        }

        retryFailedPage();
        // register to listen for connectivity changes
        this.connectivityReceiver = new ConnectivityChangeReceiver();
        registerReceiver(this.connectivityReceiver,
                new IntentFilter(ConnectivityManager.CONNECTIVITY_ACTION));

        this.fileDownloader.onAppResume();
    }

    @Override
    protected void onStop() {
        super.onStop();
        getGNApplication().getActivityHost().onStop(this);
        if (isRoot) {
            if (MedianConfig.get().getConfigRoot().getGeneral().getAndroidClearCache()) {
                this.mWebview.clearCache(true);
            }
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        // A2: drop refs from the process-wide config singleton or this activity leaks
        if (this.configObserver != null) {
            MedianConfig.get().removeObserver(this.configObserver);
            this.configObserver = null;
        }
        if (this.sideNavManager != null) {
            this.sideNavManager.teardown();
        }
        GoNativeApplication application = getGNApplication();
        application.getActivityHost().onDestroy(this);
        application.getWindowManager().removeWindow(activityId);

        if (fileDownloader != null) fileDownloader.unbindDownloadService();
        if (isRoot) BackgroundAudioService.stop(this);

        // destroy webview
        if (this.mWebview != null) {
            this.mWebview.stopLoading();
            // must remove from view hierarchy to destroy
            ViewGroup parent = (ViewGroup) this.mWebview.getParent();
            if (parent != null) {
                parent.removeView((View)this.mWebview);
            }
            if (!this.isPoolWebview) {
                this.mWebview.destroy();
            }
        }
    }

    @Override
    public void onSubscriptionChanged() {
        // Registration-endpoints feature dropped in median-core migration.
    }

    @Override
    public void launchNotificationActivity(String extra) {
        Intent mainIntent = new Intent(this, LaunchActivity.class);
        mainIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (extra != null && !extra.isEmpty()) {
            mainIntent.putExtra(INTENT_TARGET_URL, extra);
        }

        startActivity(mainIntent);
    }

    private void retryFailedPage() {
        if (this.mWebview == null) return;

        // skip if webview is currently loading
        if (this.mWebview.getProgress() < 100) return;

        // skip if webview has a page loaded
        String currentUrl = this.mWebview.getUrl();
        if (currentUrl != null && !currentUrl.equals(UrlNavigation.OFFLINE_PAGE_URL)) return;

        // skip if there is nothing in history
        if (this.backHistory.isEmpty()) return;

        // skip if no network connectivity
        if (this.isDisconnected()) return;

        // finally, retry loading the page
        this.loadUrl(this.backHistory.pop());
    }

    @Override
    protected void onRestoreInstanceState(@NonNull Bundle savedInstanceState) {
        super.onRestoreInstanceState(savedInstanceState);
        getGNApplication().getActivityHost().onRestoreInstanceState(this, savedInstanceState);
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {

        outState.putBoolean(CONFIGURATION_CHANGED, true);

        if (mWebview != null) {
            // Saves current WebView's history and URL or loaded page state
            Bundle webViewOutState = new Bundle();
            mWebview.saveStateToBundle(webViewOutState);
            outState.putBundle(SAVED_STATE_WEBVIEW_STATE, webViewOutState);

            // Save other WebView data
            outState.putString(SAVED_STATE_ACTIVITY_ID, activityId);
            outState.putBoolean(SAVED_STATE_IS_ROOT, getGNWindowManager().isRoot(activityId));
            outState.putInt(SAVED_STATE_URL_LEVEL, getGNWindowManager().getUrlLevel(activityId));
            outState.putInt(SAVED_STATE_PARENT_URL_LEVEL, getGNWindowManager().getParentUrlLevel(activityId));
            outState.putInt(SAVED_STATE_SCROLL_X, mWebview.getWebViewScrollX());
            outState.putInt(SAVED_STATE_SCROLL_Y, mWebview.getWebViewScrollY());
        }

        if (flagThemeConfigurationChange) {
            outState.putBoolean(SAVED_STATE_IGNORE_THEME_SETUP, true);
        }

        getGNApplication().getActivityHost().onSaveInstanceState(this, outState);

        if (getBundleSizeInBytes(outState) > 512000) {
            outState.clear();
        }

        super.onSaveInstanceState(outState);
    }

    private int getBundleSizeInBytes(Bundle bundle) {
        Parcel parcel = Parcel.obtain();
        parcel.writeValue(bundle);

        byte[] bytes = parcel.marshall();
        parcel.recycle();
        return bytes.length;
    }

    public void addToHistory(String url) {
        if (url == null) return;

        if (this.backHistory.isEmpty() || !this.backHistory.peek().equals(url)) {
            this.backHistory.push(url);
        }

        checkNavigationForPage(url);

        // this is a little hack to show the webview after going back in history in single-page apps.
        // We may never get onPageStarted or onPageFinished, hence the webview would be forever
        // hidden when navigating back in single-page apps. We do, however, get an updatedHistory callback.
        showWebview(0.3);
    }

    public boolean canGoBack() {
        if (this.mWebview == null) return false;
        return this.mWebview.canGoBack();
    }

    public void goBack() {
        if (this.mWebview == null) return;
        if (LeanWebView.isCrosswalk()) {
            // not safe to do for non-crosswalk, as we may never get a page finished callback
            // for single-page apps
            hideWebview();
        }

        this.mWebview.goBack();
    }

    private boolean canGoForward() {
        return this.mWebview.canGoForward();
    }

    private void goForward() {
        if (LeanWebView.isCrosswalk()) {
            // not safe to do for non-crosswalk, as we may never get a page finished callback
            // for single-page apps
            hideWebview();
        }

        this.mWebview.goForward();
    }

    @Override
    public void sharePage(String optionalUrl, String optionalText) {
        String shareUrl;
        String currentUrl = this.mWebview.getUrl();
        if (TextUtils.isEmpty(optionalUrl)) {
            shareUrl = currentUrl;
        } else {
            try {
                java.net.URI optionalUri = new java.net.URI(optionalUrl);
                if (optionalUri.isAbsolute()) {
                    shareUrl = optionalUrl;
                } else {
                    java.net.URI currentUri = new java.net.URI(currentUrl);
                    shareUrl = currentUri.resolve(optionalUri).toString();
                }
            } catch (URISyntaxException e) {
                shareUrl = optionalUrl;
            }
        }

        if (TextUtils.isEmpty(shareUrl)) return;

        String shareData = TextUtils.isEmpty(optionalText) ? shareUrl : optionalText + System.lineSeparator() + shareUrl;

        Intent share = new Intent(Intent.ACTION_SEND);
        share.setType("text/plain");
        share.putExtra(Intent.EXTRA_TEXT, shareData);
        startActivity(Intent.createChooser(share, getString(R.string.action_share)));
    }

    @Override
    public void loadUrl(String url) {
        if (this.urlLoader != null) urlLoader.loadUrl(url);
    }

    public void loadUrl(String url, Map<String, String> headers) {
        ((WebView) mWebview).loadUrl(url, headers);
    }

    public void logout() {
        this.mWebview.stopLoading();

        // log out by clearing all cookies and going to home page
        clearWebviewCookies();

        updateMenu(false);
        this.mWebview.loadUrl(MedianConfig.get().getInitialUrl());
    }

    public void runJavascript(String javascript) {
        runJavascript(javascript, null);
    }

    @Override
    public void runJavascript(String javascript, ValueCallback<String> callback) {
        if (javascript == null) return;

        if (callback != null) {
            this.mWebview.runJavascript(javascript, callback);
        }
        else {
            this.mWebview.runJavascript(javascript);
        }
    }

    public boolean isDisconnected(){
        NetworkInfo ni = cm.getActiveNetworkInfo();
        return ni == null || !ni.isConnected();
    }

    @Override
    public void clearWebviewCache() {
        mWebview.clearCache(true);
    }

    @Override
    public void clearWebviewCookies() {
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.removeAllCookies(aBoolean -> Log.d(TAG, "clearWebviewCookies: onReceiveValue callback: " + aBoolean));
        AsyncTask.THREAD_POOL_EXECUTOR.execute(cookieManager::flush);
    }

    @Override
    public void hideWebview() {
        getGNApplication().getActivityHost().onHideWebview(this);

        if (MedianConfig.get().getConfigRoot().getStyling().getDisableAnimations()) return;

        this.webviewIsHidden = true;
        mProgress.show();

        if (this.isFirstHideWebview) {
            this.webviewOverlay.setAlpha(1.0f);
        } else {
            this.webviewOverlay.setAlpha(1 - this.hideWebviewAlpha);
        }

        showWebview(10);
    }

    private void showWebview(double delay) {
        if (delay > 0) {
            handler.postDelayed(this::showWebview, (int) (delay * 1000));
        } else {
            showWebview();
        }
    }

    // shows webview with no animation
    public void showWebviewImmediately() {
        this.isFirstHideWebview = false;
        webviewIsHidden = false;
        startedLoading = false;
        stopCheckingReadyStatus();
        this.webviewOverlay.setAlpha(0.0f);
        this.mProgress.hideImmediately();
    }


    @Override
    public void showWebview() {
        this.isFirstHideWebview = false;
        startedLoading = false;

        if (!webviewIsHidden) {
            // don't animate if already visible
            this.mProgress.hideImmediately();
            return;
        }

        webviewIsHidden = false;

        webviewOverlay.animate().alpha(0.0f)
                .setDuration(300)
                .setStartDelay(150);

        this.mProgress.hide();
    }

    public void updatePageTitle() {
        if (MedianConfig.get().getConfigRoot().getNavigation().getUseWebpageTitle()) {
            setTitle(this.mWebview.getTitle());
        }
    }

    @Override
    public void updateMenu(){
        updateMenu(false);
    }

    private void updateMenu(boolean isLoggedIn){

        if (sideNavManager == null) return;
        try {
            if (isLoggedIn)
                sideNavManager.updateMenu("loggedIn");
            else
                sideNavManager.updateMenu("default");
        } catch (Exception e) {
            GNLog.getInstance().logError(TAG, e.getMessage(), e);
        }
    }

    @Override
    protected void onPostCreate(Bundle savedInstanceState) {
        super.onPostCreate(savedInstanceState);
        getGNApplication().getActivityHost().onPostCreate(this, savedInstanceState, isRoot);

        // Sync the toggle state after onRestoreInstanceState has occurred.
        if (sideNavManager != null)
            sideNavManager.toggleSyncState();
    }

    @Override
    public void onConfigurationChanged(@NonNull Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        GoNativeApplication application = (GoNativeApplication)getApplication();

        // Pass any configuration change to the drawer toggles
        if (sideNavManager != null)
            sideNavManager.toggleConfigurationChanged(newConfig);

        getGNApplication().getActivityHost().onConfigurationChanged(this);

        updateTheme(newConfig);
    }

    private void updateTheme(Configuration newConfig) {
        int nightModeFlags = newConfig.uiMode & Configuration.UI_MODE_NIGHT_MASK;
        String style = switch (nightModeFlags) {
            case Configuration.UI_MODE_NIGHT_YES -> "dark";
            case Configuration.UI_MODE_NIGHT_NO -> "light";
            default -> "";
        };

        this.systemBarManager.onThemeChanged(style);
        this.actionManager.onThemeChanged();
        this.tabManager.onThemeChanged();
        this.sideNavManager.onThemeChanged();
        this.setupWebviewTheme(appTheme);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        getGNApplication().getActivityHost().onActivityResult(this, requestCode, resultCode, data);

        if (data != null && data.getBooleanExtra("exit", false))
            finish();

        String url = null;
        boolean success = false;
        if (data != null) {
            url = data.getStringExtra("url");
            success = data.getBooleanExtra("success", false);
        }

        if (requestCode == REQUEST_WEBFORM && resultCode == RESULT_OK) {
            if (url != null)
                loadUrl(url);
            else {
                // go to initialURL without login/signup override
                this.mWebview.setCheckLoginSignup(false);
                this.mWebview.loadUrl(MedianConfig.get().getInitialUrl());
            }

            if (MedianConfig.get().getShowNavigationMenu()) {
                updateMenu(success);
            }
        }

        if (requestCode == REQUEST_WEB_ACTIVITY && resultCode == RESULT_OK) {
            if (url != null) {
                int urlLevel = data.getIntExtra("urlLevel", -1);
                int parentUrlLevel = getGNWindowManager().getParentUrlLevel(activityId);
                if (urlLevel == -1 || parentUrlLevel == -1 || urlLevel > parentUrlLevel) {
                    // open in this activity
                    this.postLoadJavascript = data.getStringExtra("postLoadJavascript");
                    loadUrl(url);
                } else {
                    // urlLevel <= parentUrlLevel, so pass up the chain
                    setResult(RESULT_OK, data);
                    finish();
                }
            }
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        getGNApplication().getActivityHost().onNewIntent(this, intent);
        String url = getUrlFromIntent(intent);
        if (url != null && !url.isEmpty()) {
            if (TextUtils.isEmpty(mWebview.getUrl())) {
                loadUrl(url);
                this.initialUrl  = url;
            } else if (!urlEqualsIgnoreSlash(url, mWebview.getUrl())) {
                urlLoader.loadUrl(url, true);
            }
            return;
        }
        Log.w(TAG, "Received intent without url");
    }

    private boolean urlEqualsIgnoreSlash(String url1, String url2) {
        if (url1 == null || url2 == null) return false;
        if (url1.endsWith("/")) {
            url1 = url1.substring(0, url1.length() - 1);
        }
        if (url2.endsWith("/")) {
            url2 = url2.substring(0, url2.length() - 1);
        }
        if (url1.startsWith("http://")) {
            url1 = "https://" + url1.substring(7);
        }
        return url1.equals(url2);
    }

    private boolean onConsumeBackPress() {
        if (MedianConfig.get().getConfigRoot().getNavigation().getAndroidDisableBackButton()) {
            return true;
        }

        if (this.mWebview.exitFullScreen()) {
            return true;
        }

        if (sideNavManager != null && sideNavManager.isDrawerOpen()) {
            sideNavManager.closeDrawer();
            return true;
        } else if (canGoBack()) {
            goBack();
            return true;
        } else if (!this.previousWebviewStates.isEmpty()) {
            Bundle state = previousWebviewStates.pop();
            LeanWebView webview = new LeanWebView(this);
            webview.restoreStateFromBundle(state);
            switchToWebview(webview, /* isPool */ false, /* isBack */ true);
            return true;
        }

        return false;
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {

        if (keyCode == KeyEvent.KEYCODE_BACK && Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            if (onConsumeBackPress()){
                return true;
            }
        }

        if (getGNApplication().getActivityHost().onKeyDown(keyCode, event)) {
            return true;
        }

        return super.onKeyDown(keyCode, event);
    }

    // isPoolWebView is used to keep track of whether we are showing a pooled webview, which has implications
    // for page navigation, namely notifying the pool to disown the webview.
    // isBack means the webview is being switched in as part of back navigation behavior. If isBack=false,
    // then we will save the state of the old one switched out.
    public void switchToWebview(GoNativeWebviewInterface newWebview, boolean isPoolWebview, boolean isBack) {
        this.mWebviewContainer.setupWebview(this, isRoot);

        // scroll to top
        ((View)newWebview).scrollTo(0, 0);

        View prev = (View)this.mWebview;

        if (!isBack) {
            // save the state for back button behavior
            Bundle stateBundle = new Bundle();
            this.mWebview.saveStateToBundle(stateBundle);
            this.previousWebviewStates.add(stateBundle);
        }

        // replace the current web view in the parent with the new view
        if (newWebview != prev) {
            // a view can only have one parent, and attempting to add newWebview if it already has
            // a parent will cause a runtime exception. So be extra safe by removing it from its parent.
            ViewParent temp = newWebview.getParent();
            if (temp instanceof  ViewGroup) {
                ((ViewGroup) temp).removeView((View)newWebview);
            }

            ViewGroup parent = (ViewGroup) prev.getParent();
            int index = parent.indexOfChild(prev);
            parent.removeView(prev);
            parent.addView((View) newWebview, index);
            ((View)newWebview).setLayoutParams(prev.getLayoutParams());

            // webviews can still send some extraneous events to this activity if we do not remove
            // its callbacks
            WebViewSetup.removeCallbacks((LeanWebView) prev);

            if (!this.isPoolWebview) {
                ((GoNativeWebviewInterface)prev).destroy();
            }
        }

        this.isPoolWebview = isPoolWebview;
        this.mWebview = newWebview;
        WebAudioBridge.attach(this, newWebview);

        if (this.postLoadJavascript != null) {
            runJavascript(this.postLoadJavascript);
            this.postLoadJavascript = null;
        }
    }

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        // Inflate the menu; this adds items to the action bar if it is present.
        getMenuInflater().inflate(R.menu.topmenu, menu);

        if (this.actionManager != null) {
            this.actionManager.addActions(menu);
        }

        return true;
    }

    @Override
    public boolean onOptionsItemSelected(@NonNull MenuItem item) {
        // Pass the event to ActionBarDrawerToggle, if it returns
        // true, then it has handled the app icon touch event

        if (item.getItemId() == android.R.id.home && actionManager != null && actionManager.handleLeftAction()) {
            return true;
        }

        if (sideNavManager != null) {
            if (sideNavManager.isToggleMenuSelected(item)) {
                return true;
            }
        }

        if (item.getItemId() == android.R.id.home) {
            if (this.actionManager != null && this.actionManager.canCloseSearchView()) {
                return true;
            }

            finish();
            return true;
        }

        return super.onOptionsItemSelected(item);
    }

    @Override
    public void onRefresh() {
        refreshPage();
        stopNavAnimation(true, 1000);
    }

    private void stopNavAnimation(boolean isConsumed){
        stopNavAnimation(isConsumed, 100);
    }

    private void stopNavAnimation(boolean isConsumed, int delay){
        // let the refreshing spinner stay for a little bit if the native show/hide is disabled
        // otherwise there isn't enough of a user confirmation that the page is refreshing
        if (isConsumed && MedianConfig.get().getConfigRoot().getStyling().getDisableAnimations()) {
            new Handler().postDelayed(new Runnable() {
                @Override
                public void run() {
                    swipeRefreshLayout.setRefreshing(false);
                }
            }, delay);
        } else {
            this.swipeRefreshLayout.setRefreshing(false);
        }
    }

    public void refreshPage() {
        String url = this.mWebview.getUrl();
        if (url != null && url.equals(UrlNavigation.OFFLINE_PAGE_URL)){
            if (this.mWebview.canGoBack()) {
                getLeanWebView().reloadFromOfflinePage();
            } else if (this.initialUrl != null) {
                this.mWebview.loadUrl(this.initialUrl);
            }
            updateMenu();
        }
        else {
            this.postLoadJavascript = this.postLoadJavascriptForRefresh;
            this.mWebview.loadUrl(url);
        }
    }


    private void contentReady() {
        isContentReady = true;
        stopCheckingReadyStatus();

        if (shouldRemoveSplash) {
            removeSplashWithAnimation();
        }
    }

    private void removeSplashWithAnimation() {
        if (this.splashScreenViewProvider != null) {

            final ObjectAnimator fadeOut = ObjectAnimator.ofFloat(
                    splashScreenViewProvider.getView(),
                    View.ALPHA,
                    1f,
                    0f
            );

            fadeOut.setInterpolator(new AccelerateInterpolator()); // for smooth effect
            fadeOut.setDuration(100L); // duration in milliseconds
            fadeOut.addListener(new AnimatorListenerAdapter() {
                @Override
                public void onAnimationEnd(Animator animation) {
                    // remove splash as page is ready
                    // note: It's important to check again if splashScreenViewProvider is not null
                    // to prevent the app from crashing, as this method may be called consecutively.
                    if (splashScreenViewProvider != null) {
                        splashScreenViewProvider.remove();
                        splashScreenViewProvider = null;
                    }

                    // Reapply the status bar and system nav bar styles after
                    // removing splash to ensure it's applied correctly.
                    updateStatusBarStyle(MedianConfig.get().getConfigRoot().getStyling().getAndroidStatusBarStyle());
                    updateSystemNavBarStyle(MedianConfig.get().getConfigRoot().getStyling().getAndroidSystemNavBarStyle());
                }
            });

            fadeOut.start();
        }
    }

    // Native Navigation V2: resolve the instance for [url] and feed the existing managers.
    private void applyNav2Navigation(String url) {
        ResolvedNavigation resolved = MedianConfig.get().resolveNavigationForUrl(url);
        if (resolved == null) return;

        // A1: per-activity damping — skip re-render when this webview's URL and resolved
        // state (instance id + components + JS overrides) are unchanged; the title still refreshes
        if (url.equals(lastAppliedNav2Url) && resolved.equals(lastAppliedNav2)) {
            if (this.actionManager != null) this.actionManager.setTitleDisplayForUrl(url, true);
            return;
        }
        lastAppliedNav2Url = url;
        lastAppliedNav2 = resolved;

        boolean sidebarActive = SideNavManager.isNav2SidebarShown(resolved.getSidebarNavigationBar());

        if (this.sideNavManager != null) {
            this.sideNavManager.applyNav2(resolved.getSidebarNavigationBar());
        }

        if (this.actionManager != null) {
            this.actionManager.applyNav2(url, resolved.getTopNavigationBar(), sidebarActive);
        }

        if (this.tabManager != null) {
            this.tabManager.applyNav2(url, resolved.getBottomTabBar());
        }

        // nav2 TODO: contextualNavToolbar not rendered — the Android shell has no contextual
        // toolbar component (V1 toolbarNavigation was never ported to this shell).
    }

    // onPageFinished
    @Override
    public void checkNavigationForPage(String url) {
        // don't change anything on navigation if the url that just finished was a file download
        if (url.equals(this.fileDownloader.getLastDownloadedUrl())) return;

        if (MedianConfig.get().isNativeNavigationV2()) {
            applyNav2Navigation(url);
            if (this.sideNavManager != null) {
                this.sideNavManager.autoSelectItem(url);
            }
            return;
        }

        if (this.actionManager != null) {
            this.actionManager.setTitleDisplayForUrl(url, true);
        }

        if (this.tabManager != null) {
            this.tabManager.checkTabs(url);
        }

        if (this.actionManager != null) {
            this.actionManager.checkActions(url);
        }

        if (this.sideNavManager != null) {
            this.sideNavManager.autoSelectItem(url);
        }
    }

    // onPageStarted
    @Override
    public void checkPreNavigationForPage(String url) {
        if (this.tabManager != null) {
            this.tabManager.autoSelectTab(url);
        }

        if (this.sideNavManager != null) {
            this.sideNavManager.autoSelectItem(url);
            this.sideNavManager.checkUrl(url);
        }
    }

    @Override
    public void setupTitleDisplayForUrl(String url) {
        this.setupTitleDisplayForUrl(url, true);
    }

    public void setupTitleDisplayForUrl(String url, boolean allowPageTitle) {
        if (this.actionManager == null) return;
        this.actionManager.setTitleDisplayForUrl(url, allowPageTitle);
    }

    @Override
    public int urlLevelForUrl(String url) {
        return MedianConfig.get().urlLevelForUrl(url);
    }

    @Override
    public String titleForUrl(String url) {
        NavigationTitleRule rule = MedianConfig.get().titleRuleForUrl(url);
        return rule != null ? rule.getTitle() : null;
    }

    public void closeDrawers() {
        sideNavManager.closeDrawer();
    }

    public boolean isNotRoot() {
        return !isRoot;
    }

    @Override
    public int getParentUrlLevel() {
        return getGNWindowManager().getParentUrlLevel(activityId);
    }

    @Override
    public int getUrlLevel() {
        return getGNWindowManager().getUrlLevel(activityId);
    }

    @Override
    public void setUrlLevel(int urlLevel) {
        getGNWindowManager().setUrlLevel(activityId, urlLevel);
    }

    public FileDownloader getFileDownloader() {
        return fileDownloader;
    }

    public FileWriterSharer getFileWriterSharer() {
        return fileWriterSharer;
    }

    public MedianPrintManager getPrintManager() {
        return printManager;
    }

    public StatusCheckerBridge getStatusCheckerBridge() {
        return new StatusCheckerBridge();
    }

    @Override
    public void setTitle(CharSequence title) {
        super.setTitle(title);
        if (actionManager != null) {
            actionManager.setTitle(title);
        }
    }

    @Override
    public void startCheckingReadyStatus() {
        statusChecker.run();
    }

    private void stopCheckingReadyStatus() {
        handler.removeCallbacks(statusChecker);
    }

    public void checkReadyStatus() {
        if (this.mWebview != null) {
            this.mWebview.runJavascript("if (median_status_checker && typeof median_status_checker.onReadyState === 'function') median_status_checker.onReadyState(document.readyState);");
        }
    }

    private void checkReadyStatusResult(String status) {
        // if interactiveDelay is specified, then look for readyState=interactive, and show webview
        // with a delay. If not specified, wait for readyState=complete.
        Float interactiveDelayValue = MedianConfig.get().getConfigRoot().getStyling().getTransitionInteractiveDelayMax();
        double interactiveDelay = interactiveDelayValue != null ? interactiveDelayValue : Double.NaN;

        if (status.equals("loading") || (Double.isNaN(interactiveDelay) && status.equals("interactive"))) {
            startedLoading = true;
        } else if ((!Double.isNaN(interactiveDelay) && status.equals("interactive"))
                || (startedLoading && status.equals("complete"))) {

            if (status.equals("interactive")) {
                showWebview(interactiveDelay);
            } else {
                showWebview();
            }
            if (isContentReady) {
                stopCheckingReadyStatus();
            }
        }

        if (status.equals("complete") || status.equals("interactive")) {
            contentReady();
            // C4: runtime/persisted zoom (2.4.1 seeds from androidInitialZoom-first), not static config
            Float zoom = MedianConfig.get().getWebviewZoom();
            setAbsoluteZoom(zoom != null ? zoom : 0f, null);
        }
    }

    @Override
    public void toggleFullscreen(boolean fullscreen) {
        ActionBar actionBar = this.getSupportActionBar();

        if (fullscreen) {
            if (actionBar != null) actionBar.hide();
        } else {
            if (actionBar != null && MedianConfig.get().getConfigRoot().getStyling().getShowActionBar()) actionBar.show();
            // Fix for webview keyboard not showing, see https://github.com/mozilla-tw/FirefoxLite/issues/842
            this.mWebview.clearFocus();
        }

        if (this.systemBarManager != null) this.systemBarManager.enableFullScreen(fullscreen);

        // Full-screen is used for playing videos.
        // Allow sensor-based rotation when in full screen (even overriding user rotation preference)
        // If orientation is forced landscape don't set sensor based orientation
        if (fullscreen && MedianConfig.get().getConfigRoot().getGeneral().getForceOrientation() != ScreenOrientation.LANDSCAPE) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR);
        } else {
            setScreenOrientationPreference();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        getGNApplication().getActivityHost().onRequestPermissionsResult(this, requestCode, permissions, grantResults);
        switch (requestCode) {
            case REQUEST_PERMISSION_GENERIC:
                Iterator<PermissionsCallbackPair> it = pendingPermissionRequests.iterator();
                while (it.hasNext()) {
                    PermissionsCallbackPair pair = it.next();
                    if (pair.permissions.length != permissions.length) continue;
                    boolean skip = false;
                    for (int i = 0; i < pair.permissions.length && i < permissions.length; i++) {
                        if (!pair.permissions[i].equals(permissions[i])) {
                            skip = true;
                            break;
                        }
                    }
                    if (skip) continue;

                    // matches PermissionsCallbackPair
                    if (pair.callback != null) {
                        pair.callback.onPermissionResult(permissions, grantResults);
                    }
                    it.remove();
                }

                if (pendingPermissionRequests.size() == 0 && pendingStartActivityAfterPermissions.size() > 0) {
                    Iterator<Intent> i = pendingStartActivityAfterPermissions.iterator();
                    while (i.hasNext()) {
                        Intent intent = i.next();
                        startActivity(intent);
                        i.remove();
                    }
                }
                break;
        }
    }

    public GoNativeWindowManager getGNWindowManager() {
        return getGNApplication().getWindowManager();
    }

    @Override
    public int getWindowCount() {
        return getGNWindowManager().getWindowCount();
    }

    public boolean isWindowActive() {
        return activityId.equals(getGNWindowManager().getCurrentActiveWindowId());
    }

    public RelativeLayout getFullScreenLayout() {
        return fullScreenLayout;
    }

    @Override
    public GoNativeWebviewInterface getWebView() {
        return mWebview;
    }

    public LeanWebView getLeanWebView() {
        return (LeanWebView) mWebview;
    }

    public class StatusCheckerBridge {
        @JavascriptInterface
        public void onReadyState(final String state) {
            runOnUiThread(() -> checkReadyStatusResult(state));
        }
    }

    private class ConnectivityChangeReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            retryFailedPage();
            if (connectivityCallback != null) {
                sendConnectivity(connectivityCallback);
            }
        }
    }

    public void getPermission(String[] permissions, PermissionCallback callback) {
        boolean needToRequest = false;
        for (String permission : permissions) {
            if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
                needToRequest = true;
                break;
            }
        }

        if (needToRequest) {
            if (callback != null) {
                pendingPermissionRequests.add(new PermissionsCallbackPair(permissions, callback));
            }

            ActivityCompat.requestPermissions(this, permissions, REQUEST_PERMISSION_GENERIC);
        } else {
            // send all granted result
            if (callback != null) {
                int[] results = new int[permissions.length];
                for (int i = 0; i < results.length; i++) {
                    results[i] = PackageManager.PERMISSION_GRANTED;
                }
                callback.onPermissionResult(permissions, results);
            }
        }
    }

    public void startActivityAfterPermissions(Intent intent) {
        if (pendingPermissionRequests.size() == 0) {
            startActivity(intent);
        } else {
            pendingStartActivityAfterPermissions.add(intent);
        }
    }

    private void setScreenOrientationPreference() {
        GeneralConfig general = MedianConfig.get().getConfigRoot().getGeneral();
        if (general.getForceOrientation() != ScreenOrientation.UNSPECIFIED) {
            setDeviceOrientation(general.getForceOrientation());
            return;
        }

        if (getResources().getBoolean(R.bool.isTablet)) {
            if (general.getTabletOrientation() != ScreenOrientation.UNSPECIFIED) {
                setDeviceOrientation(general.getTabletOrientation());
                return;
            }
        } else {
            if (general.getPhoneOrientation() != ScreenOrientation.UNSPECIFIED) {
                setDeviceOrientation(general.getPhoneOrientation());
                return;
            }
        }

        if (!general.getAndroidFullScreen()) {
            setDeviceOrientation(ScreenOrientation.UNSPECIFIED);
        }
    }

    @SuppressLint("SourceLockedOrientationActivity")
    private void setDeviceOrientation(ScreenOrientation orientation) {
        switch (orientation) {
            case UNSPECIFIED:
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
                break;
            case PORTRAIT:
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
                break;
            case LANDSCAPE:
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                break;
        }
    }

    public ActionManager getActionManager() {
        return actionManager;
    }

    public TabManager getTabManager() {
        return tabManager;
    }

    public void slideInNavigationBars() {
        if (actionManager.isHideOnScrollActive()) {
            actionManager.expandAppBar();
        }

        if (MedianConfig.hideTabBarOnScroll() && !actionManager.isHideOnScrollActive()) {
            tabManager.slideIn();
        }
    }

    public interface PermissionCallback {
        void onPermissionResult(String[] permissions, int[] grantResults);
    }

    private class PermissionsCallbackPair {
        String[] permissions;
        PermissionCallback callback;

        PermissionsCallbackPair(String[] permissions, PermissionCallback callback) {
            this.permissions = permissions;
            this.callback = callback;
        }
    }

    public void enableSwipeRefresh() {
        if (this.swipeRefreshLayout != null) {
            this.swipeRefreshLayout.setEnabled(true);
        }
    }

    public void restoreSwipRefreshDefault() {
        if (this.swipeRefreshLayout != null) {
            this.swipeRefreshLayout.setEnabled(MedianConfig.get().getConfigRoot().getNavigation().getAndroidPullToRefresh());
        }
    }

    @Override
    public void deselectTabs() {
        this.tabManager.deselectTabs();
    }

    private void listenForSignalStrength() {
        if (this.phoneStateListener != null) return;

        this.phoneStateListener = new PhoneStateListener() {
            @Override
            public void onSignalStrengthsChanged(SignalStrength signalStrength) {
                latestSignalStrength = signalStrength;
                sendConnectivityOnce();
                if (connectivityCallback != null) {
                    sendConnectivity(connectivityCallback);
                }
            }
        };

        try {
            TelephonyManager telephonyManager = (TelephonyManager)this.getSystemService(Context.TELEPHONY_SERVICE);
            if (telephonyManager == null) {
                GNLog.getInstance().logError(TAG, "Error getting system telephony manager");
            } else {
                telephonyManager.listen(this.phoneStateListener, PhoneStateListener.LISTEN_SIGNAL_STRENGTHS);
            }
        } catch (Exception e) {
            GNLog.getInstance().logError(TAG, "Error listening for signal strength", e);
        }

    }

    @Override
    public void sendConnectivityOnce(String callback) {
        if (callback == null) return;

        this.connectivityOnceCallback = callback;
        if (this.phoneStateListener != null) {
            sendConnectivity(callback);
        } else {
            listenForSignalStrength();
            new Handler().postDelayed(new Runnable() {
                @Override
                public void run() {
                    sendConnectivityOnce();
                }
            }, 500);
        }
    }

    private void sendConnectivityOnce() {
        if (this.connectivityOnceCallback == null) return;
        sendConnectivity(this.connectivityOnceCallback);
        this.connectivityOnceCallback = null;
    }

    private void sendConnectivity(String callback) {
        NetworkInfo activeNetwork = cm.getActiveNetworkInfo();
        boolean connected = activeNetwork != null && activeNetwork.isConnected();
        String typeString;
        if (activeNetwork != null) {
            typeString = activeNetwork.getTypeName();
        } else {
            typeString = "DISCONNECTED";
        }

        try {
            JSONObject data = new JSONObject();
            data.put("connected", connected);
            data.put("type", typeString);

            if (this.latestSignalStrength != null) {
                JSONObject signalStrength = new JSONObject();

                signalStrength.put("cdmaDbm", latestSignalStrength.getCdmaDbm());
                signalStrength.put("cdmaEcio", latestSignalStrength.getCdmaEcio());
                signalStrength.put("evdoDbm", latestSignalStrength.getEvdoDbm());
                signalStrength.put("evdoEcio", latestSignalStrength.getEvdoEcio());
                signalStrength.put("evdoSnr", latestSignalStrength.getEvdoSnr());
                signalStrength.put("gsmBitErrorRate", latestSignalStrength.getGsmBitErrorRate());
                signalStrength.put("gsmSignalStrength", latestSignalStrength.getGsmSignalStrength());
                if (Build.VERSION.SDK_INT >= 23) {
                    signalStrength.put("level", latestSignalStrength.getLevel());
                }
                data.put("cellSignalStrength", signalStrength);
            }

            String js = LeanUtils.createJsForCallback(callback, data);
            runJavascript(js);
        } catch (JSONException e) {
            GNLog.getInstance().logError(TAG, "JSON error sending connectivity", e);
        }
    }

    @Override
    public void subscribeConnectivity(final String callback) {
        this.connectivityCallback = callback;
        listenForSignalStrength();
        new Handler().postDelayed(new Runnable() {
            @Override
            public void run() {
                sendConnectivity(callback);
            }
        }, 500);
    }

    @Override
    public void unsubscribeConnectivity() {
        this.connectivityCallback = null;
    }

    public interface GeolocationPermissionCallback {
        void onResult(boolean granted);
    }

    // set brightness to a negative number to restore default
    @Override
    public void setBrightness(float brightness) {
        WindowManager.LayoutParams layout = getWindow().getAttributes();
        layout.screenBrightness = brightness;
        getWindow().setAttributes(layout);
    }

    @Override
    public void setSidebarNavigationEnabled(boolean enabled) {
        if (sideNavManager != null) {
            sideNavManager.setSideBarNavigationEnabled(enabled);
        }
    }

    // median.sidebar.setItems: under nav2 median-core merges the items into the resolved sidebar
    // and fires onNavigationInstanceChanged, which re-renders this window.
    @Override
    public void setSidebarItems(@NonNull String itemsJson, boolean enabled, boolean persist) {
        MedianConfig.get().setSidebarMenusFromJson(itemsJson, enabled, persist);
        if (!MedianConfig.get().isNativeNavigationV2()) {
            setSidebarNavigationEnabled(enabled);
        }
    }

    // median.sidebar.getItems: replies {"default": [...]} with the sidebar for this page.
    @Override
    public void getSidebarItems(@NonNull String callback) {
        String url = mWebview.getUrl();
        String menus = MedianConfig.get().sidebarMenusJsonForUrl(url != null ? url : "");
        try {
            runJavascript(LeanUtils.createJsForCallback(callback, new JSONObject(menus)));
        } catch (JSONException e) {
            GNLog.getInstance().logError(TAG, "getSidebarItems: " + e.getMessage(), e);
        }
    }

    @Override
    public void setNavigationTitles(@Nullable Map<String, ?> data, boolean persist) {
        MedianConfig.get().setNavigationTitlesRaw(data, persist);
    }

    @Override
    public void setNavigationLevels(@Nullable Map<String, ?> data, boolean persist) {
        MedianConfig.get().setNavigationLevelsRaw(data, persist);
    }

    @Override
    public void setMaxWindows(boolean enabled, int numWindows, boolean autoClose, boolean persist) {
        MedianConfig.get().setMaxWindows(enabled, numWindows, autoClose, persist);
    }

    // median.internalExternal.set: median-core applies the rules; UrlNavigation reads them through linkModeForUrl.
    @Override
    public void setInternalExternalRules(@NonNull String rulesJson) {
        MedianConfig.get().setRegexRulesFromJson(rulesJson);
    }

    @Override
    public void setSwipeGestures(boolean enabled) {
        swipeGesturesFromJs = enabled;
        swipeGesturesEnabled = enabled;
        if (swipeNavLayout != null) swipeNavLayout.setEnabled(enabled);
    }

    /**
     * @param appTheme set to null if will use sharedPreferences
     */

    @Override
    public void setupAppTheme(String appTheme) {
        if (TextUtils.isEmpty(appTheme)) return;

        ConfigPreferences preferences = new ConfigPreferences(this);
        preferences.setAppTheme(appTheme);

        this.appTheme = appTheme;

        // Updating app theme on runtime triggers a configuration change and recreates the app
        // To prevent consecutive calls, ignore theme setup on onCreate() by enabling this flag
        flagThemeConfigurationChange = true;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ThemeUtils.setAppThemeApi31AndAbove(this, appTheme);
        } else {
            ThemeUtils.setAppThemeApi30AndBelow(appTheme);
        }

        // update CSS attribute when changing themes, regardless of configuration changes
        setupCssTheme();
    }

    @Override
    public void resetAppTheme() {
        this.appTheme = MedianConfig.get().getConfigRoot().getStyling().getAndroidTheme();
        setupAppTheme(appTheme);
    }

    @SuppressLint("RequiresFeature")
    private void setupWebviewTheme(String appTheme) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.FORCE_DARK)) {
            Log.d(TAG, "Dark mode feature is not supported");
            return;
        }

        if (mWebview.getSettings() == null) {
            return;
        }

        if ("dark".equals(appTheme)) {
            WebSettingsCompat.setForceDark(this.mWebview.getSettings(), WebSettingsCompat.FORCE_DARK_ON);
        } else if ("light".equals(appTheme)) {
            WebSettingsCompat.setForceDark(this.mWebview.getSettings(), WebSettingsCompat.FORCE_DARK_OFF);
        } else {
            switch (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) {
                case Configuration.UI_MODE_NIGHT_YES:
                    WebSettingsCompat.setForceDark(this.mWebview.getSettings(), WebSettingsCompat.FORCE_DARK_ON);
                    break;
                case Configuration.UI_MODE_NIGHT_NO:
                case Configuration.UI_MODE_NIGHT_UNDEFINED:
                    WebSettingsCompat.setForceDark(this.mWebview.getSettings(), WebSettingsCompat.FORCE_DARK_OFF);
                    break;
            }

            // Force dark on if supported, and only use theme from web
            if (WebViewFeature.isFeatureSupported(WebViewFeature.FORCE_DARK_STRATEGY)) {
                WebSettingsCompat.setForceDarkStrategy(
                        this.mWebview.getSettings(),
                        WebSettingsCompat.DARK_STRATEGY_WEB_THEME_DARKENING_ONLY
                );
            }
        }

        // update CSS attribute when changing themes, regardless of configuration changes
        setupCssTheme();
    }

    public void setupCssTheme() {
        String js = String.format("document.documentElement.setAttribute('data-color-scheme-option', '%s');", this.appTheme);
        mWebview.runJavascript(js);
    }

    private void validateGoogleService() {
        try {
            if (BuildConfig.GOOGLE_SERVICE_INVALID) {
                Toast.makeText(this, R.string.google_service_required, Toast.LENGTH_LONG).show();
                GNLog.getInstance().logError(TAG, "validateGoogleService: " + R.string.google_service_required, null, GNLog.TYPE_TOAST_ERROR);
            }
        } catch (NullPointerException ex) {
            GNLog.getInstance().logError(TAG, "validateGoogleService: " + ex.getMessage(), null, GNLog.TYPE_TOAST_ERROR);
        }
    }

    @Override
    public void updateStatusBarOverlay(boolean isOverlayEnabled) {
        if (this.systemBarManager == null) return;
        this.enableOverlayInStatusBar = isOverlayEnabled;
        this.systemBarManager.requestApplyInsets();
    }

    @Override
    public void updateStatusBarStyle(String statusBarStyle) {
        if (this.systemBarManager != null)
            this.systemBarManager.updateStatusBarStyle(statusBarStyle);
    }

    @Override
    public void setStatusBarColor(int color) {
        if (this.systemBarManager != null)
            this.systemBarManager.setStatusBarColor(color);
    }

    @Override
    public void updateSystemNavBarOverlay(boolean isOverlayEnabled) {
        if (this.systemBarManager == null) return;
        this.enableOverlayInSystemNavBar = isOverlayEnabled;
        this.systemBarManager.requestApplyInsets();
    }

    @Override
    public void updateSystemNavBarStyle(String systemNavBarStyle) {
        if (this.systemBarManager != null)
            this.systemBarManager.updateSystemNavBarStyle(systemNavBarStyle);
    }

    @Override
    public void setSystemNavBarColor(int color) {
        if (this.systemBarManager != null)
            this.systemBarManager.setSystemNavBarColor(color);
    }

    @Override
    public void setSystemBarColor(int color) {
        if (this.systemBarManager != null)
            this.systemBarManager.setSystemBarColor(color);
    }

    @Override
    public void runGonativeDeviceInfo(String callback, boolean includeCarrierNames) {
        if (includeCarrierNames) {
            deviceInfoCallback = callback;
            requestPermissionLauncher.launch(Manifest.permission.READ_PHONE_STATE);
        } else {
            Map<String, Object> installationInfo = Installation.getInfo(this);
            installationInfo.put("isFirstLaunch", ((GoNativeApplication) getApplication()).isFirstLaunch());

            // insert additional device info from other plugins
            installationInfo.putAll(getGNApplication().getActivityHost().getExtraDeviceInfo(this));

            JSONObject jsonObject = new JSONObject(installationInfo);
            String js = LeanUtils.createJsForCallback(callback, jsonObject);
            this.runJavascript(js);
        }
    }

    @Override
    public Map<String, Object> getDeviceInfo() {
        return Installation.getInfo(this);
    }

    @Override
    public void windowFlag(boolean add, int flag) {
        if (add) {
            getWindow().addFlags(flag);
        } else {
            getWindow().clearFlags(flag);
        }
    }

    @NonNull
    @Override
    public String currentPageUrl() {
        String url = mWebview != null ? mWebview.getUrl() : null;
        return url != null ? url : "";
    }

    @Override
    public void setCustomTitle(String title) {
        if (!title.isEmpty()) {
            setTitle(title);
        } else {
            setTitle(R.string.app_name);
        }
    }

    @Override
    public void downloadFile(String url, String filename, boolean shouldSaveToGallery, boolean open, String callback) {
        fileDownloader.downloadFile(url, filename, shouldSaveToGallery, open, callback);
    }

    @Override
    public void selectTab(int tabNumber) {
        if (tabManager == null) return;
        tabManager.selectTabNumber(tabNumber, false);
    }

    @Override
    public void setTabsWithJson(JSONObject tabsJson, int tabMenuId) {
        if (tabManager == null) return;
        tabManager.setTabsWithJson(tabsJson, tabMenuId);
    }

    @Override
    public void focusAudio(boolean enabled) {
        if (enabled) {
            AudioUtils.requestAudioFocus(this);
        } else {
            AudioUtils.abandonFocusRequest(this);
        }
    }

    @Override
    public void clipboardSet(String content) {
        if (content.isEmpty()) return;
        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        ClipData clip = ClipData.newPlainText("copy", content);
        clipboard.setPrimaryClip(clip);
    }

    @Override
    public void clipboardGet(String callback) {
        if (!TextUtils.isEmpty(callback)) {
            Map<String, String> params = new HashMap<>();
            ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            CharSequence pasteData;
            if (clipboard.hasPrimaryClip()) {
                ClipData.Item item = clipboard.getPrimaryClip().getItemAt(0);
                pasteData = item.getText();
                if (pasteData != null)
                    params.put("data", pasteData.toString());
                else
                    params.put("error", "Clipboard item is not a string.");
            } else {
                params.put("error", "No Clipboard item available.");
            }
            JSONObject jsonObject = new JSONObject(params);
            runJavascript(LeanUtils.createJsForCallback(callback, jsonObject));
        }
    }

    @Override
    public void sendRegistration(JSONObject data) {
        // Registration-endpoints feature dropped in median-core migration.
    }

    @Override
    public void runCustomNativeBridge(Map<String, String> params) {
        // execute code defined by the CustomCodeHandler
        // call JsCustomCodeExecutor#setHandler to override this default handler
        JSONObject data = JsCustomCodeExecutor.execute(params);
        String callback = params.get("callback");
        if(callback != null && !callback.isEmpty()) {
            final String js = LeanUtils.createJsForCallback(callback, data);
            // run on main thread
            Handler mainHandler = new Handler(getMainLooper());
            mainHandler.post(() -> runJavascript(js));
        }
    }

    @Override
    public void promptLocationService() {
        this.locationServiceHelper.promptLocationService();
    }

    @Override
    public boolean isLocationServiceEnabled() {
        return this.locationServiceHelper.isLocationServiceEnabled();
    }

    public LocationServiceHelper getLocationServiceHelper() {
        return this.locationServiceHelper;
    }

    @Override
    public void setRestoreBrightnessOnNavigation(boolean restore) {
        this.restoreBrightnessOnNavigation = restore;
    }

    public boolean isRestoreBrightnessOnNavigation() {
        return this.restoreBrightnessOnNavigation;
    }

    @Override
    public void closeCurrentWindow() {
        if (!getGNWindowManager().isRoot(activityId)) {
            this.finish();
        }
    }

    @Override
    public void openNewWindow(String url, String mode) {
        if (TextUtils.isEmpty(url)) return;

        Uri uri = Uri.parse(url);

        // Same window
        if ("internal".equals(mode)) {
            loadUrl(url);
            return;
        }

        // External default browser
        if ("external".equals(mode)) {
            openExternalBrowser(uri);
            return;
        }

        // Chrome in-app custom tab
        if ("appbrowser".equals(mode)) {
            openAppBrowser(uri);
            return;
        }

        // Default
        MaxWindowsConfig maxWindows = MedianConfig.get().getMaxWindows();

        // Check maxWindows conditions
        if (maxWindows != null && maxWindows.getEnabled() && maxWindows.getNumWindows() > 0 && getGNWindowManager().getWindowCount() >= maxWindows.getNumWindows() && onMaxWindowsReached(url))
            return;

        Intent intent = new Intent(this, MainActivity.class);
        intent.putExtra("isRoot", false);
        intent.putExtra("url", url);
        intent.putExtra(MainActivity.EXTRA_IGNORE_INTERCEPT_MAXWINDOWS, true);
        startActivityForResult(intent, MainActivity.REQUEST_WEB_ACTIVITY);
    }

    public void openExternalBrowser(Uri uri) {
        if (uri == null) return;
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            if (isAppLink(uri)) {
                // force the URL to launch in the device's default browser to avoid infinite looping bug with AppLink.
                intent.setPackage(getDefaultBrowserPackageName());
            }
            startActivity(intent);
        } catch (Exception ex) {
            if (ex instanceof ActivityNotFoundException) {
                Toast.makeText(this, R.string.app_not_installed, Toast.LENGTH_LONG).show();
                GNLog.getInstance().logError(TAG, getString(R.string.app_not_installed), ex, GNLog.TYPE_TOAST_ERROR);
            } else {
                GNLog.getInstance().logError(TAG, "openExternalBrowser: launchError - uri: " + uri, ex);
            }
        }
    }

    public void openAppBrowser(Uri uri) {
        if (uri == null) return;
        try {
            CustomTabColorSchemeParams params = new CustomTabColorSchemeParams.Builder()
                    .setToolbarColor(ContextCompat.getColor(this, R.color.colorPrimary))
                    .setSecondaryToolbarColor(ContextCompat.getColor(this, R.color.titleTextColor))
                    .build();

            CustomTabsIntent customTabsIntent = new CustomTabsIntent.Builder()
                    .setDefaultColorSchemeParams(params)
                    .build();
            customTabsIntent.intent.setData(uri);
            appBrowserActivityLauncher.launch(customTabsIntent.intent);
        } catch (Exception ex) {
            if (ex instanceof ActivityNotFoundException) {
                Toast.makeText(this, R.string.app_not_installed, Toast.LENGTH_LONG).show();
                GNLog.getInstance().logError(TAG, getString(R.string.app_not_installed), ex, GNLog.TYPE_TOAST_ERROR);
            } else {
                GNLog.getInstance().logError(TAG, "openAppBrowser: launchError - uri: " + uri, ex);
            }
        }
    }

    @Override
    public boolean onMaxWindowsReached(String url) {
        MaxWindowsConfig maxWindows = MedianConfig.get().getMaxWindows();
        GoNativeWindowManager windowManager = getGNWindowManager();

        if (maxWindows != null && maxWindows.getAutoClose() && LeanUtils.urlsMatchIgnoreTrailing(url, MedianConfig.get().getInitialUrl())) {

            // Set this activity as new root
            isRoot = true;

            windowManager.setAsNewRoot(activityId);

            // Reset URL levels
            windowManager.setUrlLevels(activityId, -1, -1);

            // Reload activity as root
            initialRootSetup();

            if (actionManager != null) {
                actionManager.setupActionBar(isRoot);
                actionManager.setTitleDisplayForUrl(url,true);
            }

            if (sideNavManager != null) {
                sideNavManager.setupNavigationMenu(isRoot);
                if (!MedianConfig.get().isNativeNavigationV2()) {
                    sideNavManager.showNavigationMenu(MedianConfig.get().getShowNavigationMenu());
                }
                sideNavManager.toggleSyncState();
            }

            windowManager.setIgnoreInterceptMaxWindows(activityId, true);

            // notify to close all windows except this one
            windowManager.notifyMaxWindowsReached(null);

            // Add listener when all excess windows are closed
            windowManager.setOnExcessWindowClosedListener(() -> {
                // Load new URL
                mWebview.loadUrl(url);
                // Remove listener
                windowManager.setOnExcessWindowClosedListener(null);
            });
            return true;
        } else {

            // Get excess window
            String excessWindowId = windowManager.getExcessWindow();

            // notify to close the excess window
            windowManager.notifyMaxWindowsReached(excessWindowId);

            // Remove from window list
            windowManager.removeWindow(excessWindowId);
        }

        return false;
    }

    @Override
    public void getKeyboardInfo(String callback) {
        if (keyboardManager == null || TextUtils.isEmpty(callback)) return;
        runJavascript(LeanUtils.createJsForCallback(callback, keyboardManager.getKeyboardData()));
    }

    @Override
    public void addKeyboardListener(String callback) {
        if (keyboardManager == null) return;
        keyboardManager.setCallback(callback);
    }

    @Override
    public Map<String, String> checkPermissionStatus(JSONArray permissions) {
        return PermissionsUtilKt.checkPermissionStatus(this, permissions);
    }

    @Override
    public void invokeCallback(String callback, JSONObject data) {
        if (eventsManager != null) eventsManager.invokeCallback(callback, data);
    }

    @Override
    public void subscribeEvent(String callback) {
        if (eventsManager != null) eventsManager.subscribe(callback);
    }

    @Override
    public void unsubscribeEvent(String callback) {
        if (eventsManager != null) eventsManager.unsubscribe(callback);
    }

    public MedianEventsManager getEventsManager() {
        return this.eventsManager;
    }

    public String getLaunchSource() {
        return launchSource;
    }

    private boolean isAppLink(Uri uri) {
        if (uri == null) return false;

        DeepLinkDomainsConfig deepLinkConfig = MedianConfig.get().getConfigRoot().getNavigation().getDeepLinkDomains();
        List<String> deeplinkDomains = deepLinkConfig != null ? deepLinkConfig.getDomains() : Collections.emptyList();

        if (deeplinkDomains == null || deeplinkDomains.isEmpty()) return false;
        return deeplinkDomains.contains(uri.getHost());
    }

    private String getDefaultBrowserPackageName() {
        Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("http://www.google.com"));
        ResolveInfo resolveInfo = getPackageManager().resolveActivity(browserIntent, PackageManager.MATCH_DEFAULT_ONLY);

        if (resolveInfo != null && resolveInfo.activityInfo != null) {
            return resolveInfo.activityInfo.packageName;
        }

        return null;
    }

    public void handleMessage(String message) {
        if(message.isEmpty()) return;
        runOnUiThread(() -> {
            try {
                JSONObject commandObject = new JSONObject(message);
                BridgeMessage bridgeMessage = messageRouter().parseJsonBody(jsonObjectToMap(commandObject));
                if (bridgeMessage != null) messageRouter().dispatch(bridgeMessage, this, commandResponder);
            } catch (JSONException jsonException){ // pass it as a median:// / gonative:// url
                messageRouter().route(message, this, commandResponder);
            }
        });
    }

    // median-core JS bridge: router (built lazily with all Android commands) + responder.
    private MessageRouter messageRouter;

    private MessageRouter messageRouter() {
        if (messageRouter == null) {
            messageRouter = AndroidCommandFactory.INSTANCE.registerAll(new MessageRouter());
        }
        return messageRouter;
    }

    // Plugin polyfill JS injector (scans *-plugin.js assets; empty until plugins are migrated).
    private PluginJSInjector pluginJSInjector;

    public PluginJSInjector getPluginJSInjector() {
        if (pluginJSInjector == null) {
            pluginJSInjector = new PluginJSInjector(new AndroidAssetReader(this));
        }
        return pluginJSInjector;
    }

    private final CommandResponder commandResponder = new CommandResponder() {
        @Override
        public void runJavascript(String script) {
            runOnUiThread(() -> MainActivity.this.runJavascript(script));
        }
    };

    // Deep org.json -> Map conversion (preserves nested objects/arrays) for MessageRouter.parseJsonBody.
    private static Map<String, Object> jsonObjectToMap(JSONObject json) throws JSONException {
        Map<String, Object> map = new HashMap<>();
        Iterator<String> keys = json.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            map.put(key, fromJsonValue(json.get(key)));
        }
        return map;
    }

    private static Object fromJsonValue(Object value) throws JSONException {
        if (value instanceof JSONObject) {
            return jsonObjectToMap((JSONObject) value);
        } else if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value;
            List<Object> list = new ArrayList<>();
            for (int i = 0; i < array.length(); i++) {
                list.add(fromJsonValue(array.get(i)));
            }
            return list;
        }
        return value;
    }

    @Override
    public void onCreateContextMenu(ContextMenu menu, View v, ContextMenu.ContextMenuInfo menuInfo) {
        WebView.HitTestResult hitResult = mWebview.getHitTestResult();
        String resultUrl = hitResult.getExtra();
        int resultType = hitResult.getType();

        if (TextUtils.isEmpty(resultUrl) || resultType != WebView.HitTestResult.SRC_ANCHOR_TYPE) return;
        this.contextMenuUrl = resultUrl;

        ContextMenuConfig config = MedianConfig.get().getConfigRoot().getContextMenu();
        if (!config.getEnabled() || config.getLinkActions().isEmpty()) return;

        List<String> items = new ArrayList<>();

        if (config.getLinkActions().contains("copyLink")) {
            items.add(getString(R.string.action_copy));
        }

        if (config.getLinkActions().contains("openExternal")) {
            items.add(getString(R.string.action_open_browser));
        }

        CharSequence[] itemArray = items.toArray(new CharSequence[0]);

        new MaterialAlertDialogBuilder(this)
                .setTitle(contextMenuUrl)
                .setItems(itemArray, (dialog, which) -> {
                    String selected = items.get(which);

                    if (Objects.equals(selected, getString(R.string.action_copy))) {
                        clipboardSet(contextMenuUrl);
                    } else if (Objects.equals(selected, getString(R.string.action_open_browser))) {
                        openExternalBrowser(Uri.parse(contextMenuUrl));
                    }
                })
                .setOnDismissListener(dialogInterface -> contextMenuUrl = "")
                .show();
    }

    @Override
    public void setContextMenuEnabled(boolean enabled) {
        if (mWebviewContainer == null) return;
        if (enabled) {
            registerForContextMenu(mWebviewContainer);
        } else {
            unregisterForContextMenu(mWebviewContainer);
        }
    }

    public UrlLoader getUrlLoader() {
        return urlLoader;
    }

    public GoNativeApplication getGNApplication() {
        return (GoNativeApplication) this.getApplication();
    }

    public void setCurrentWebViewZoomScale(float currentWebViewZoomScale) {
        this.currentWebViewZoomScale = currentWebViewZoomScale;

        if (mWebview instanceof LeanWebView) {
            ((LeanWebView) mWebview).setCurrentScale(currentWebViewZoomScale);
        }
    }

    public float getCurrentWebViewZoomScale() {
        return this.currentWebViewZoomScale;
    }

    public void setBaseZoomScale(float baseScale) {
        this.baseZoomScale = baseScale;
    }

    @Override
    public void exitApp() {
        finishAffinity();
    }

    @Override
    public void setAbsoluteZoom(float targetScale, String callback) {
        try {
            if (targetScale <= 0f) {
                if (!TextUtils.isEmpty(callback)) {
                    JSONObject response = new JSONObject();
                    response.put("success", false);
                    response.put("error", "Invalid value");
                    runJavascript(LeanUtils.createJsForCallback(callback, response));
                }
                return;
            }

            String js =
                    "(function() {" +
                            "  var targetScale = " + targetScale + ";" +

                            "  var meta = document.querySelector('meta[name=viewport]');" +
                            "  if (!meta) {" +
                            "    meta = document.createElement('meta');" +
                            "    meta.name = 'viewport';" +
                            "    document.head.appendChild(meta);" +
                            "  }" +

                            "  var deviceWidth = window.screen.width;" +
                            "  var newWidth = deviceWidth / targetScale;" +

                            "  var content = meta.getAttribute('content') || '';" +
                            "  var parts = content.split(',').map(function(p) { return p.trim(); });" +

                            "  var foundScale = false;" +
                            "  var foundWidth = false;" +

                            "  for (var i = 0; i < parts.length; i++) {" +
                            "    if (parts[i].startsWith('initial-scale=')) {" +
                            "      parts[i] = 'initial-scale=' + targetScale;" +
                            "      foundScale = true;" +
                            "    } else if (parts[i].startsWith('width=')) {" +
                            "      parts[i] = 'width=' + newWidth;" +
                            "      foundWidth = true;" +
                            "    }" +
                            "  }" +

                            "  if (!foundScale) {" +
                            "    parts.push('initial-scale=' + targetScale);" +
                            "  }" +

                            "  if (!foundWidth) {" +
                            "    parts.push('width=' + newWidth);" +
                            "  }" +

                            "  meta.setAttribute('content', parts.join(', '));" +
                            "})();";

            runJavascript(js);

            setWebViewZoom(targetScale);

            MedianConfig.get().setWebviewZoom(targetScale);

            if (!TextUtils.isEmpty(callback)) {
                JSONObject response = new JSONObject();
                response.put("success", true);
                runJavascript(LeanUtils.createJsForCallback(callback, response));
            }
        } catch (Exception e) {
            if (e instanceof JSONException) {
                return;
            }

            try {
                JSONObject result = new JSONObject();
                result.put("success", false);
                result.put("error", e.getMessage());
                runJavascript(LeanUtils.createJsForCallback(callback, result));
            } catch (JSONException ignored) {}
        }
    }

    @Override
    public float getAbsoluteZoom() {
        return currentWebViewZoomScale / baseZoomScale;
    }

    public void setWebViewZoom(float targetScale) {
        if (targetScale <= 0f) return;
        float targetAndroidScale = targetScale * baseZoomScale;
        float zoomBy = targetAndroidScale / currentWebViewZoomScale;

        try {
            ((WebView) mWebview).zoomBy(zoomBy);
        } catch (IllegalArgumentException ex) {
            GNLog.getInstance().logError(TAG, "setAbsoluteZoom: ", ex);
        }
    }
}
