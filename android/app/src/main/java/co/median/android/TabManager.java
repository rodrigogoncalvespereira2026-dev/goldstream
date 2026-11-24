package co.median.android;

import android.content.res.ColorStateList;
import android.content.res.Resources;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.os.Handler;
import android.text.TextUtils;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.widget.RelativeLayout;

import androidx.annotation.NonNull;
import androidx.coordinatorlayout.widget.CoordinatorLayout;
import androidx.core.content.ContextCompat;

import com.google.android.material.behavior.HideViewOnScrollBehavior;
import com.google.android.material.bottomnavigation.BottomNavigationView;
import com.google.android.material.navigation.NavigationBarView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import co.median.android.widget.BottomNavigationShowOnScrollBehavior;
import co.median.core.config.nav2.BottomTabComponent;
import co.median.core.config.nav2.MenuBarItem;
import co.median.core.config.TabNavigationConfig;
import co.median.core.config.TabSelectionRule;
import co.median.core.util.GNLog;
import co.median.core.util.LeanUtils;

/**
 * Created by Weiyin He on 9/22/14.
 * Copyright 2014 GoNative.io LLC
 */
public class TabManager implements NavigationBarView.OnItemSelectedListener {
    private static final String TAG = TabManager.class.getName();
    private static final int maxTabs = 5;

    private final MainActivity mainActivity;
    private final BottomNavigationView bottomNav;
    private final View bottomNavBackgroundView;
    private BottomNavigationShowOnScrollBehavior behavior;
    private RelativeLayout.LayoutParams bottomNavBackgroundViewParams;
    private int behaviorState;

    private String currentMenuId;
    private BottomTabComponent currentNav2TabBar;
    private String currentUrl;
    private JSONArray tabs;
    private Map<String, TabMenu> tabMenus;

    private final int iconSize;
    private int iconColor;
    private int bottomNavHeight = 0;

    private final Map<JSONObject, List<Pattern>> tabRegexCache = new HashMap<>(); // regex for each tab to auto-select
    private boolean useJavascript; // do not use tabs from config

    private boolean performAction = true;

    TabManager(MainActivity mainActivity, BottomNavigationView bottomNav) {
        this.mainActivity = mainActivity;
        this.bottomNav = bottomNav;
        this.bottomNav.setOnItemSelectedListener(this);
        this.bottomNavBackgroundView = mainActivity.findViewById(R.id.bottom_nav_spacer);
        this.bottomNavBackgroundViewParams =
                (RelativeLayout.LayoutParams) bottomNavBackgroundView.getLayoutParams();

        iconSize = this.mainActivity.getResources().getInteger(R.integer.tabbar_icon_size);
        iconColor = ContextCompat.getColor(mainActivity, R.color.tabBarTextColor);

        initializeTabMenus();

        this.bottomNav.addOnLayoutChangeListener((view, i, top, i2, bottom, i4, i5, i6, i7) -> {
            bottomNavHeight = 0;
            if (bottomNav.getVisibility() == View.VISIBLE) {
                bottomNavHeight = bottom - top;
            }

            setBottomNavBarBackgroundHeight(bottomNavHeight);
        });

        if (MedianConfig.hideTabBarOnScroll()) {
            CoordinatorLayout.LayoutParams params =
                    (CoordinatorLayout.LayoutParams) bottomNav.getLayoutParams();

            this.behavior =
                    (BottomNavigationShowOnScrollBehavior) params.getBehavior();

            if (behavior != null) {
                behavior.setTabManager(this);
                behavior.addOnScrollStateChangedListener((view, newState) -> {
                    if (behaviorState == newState) return;
                    behaviorState = newState;
                    if (newState == HideViewOnScrollBehavior.STATE_SCROLLED_IN) {
                        AnimationUtil.animateHeight(bottomNavBackgroundView, bottomNavBackgroundViewParams, 0, bottomNavHeight, 250L);
                    } else if (newState == HideViewOnScrollBehavior.STATE_SCROLLED_OUT) {
                        AnimationUtil.animateHeight(bottomNavBackgroundView, bottomNavBackgroundViewParams, bottomNavHeight, 0, 150L);
                    }
                });
            }
        }
    }

    public void slideIn() {
        if (!MedianConfig.hideTabBarOnScroll()
                || bottomNav.getVisibility() == View.GONE
                || behavior == null
                || behaviorState == HideViewOnScrollBehavior.STATE_SCROLLED_IN)
            return;
        behavior.slideIn(bottomNav, true);
    }

    public void slideOut() {
        if (!MedianConfig.hideTabBarOnScroll()
                || bottomNav.getVisibility() == View.GONE
                || behavior == null
                || behaviorState == HideViewOnScrollBehavior.STATE_SCROLLED_OUT)
            return;
        behavior.slideOut(bottomNav, true);
    }

    public boolean isHideTopNavOnScrollActive() {
        return mainActivity.getActionManager().isHideOnScrollActive();
    }

    public void setBottomNavBarBackgroundHeight(int height) {
        this.bottomNavBackgroundViewParams.height = height;
        this.bottomNavBackgroundView.setLayoutParams(bottomNavBackgroundViewParams);
    }

    // Tab-menu id whose selection regex matches the URL (median-core tabNavigation), or null.
    private String tabMenuIdForUrl(String url) {
        TabNavigationConfig tn = MedianConfig.get().getConfigRoot().getNavigation().getTabNavigation();
        if (tn == null) return null;
        for (TabSelectionRule rule : tn.getTabSelectionConfig()) {
            if (!rule.getRegex().isEmpty()) {
                try {
                    if (Pattern.compile(rule.getRegex()).matcher(url).matches()) return rule.getId();
                } catch (Exception ignored) {}
            }
        }
        return null;
    }

    // The tab menu's items as org.json (median-core exposes raw JSON via itemsJson()).
    private JSONArray tabItemsForId(String id) {
        TabNavigationConfig tn = MedianConfig.get().getConfigRoot().getNavigation().getTabNavigation();
        if (tn == null || id == null) return null;
        for (co.median.core.config.TabMenu tm : tn.getTabMenus()) {
            if (tm.getId().equals(id)) {
                try { return new JSONArray(tm.itemsJson()); } catch (Exception e) { return null; }
            }
        }
        return null;
    }

    private void initializeTabMenus(){
        TabNavigationConfig tn = MedianConfig.get().getConfigRoot().getNavigation().getTabNavigation();
        if (tn == null) return;

        tabMenus = new HashMap<>();
        Map<String, Pattern> tabSelectionConfig = new HashMap<>();
        for (TabSelectionRule rule : tn.getTabSelectionConfig()) {
            if (!rule.getRegex().isEmpty()) {
                try { tabSelectionConfig.put(rule.getId(), Pattern.compile(rule.getRegex())); } catch (Exception ignored) {}
            }
        }

        for (co.median.core.config.TabMenu tm : tn.getTabMenus()) {
            TabMenu item = new TabMenu();
            try { item.tabs = new JSONArray(tm.itemsJson()); } catch (Exception e) { item.tabs = new JSONArray(); }
            item.urlRegex = tabSelectionConfig.get(tm.getId());
            tabMenus.put(tm.getId(), item);
        }
    }

    // --- Native Navigation V2 (contract: NATIVE-NAV-V2-CONTRACT.md) ---

    // Applies the resolved bottom-tab component; V1 tabNavigation menus are bypassed.
    public void applyNav2(String url, BottomTabComponent bottomTabBar) {
        this.currentUrl = url;

        if (url == null || MedianConfig.get().isUrlSplashPage(url)) return;

        if (this.useJavascript) {
            autoSelectTab(url);
            return;
        }

        if (bottomTabBar == null || !bottomTabBar.getActive() || bottomTabBar.getItems().isEmpty()) {
            this.currentNav2TabBar = null;
            showTabs(false);
            return;
        }

        if (!bottomTabBar.equals(this.currentNav2TabBar)) {
            this.currentNav2TabBar = bottomTabBar;
            setTabs(menuBarItemsToJson(bottomTabBar.getItems()));
            showTabs(bottomNav.getMenu().size() != 0);
        }

        int selected = bottomTabBar.selectedItemIndex(url);
        if (selected >= 0) {
            MenuItem item = bottomNav.getMenu().findItem(selected);
            if (item != null) item.setChecked(true);
        }
    }

    // Bridge nav2 MenuBarItems to the JSON shape setTabs consumes (icon = active icon).
    private JSONArray menuBarItemsToJson(List<MenuBarItem> items) {
        JSONArray array = new JSONArray();
        for (MenuBarItem item : items) {
            JSONObject obj = new JSONObject();
            try {
                obj.put("label", item.getLabel());
                if (item.getUrl() != null) obj.put("url", item.getUrl());
                if (item.getIcon() != null) obj.put("icon", item.getIcon());
                if (item.getInactiveIcon() != null) obj.put("inactiveIcon", item.getInactiveIcon());
            } catch (JSONException ignored) {}
            array.put(obj);
        }
        return array;
    }

    public void checkTabs(String url) {
        this.currentUrl = url;

        if (this.mainActivity == null || url == null) {
            return;
        }

        if (MedianConfig.get().isUrlSplashPage(url))
            return;

        if (this.useJavascript) {
            autoSelectTab(url);
            return;
        }

        String menuId = tabMenuIdForUrl(url);
        setMenuID(menuId);

        if (menuId != null) autoSelectTab(url);
    }

    private void setMenuID(String id){
        if (id == null) {
            this.currentMenuId = null;
            showTabs(false);
        }
        else if (this.currentMenuId == null || !this.currentMenuId.equals(id)) {
            this.currentMenuId = id;
            JSONArray tabs = tabItemsForId(id);
            setTabs(tabs);
            showTabs(bottomNav.getMenu().size() != 0);
        }
    }

    private void setTabs(JSONArray tabs) {
        this.tabs = tabs;

        if (tabs == null) {
            bottomNav.getMenu().clear();
            return;
        }

        Menu menu = bottomNav.getMenu();
        int selectedNumber = -1;
        int menuSize = menu.size();
        int tabsLength = tabs.length();

        for (int i = 0; i < tabs.length(); i++) {
            if(i > (maxTabs-1)){
                GNLog.getInstance().logError(TAG, "Tab menu items list should not have more than 5 items");
                break;
            }

            JSONObject item = tabs.optJSONObject(i);
            if (item == null) continue;

            String label = item.optString("label");
            String icon = item.optString("icon");
            String activeIcon = item.optString("activeIcon");
            String inactiveIcon = item.optString("inactiveIcon");

            // if no label, icon and url is provided, do not include
            if(label.isEmpty() && icon.isEmpty() && activeIcon.isEmpty() && item.optString("url").isEmpty()){
                continue;
            }

            // set default drawable "Question Mark" when no icon provided
            if (icon.isEmpty()) {
                if (!activeIcon.isEmpty()) {
                    icon = activeIcon;
                } else {
                    icon = "faw_question";
                }
            }

            if (activeIcon.isEmpty()) {
                activeIcon = icon;
            }

            if (inactiveIcon.isEmpty()) {
                inactiveIcon = icon;
            }

            Drawable iconDrawable = IconUtils.generateMenuIconStates(mainActivity, activeIcon, inactiveIcon, iconSize, iconColor);

            if (i < menuSize) {
                // update existing menu item
                MenuItem menuItem = menu.getItem(i);
                if (menuItem != null) {
                    menuItem.setTitle(label);
                    menuItem.setIcon(iconDrawable);
                }
            } else {
                // add new menu item
                menu.add(Menu.NONE, i, Menu.NONE, label)
                        .setIcon(iconDrawable);
            }

            if (item.optBoolean("selected")) {
                selectedNumber = i;
            }
        }

        // remove extra items if any
        if (menuSize > tabsLength) {
            for (int i = tabsLength; i < menuSize; i++) {
                MenuItem menuItem = menu.getItem(tabsLength);
                if (menuItem != null) {
                    menu.removeItem(menuItem.getItemId());
                }
            }
        }

        // select the tab if needed
        if (selectedNumber > -1) {

            // add a delay when programmatically selecting a tab to prevent unintended rearrange animations
            int finalSelectedNumber = selectedNumber;
            new Handler().postDelayed(() -> selectTabNumber(finalSelectedNumber, false), 10);
        }
    }

    // regex used for auto tab selection
    private List<Pattern> getRegexForTab(JSONObject tabConfig) {
        if (tabConfig == null) return null;

        Object regex = tabConfig.opt("regex");
        if (regex == null) return null;

        return LeanUtils.createRegexArrayFromStrings(regex);
    }

    private List<Pattern> getCachedRegexForTab(int position) {
        if (tabs == null || position < 0 || position >= tabs.length()) return null;

        JSONObject tabConfig = tabs.optJSONObject(position);
        if (tabConfig == null) return null;

        if (tabRegexCache.containsKey(tabConfig)) {
            return tabRegexCache.get(tabConfig);
        } else {
            List<Pattern> regex = getRegexForTab(tabConfig);
            tabRegexCache.put(tabConfig, regex);
            return regex;
        }
    }

    public void autoSelectTab(String url) {
        if (tabs == null) return;

        for (int i = 0; i < tabs.length(); i++) {
            List<Pattern> patternList = getCachedRegexForTab(i);
            if (patternList == null) continue;

            for(Pattern regex : patternList) {
                if (regex.matcher(url).matches()) {
                    bottomNav.getMenu().findItem(i).setChecked(true);
                    return;
                }
            }
        }
    }

    @SuppressWarnings("UnusedReturnValue")
    public boolean selectTab(String url, String javascript) {
        if (url == null) return false;

        if (javascript == null) javascript = "";

        if (this.tabs != null) {
            for (int i = 0; i < this.tabs.length(); i++) {
                JSONObject entry = this.tabs.optJSONObject(i);
                if (entry != null) {
                    String entryUrl = entry.optString("url");
                    String entryJs = entry.optString("javascript");

                    if (url.equals(entryUrl) && javascript.equals(entryJs)) {
                        if (this.bottomNav != null) {
                            this.bottomNav.setSelectedItemId(i);
                            return true;
                        }
                    }

                }
            }
        }

        return false;
    }

    public void setTabsWithJson(JSONObject tabsJson, int tabMenuId) {
        if(tabsJson == null) return;

        this.useJavascript = true;

        JSONArray tabs = tabsJson.optJSONArray("items");
        if (tabs != null) setTabs(tabs);

        // Tab menu ids are strings in the config; median-core sends tabMenu as a string.
        String menuId = tabsJson.has("tabMenu") ? tabsJson.optString("tabMenu")
                : tabMenuId != -1 ? Integer.toString(tabMenuId) : null;
        if (menuId != null) {
            TabMenu tabMenu = tabMenus != null ? tabMenus.get(menuId) : null;
            if(tabMenu == null || tabs != null) return;
            setTabs(tabMenu.tabs);
        }

        Object enabled = tabsJson.opt("enabled");
        if (enabled instanceof Boolean) {
            showTabs((Boolean) enabled);
        }
    }

    public void selectTabNumber(int tabNumber, boolean performAction) {
        if (tabNumber < 0 || tabNumber >= bottomNav.getMenu().size()) {
            return;
        }
        this.performAction = performAction;
        this.bottomNav.setSelectedItemId(tabNumber);
    }

    @Override
    public boolean onNavigationItemSelected(@NonNull MenuItem item) {
        if (this.tabs != null) {
            JSONObject entry = this.tabs.optJSONObject(item.getItemId());

            String url = entry.optString("url");
            String javascript = entry.optString("javascript");

            if (!performAction) {
                performAction = true;
                return true;
            }

            if (!TextUtils.isEmpty(url)) {
                if (!TextUtils.isEmpty(javascript)) mainActivity.getUrlLoader().loadUrlAndJavascript(url, javascript, true, true);
                else mainActivity.getUrlLoader().loadUrl(url, true, true);
            }
        }
        return true;
    }

    public void showTabs(boolean show) {
        mainActivity.runOnUiThread(() -> {
            if (show) this.bottomNav.setVisibility(View.VISIBLE);
            else {
                this.bottomNav.setVisibility(View.GONE);
                setBottomNavBarBackgroundHeight(0);
                this.bottomNavHeight = 0;
            }
        });
    }

    public void deselectTabs() {
        Menu menu = bottomNav.getMenu();
        menu.setGroupCheckable(0, true, false);
        for(int i = 0; i < menu.size(); i++) {
            menu.getItem(i).setChecked(false);
        }
        menu.setGroupCheckable(0, true, true);
    }

    public void onThemeChanged() {
        Resources.Theme theme = mainActivity.getTheme();

        bottomNav.setBackgroundColor(mainActivity.getResources().getColor(R.color.tabBarBackground, theme));

        this.iconColor = mainActivity.getResources().getColor(R.color.tabBarTextColor, theme);
        int indicatorColor = mainActivity.getResources().getColor(R.color.tabBarIndicator, theme);

        int[][] states = new int[][]{
                new int[]{android.R.attr.state_checked},
                new int[]{-android.R.attr.state_checked}
        };

        int[] colors = new int[]{
                indicatorColor,
                iconColor
        };

        ColorStateList csl = new ColorStateList(states, colors);

        bottomNav.setItemIconTintList(csl);
        bottomNav.setItemTextColor(csl);

        float disabledAlpha = 0.38f;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            disabledAlpha = mainActivity.getResources().getFloat(R.dimen.material_emphasis_disabled);
        }

        int activatedColor = adjustAlpha(indicatorColor, disabledAlpha);
        int checkedColor   = adjustAlpha(indicatorColor, disabledAlpha);
        states = new int[][]{
                new int[]{android.R.attr.state_activated},
                new int[]{android.R.attr.state_checked}
        };

        colors = new int[]{
                activatedColor,
                checkedColor
        };

        csl = new ColorStateList(states, colors);

        bottomNav.setItemActiveIndicatorEnabled(true);
        bottomNav.setItemActiveIndicatorColor(csl);
    }

    private int adjustAlpha(int color, float factor) {
        int alpha = Math.round(Color.alpha(color) * factor);
        return (color & 0x00FFFFFF) | (alpha << 24);
    }

    private static class TabMenu {
        Pattern urlRegex;
        JSONArray tabs;
    }
}
