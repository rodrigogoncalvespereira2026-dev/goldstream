package co.median.android;

import android.content.Context;
import android.text.TextUtils;
import android.webkit.WebSettings;

import co.median.core.config.GeneralConfig;
import co.median.core.config.GeneralConfigPlatformKt;

/**
 * Resolves the app's webview/download user agent (shell-side; mirrors the legacy LEANUserAgentManager).
 * A forced user agent wins; otherwise the system WebView default UA suffixed with the configured add-on.
 * Resolved once and cached.
 */
public final class UserAgentManager {
    private static volatile String userAgent;

    private UserAgentManager() {}

    public static String getUserAgent(Context context) {
        if (userAgent == null) {
            synchronized (UserAgentManager.class) {
                if (userAgent == null) {
                    GeneralConfig general = MedianConfig.get().getConfigRoot().getGeneral();
                    String forced = GeneralConfigPlatformKt.effectiveForceUserAgent(general);
                    if (!TextUtils.isEmpty(forced)) {
                        userAgent = forced;
                    } else {
                        String add = GeneralConfigPlatformKt.effectiveUserAgentAdd(general);
                        String defaultUa = WebSettings.getDefaultUserAgent(context);
                        userAgent = !TextUtils.isEmpty(add) ? defaultUa + " " + add : defaultUa;
                    }
                }
            }
        }
        return userAgent;
    }
}
