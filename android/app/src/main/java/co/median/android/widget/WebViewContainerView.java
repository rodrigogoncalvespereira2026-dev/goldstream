package co.median.android.widget;

import android.app.Activity;
import android.content.Context;
import android.util.AttributeSet;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;

import co.median.android.LeanWebView;
import co.median.android.MainActivity;
import co.median.android.MedianConfig;
import co.median.android.WebViewSetup;
import co.median.core.webview.GoNativeWebviewInterface;

public class WebViewContainerView extends FrameLayout {

    private ViewGroup webview;
    private boolean isGecko = false;

    public WebViewContainerView(@NonNull Context context) {
        super(context);
    }

    public WebViewContainerView(@NonNull Context context, @Nullable AttributeSet attrs) {
        super(context, attrs);
        initializeWebview(context);
    }

    public WebViewContainerView(@NonNull Context context, @Nullable AttributeSet attrs, int defStyleAttr) {
        super(context, attrs, defStyleAttr);
        initializeWebview(context);
    }

    private void initializeWebview(Context context) {
        if (MedianConfig.get().getConfigRoot().getServices().getGeckoView().getActive()) {
            try {
                Class<?> classGecko = Class.forName("co.median.plugins.android.geckoview.GNGeckoView");
                Constructor<?> consGecko = classGecko.getConstructor(Context.class);
                webview = (ViewGroup) consGecko.newInstance(context);
                this.isGecko = true;
            } catch (Exception e) {
                e.printStackTrace();
            }
        } else {
            webview = new LeanWebView(context);
        }
        ViewGroup.LayoutParams layoutParams = new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        webview.setLayoutParams(layoutParams);
        this.addView(webview);
    }

    public void setupWebview(MainActivity activity, boolean isRoot) {
        if (isGecko) {
            // GeckoView setup is provided by the gecko plugin (migrated separately to median-core).
            try {
                Class<?> geckoSetupClass = Class.forName("co.median.plugins.android.geckoview.WebViewSetup");
                Method setupWebview = geckoSetupClass.getMethod("setupWebviewForActivity", Activity.class, GoNativeWebviewInterface.class, boolean.class);
                setupWebview.invoke(geckoSetupClass, activity, (GoNativeWebviewInterface) webview, isRoot);
            } catch (ClassNotFoundException | NoSuchMethodException | InvocationTargetException | IllegalAccessException e) {
                e.printStackTrace();
            }
        } else {
            WebViewSetup.setupWebviewForActivity(getWebview(), activity);
        }
    }

    public GoNativeWebviewInterface getWebview() {
        return (GoNativeWebviewInterface) webview;
    }

}
