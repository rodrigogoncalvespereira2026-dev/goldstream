package co.median.android;

import android.annotation.SuppressLint;
import android.content.Context;
import android.os.Message;
import android.text.TextUtils;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;

import java.util.Map;

import co.median.core.util.GNLog;
import co.median.core.webview.GoNativeWebviewInterface;

/**
 * Created by weiyin on 9/8/15.
 */
public class WebViewSetup {
    private static final String TAG = WebViewSetup.class.getName();
    public static String userAgent = "";

    @SuppressLint("JavascriptInterface")
    public static void setupWebviewForActivity(GoNativeWebviewInterface webview, MainActivity activity) {
        if (!(webview instanceof LeanWebView)) {
            GNLog.getInstance().logError(TAG, "Expected webview to be of class LeanWebView and not " + webview.getClass().getName());
            return;
        }

        LeanWebView wv = (LeanWebView)webview;

        setupWebview(wv, activity);

        UrlNavigation urlNavigation = new UrlNavigation(activity);
        urlNavigation.setCurrentWebviewUrl(webview.getUrl());

        wv.setWebChromeClient(new GoNativeWebChromeClient(activity, urlNavigation));
        wv.setWebViewClient(new GoNativeWebviewClient(activity, urlNavigation));

        FileDownloader fileDownloader = activity.getFileDownloader();
        if (fileDownloader != null) {
            wv.setDownloadListener(fileDownloader);
            fileDownloader.setUrlNavigation(urlNavigation);
        }

        wv.removeJavascriptInterface("median_status_checker");
        wv.addJavascriptInterface(activity.getStatusCheckerBridge(), "median_status_checker");

        wv.removeJavascriptInterface("gonative_file_writer_sharer");
        wv.addJavascriptInterface(activity.getFileWriterSharer().getJavascriptBridge(), "gonative_file_writer_sharer");

        wv.removeJavascriptInterface("JSBridge");
        wv.addJavascriptInterface(new WebViewInterface(activity::handleMessage), "JSBridge");

        wv.removeJavascriptInterface(MedianPrintManager.JS_INTERFACE_NAME);
        wv.addJavascriptInterface(activity.getPrintManager().getJavascriptBridge(), MedianPrintManager.JS_INTERFACE_NAME);

        ((GoNativeApplication) activity.getApplication()).getActivityHost().onWebviewSetUp(activity, wv);

        if (activity.isFromWindowOpenRequest()) {
            // send to other webview
            Message resultMsg = ((GoNativeApplication)activity.getApplication()).getWebviewMessage();
            if (resultMsg != null) {

                try {
                    WebView.WebViewTransport transport = (WebView.WebViewTransport)resultMsg.obj;
                    if (transport != null) {
                        transport.setWebView(wv);
                        resultMsg.sendToTarget();
                    }
                } catch (ClassCastException ex) {
                    GNLog.getInstance().logError(TAG, ex.getMessage(), ex);
                }
            }
        }
    }

    @SuppressWarnings("deprecation")
    @SuppressLint("SetJavaScriptEnabled")
    public static void setupWebview(GoNativeWebviewInterface webview, Context context) {
        if (!(webview instanceof LeanWebView)) {
            GNLog.getInstance().logError(TAG, "Expected webview to be of class LeanWebView and not " + webview.getClass().getName());
            return;
        }

        LeanWebView wv = (LeanWebView)webview;
        WebSettings webSettings = wv.getSettings();

        // C2: allowZoom absent = true (legacy default)
        if (!Boolean.FALSE.equals(MedianConfig.get().getConfigRoot().getAllowZoom())) {
            webSettings.setBuiltInZoomControls(true);
        }
        else {
            webSettings.setBuiltInZoomControls(false);
        }

        webSettings.setDisplayZoomControls(false);
        webSettings.setLoadWithOverviewMode(true);
        webSettings.setUseWideViewPort(true);

        webSettings.setJavaScriptEnabled(true);
        webSettings.setJavaScriptCanOpenWindowsAutomatically(true);

        // font size bug fix, see https://stackoverflow.com/questions/41179357/android-webview-rem-units-scale-way-to-large-for-boxes
        webSettings.setMinimumFontSize(1);
        webSettings.setMinimumLogicalFontSize(1);

        webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        CookieManager.getInstance().setAcceptThirdPartyCookies(wv, true);

        webSettings.setDomStorageEnabled(true);
        webSettings.setCacheMode(webSettingsCacheMode(MedianConfig.get().getConfigRoot().getPerformance().getCacheMode()));

        webSettings.setDatabaseEnabled(true);

        webSettings.setSaveFormData(false);
        webSettings.setSavePassword(false);

        if (TextUtils.isEmpty(userAgent)) {
            userAgent = UserAgentManager.getUserAgent(context);
        }

        webSettings.setUserAgentString(userAgent);

        // C1: absent maxWindows = legacy 0 (matches UrlNavigation.maxWindowsCount) —
        // multi-window is then governed by general.enableWindowOpen, as on master
        co.median.core.config.MaxWindowsConfig maxWindows = MedianConfig.get().getMaxWindows();
        int numWindows = maxWindows != null ? maxWindows.getNumWindows() : 0;
        if (numWindows == 1) {
            webSettings.setSupportMultipleWindows(false);
        } else {
            webSettings.setSupportMultipleWindows(MedianConfig.get().getConfigRoot().getGeneral().getEnableWindowOpen());
        }

        webSettings.setGeolocationEnabled(MedianConfig.get().getConfigRoot().getPermissions().getGeolocation());
        webSettings.setMediaPlaybackRequiresUserGesture(false);

        int textZoom = MedianConfig.get().getConfigRoot().getStyling().getAndroidWebviewTextZoom();
        if (textZoom > 0) {
            webSettings.setTextZoom(textZoom);
        }

        if (MedianConfig.get().getConfigRoot().getStyling().getAndroidDisableOverScrollAnimation()) {
            wv.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        }

        if (WebViewFeature.isFeatureSupported(WebViewFeature.PAYMENT_REQUEST)) {
            WebSettingsCompat.setPaymentRequestEnabled(webSettings, true);
        }
    }

    // Map median-core performance.cacheMode string to a WebSettings cache mode.
    private static int webSettingsCacheMode(String mode) {
        if (mode == null) return WebSettings.LOAD_DEFAULT;
        switch (mode) {
            case "no_cache": return WebSettings.LOAD_NO_CACHE;
            case "cache_only": return WebSettings.LOAD_CACHE_ONLY;
            case "cache_else_network": return WebSettings.LOAD_CACHE_ELSE_NETWORK;
            default: return WebSettings.LOAD_DEFAULT;
        }
    }

    public static void setupWebviewGlobals(Context context) {
        // WebView debugging
        if(!MedianConfig.get().getConfigRoot().getServices().getGeckoView().getActive()) {
            Map<String,Object> installation = Installation.getInfo(context);
            String dist = (String)installation.get("distribution");
            if (dist != null && (dist.equals("debug") || dist.equals("adhoc"))) {
                WebView.setWebContentsDebuggingEnabled(true);
            }
        }
    }

    public static void removeCallbacks(LeanWebView webview) {
        webview.setWebViewClient(null);
        webview.setWebChromeClient(null);
    }
}
