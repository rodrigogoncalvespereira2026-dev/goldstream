package co.median.android;

import co.median.core.config.MutableConfig;
import co.median.core.config.MutableConfigState;
import co.median.core.config.nav2.NavDefaultStyles;

/**
 * Shell convenience accessor for the median-core config singleton.
 * Replaces {@code AppConfig.getInstance(context)} reads during the migration.
 */
public final class MedianConfig {
    private MedianConfig() {}

    /** The runtime-mutable config state (auto-loads appConfig.json on first access). */
    public static MutableConfigState get() {
        return MutableConfig.INSTANCE.getInstance();
    }

    public static boolean hideTopNavBarOnScroll() {
        NavDefaultStyles styles = get().getNavDefaultStyles();
        return styles != null && styles.getTopNavigationBar().getStyling().getAndroid().getHideOnScroll();
    }

    public static boolean sidebarShowLogo() {
        NavDefaultStyles styles = get().getNavDefaultStyles();
        return styles == null || styles.getSidebarNavigationBar().getStyling().getAndroid().getShowLogo();
    }

    public static boolean sidebarShowAppName() {
        NavDefaultStyles styles = get().getNavDefaultStyles();
        return styles == null || styles.getSidebarNavigationBar().getStyling().getAndroid().getShowAppName();
    }

    public static boolean hideTabBarOnScroll() {
        NavDefaultStyles styles = get().getNavDefaultStyles();
        return styles != null && styles.getBottomTabBar().getStyling().getAndroid().getHideOnScroll();
    }
}
