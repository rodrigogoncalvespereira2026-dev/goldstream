package co.median.android

import android.content.res.Configuration
import android.view.MenuItem
import android.view.View
import android.widget.ExpandableListView
import android.widget.ImageView
import android.widget.RelativeLayout
import android.widget.TextView
import androidx.appcompat.app.ActionBarDrawerToggle
import androidx.appcompat.widget.Toolbar
import androidx.core.content.ContextCompat
import androidx.core.view.GravityCompat
import androidx.drawerlayout.widget.DrawerLayout
import co.median.android.icons.Icon
import co.median.android.widget.GoNativeDrawerLayout
import co.median.core.config.ConfigObserver
import co.median.core.config.nav2.SidebarComponent
import com.google.android.material.navigation.NavigationView
import org.json.JSONArray
import org.json.JSONObject
import java.util.regex.Pattern

class SideNavManager(val main: MainActivity) {

    private val drawerLayout: GoNativeDrawerLayout = main.findViewById(R.id.drawer_layout)
    private var drawerToggle: ActionBarDrawerToggle? = null
    private val navMenu: NavigationView = main.findViewById(R.id.nav_menu)
    private val headerView = navMenu.findViewById<RelativeLayout>(R.id.header_layout)
    private val expandableListView = navMenu.findViewById<ExpandableListView>(R.id.drawer_list)
    private val jsonMenuAdapter = JsonMenuAdapter(main, expandableListView)
    private val menuActions: MutableMap<MenuItem, String> = mutableMapOf()
    private var isRoot = true
    private var drawerListenerAdded = false
    private var sidebarNavigationEnabled = true
    private var status: String = "default"

    private val configObserver = object : ConfigObserver {
        override fun onMenuChanged() {
            // nav2: sidebar is owned by the resolved instance + JS overrides (applyNav2) — C5
            if (MedianConfig.get().isNativeNavigationV2) return
            updateMenu(status)
        }
    }

    init {
        MedianConfig.get().addObserver(configObserver)
    }

    // A2: called from MainActivity.onDestroy — the config singleton outlives the activity
    fun teardown() = MedianConfig.get().removeObserver(configObserver)

    fun setupNavigationMenu(isRoot: Boolean) {
        this.isRoot = isRoot

        // Drawer toggle/Hamburger icon click events
        // Do not initialize drawer toggle for non-root window or back button will not work
        if (isRoot) {
            drawerToggle?.let { drawerLayout.removeDrawerListener(it) }
            drawerListenerAdded = false
            drawerToggle = object :
                ActionBarDrawerToggle(
                    main,
                    drawerLayout,
                    R.string.drawer_open,
                    R.string.drawer_close
                ) {
                override fun onDrawerClosed(view: View) {
                    drawerLayout.setDisableTouch(main.isSwipeGesturesEnabled && main.canGoBack());
                }

                override fun onDrawerOpened(drawerView: View) {
                    drawerLayout.setDisableTouch(false);
                }
            }.apply {
                isDrawerIndicatorEnabled = true
                drawerArrowDrawable.color = ContextCompat.getColor(main, R.color.titleTextColor)
            }
        }

        navMenu.apply {
            setNavigationItemSelectedListener { item ->
                closeDrawer()
                handleMenuClick(item)
            }
        }

        setupHeader()
        updateMenu(status)
    }

    private fun handleMenuClick(menuItem: MenuItem): Boolean {
        val url = menuActions[menuItem]
        url?.let {
            this.main.urlLoader.loadUrl(url, true)
            return true
        } ?: return false
    }

    fun showNavigationMenu(show: Boolean) {
        drawerLayout.setDrawerLockMode(if (show) DrawerLayout.LOCK_MODE_UNLOCKED else DrawerLayout.LOCK_MODE_LOCKED_CLOSED)
        val toggle = drawerToggle ?: return
        if (show && !drawerListenerAdded) {
            drawerLayout.addDrawerListener(toggle)
            drawerListenerAdded = true
        } else if (!show && drawerListenerAdded) {
            drawerLayout.removeDrawerListener(toggle)
            drawerListenerAdded = false
        }
    }

    private fun setupHeader() {
        val showLogo = MedianConfig.sidebarShowLogo()
        val showAppName = MedianConfig.sidebarShowAppName()
        if (!showLogo && !showAppName) {
            headerView.visibility = View.GONE
        }

        if (!showLogo) {
            val appIcon: ImageView? = headerView.findViewById(R.id.app_logo)
            appIcon?.visibility = View.GONE
        }

        val appName: TextView? = headerView.findViewById(R.id.app_name)
        appName?.apply {
            if (showAppName) {
                text = MedianConfig.get().configRoot.general.appName
            } else {
                visibility = View.INVISIBLE
            }
        }
    }

    fun autoSelectItem(url: String) {
        this.jsonMenuAdapter.autoSelectItem(url)
    }

    // --- Native Navigation V2 (contract: NATIVE-NAV-V2-CONTRACT.md) ---

    // Applies the resolved sidebar component; V1 menus/sidebarEnabledRegex are bypassed.
    fun applyNav2(sidebar: SidebarComponent?) {
        val active = isNav2SidebarShown(sidebar)
        if (active) {
            jsonMenuAdapter.update(menuItemsToJson(sidebar!!.items))
        }
        showNavigationMenu(isRoot && active)
        setDrawerEnabled(active)
    }

    companion object {
        // A nav2 sidebar shows only when it is on and has items, as on iOS.
        @JvmStatic
        fun isNav2SidebarShown(sidebar: SidebarComponent?): Boolean =
            sidebar != null && sidebar.active && sidebar.items.isNotEmpty()
    }

    fun checkUrl(url: String) {
        // nav2: per-URL drawer enablement comes from the resolved instance (applyNav2), not sidebarEnabledRegex
        if (!MedianConfig.get().isNativeNavigationV2) {
            setDrawerEnabled(shouldShowSidebar(url))
        }

        // When current URL canGoBack and swipeGestures are enabled, disable touch events on DrawerLayout
        if (this.drawerLayout.getDrawerLockMode(GravityCompat.START) != DrawerLayout.LOCK_MODE_LOCKED_CLOSED) {
            drawerLayout.setDisableTouch(main.isSwipeGesturesEnabled && main.canGoBack())
        }
    }

    fun setSideBarNavigationEnabled(enabled: Boolean) {
        // nav2: median-core keeps the JS flag across pages and re-renders through applyNav2
        if (MedianConfig.get().isNativeNavigationV2) {
            MedianConfig.get().setNavSidebarEnabled(enabled)
            return
        }
        sidebarNavigationEnabled = enabled
        setDrawerEnabled(enabled)
    }

    private fun setDrawerEnabled(enabled: Boolean) {
        if (!isRoot) return

        // nav2: showNavigationMenu is V1-derived; V2 enablement is the resolved instance's sidebar.active
        if (!MedianConfig.get().showNavigationMenu && !MedianConfig.get().isNativeNavigationV2) return

        drawerLayout.setDrawerLockMode(if (enabled) GoNativeDrawerLayout.LOCK_MODE_UNLOCKED else GoNativeDrawerLayout.LOCK_MODE_LOCKED_CLOSED)

        if ((sidebarNavigationEnabled || MedianConfig.get().configRoot.styling.showActionBar) && enabled) {
            val toolbar: Toolbar? = main.findViewById(R.id.toolbar)
            if (toolbar != null) {
                toolbar.visibility = View.VISIBLE
            }
        }

        // the home button may be showing a top bar left-slot icon from an earlier page
        if (enabled) drawerToggle?.syncState()

        main.supportActionBar?.apply {
            setDisplayHomeAsUpEnabled(enabled)

            // Set navigation menu icon
            val sideBarMenuIcon = MedianConfig.get().configRoot.navigation.sidebarNavigation?.menuIcon
            if (!sideBarMenuIcon.isNullOrBlank()) {
                val menuItemSize: Int =
                    main.resources.getDimensionPixelSize(R.dimen.action_menu_icon_size)
                val colorForeground = ContextCompat.getColor(main, R.color.titleTextColor)
                val drawableIcon = Icon(main, sideBarMenuIcon, menuItemSize, colorForeground).getDrawable()
                setHomeAsUpIndicator(drawableIcon)
            }
        }

    }

    fun isDrawerOpen(): Boolean = drawerLayout.isDrawerOpen(navMenu)
    fun closeDrawer() = drawerLayout.closeDrawers()

    fun isToggleMenuSelected(menuItem: MenuItem): Boolean =
        drawerToggle?.onOptionsItemSelected(menuItem) == true

    fun toggleSyncState() = drawerToggle?.syncState()
    fun toggleConfigurationChanged(newConfig: Configuration) =
        drawerToggle?.onConfigurationChanged(newConfig)

    fun updateMenu(status: String = "default") {
        this.status = status
        // nav2: never stomp the resolved sidebar with V1 sidebarMenus (C5, incl. the
        // setupNavigationMenu path re-run on onMaxWindowsReached)
        if (MedianConfig.get().isNativeNavigationV2) return
        this.jsonMenuAdapter.update(menuItemsToJson(MedianConfig.get().sidebarMenus))
    }

    // Whether the sidebar should show for [url] (median-core sidebarEnabledRegex; empty = always).
    private fun shouldShowSidebar(url: String): Boolean {
        val regex = MedianConfig.get().configRoot.navigation.sidebarNavigation?.sidebarEnabledRegex
        if (regex.isNullOrEmpty()) return true
        return runCatching { Pattern.compile(regex).matcher(url).matches() }.getOrDefault(true)
    }

    // Bridge median-core typed MenuItems to the JSONArray shape JsonMenuAdapter renders.
    private fun menuItemsToJson(items: List<co.median.core.config.MenuItem>): JSONArray {
        val array = JSONArray()
        for (item in items) {
            val obj = JSONObject()
            obj.put("label", item.label)
            item.url?.let { obj.put("url", it) }
            item.icon?.let { obj.put("icon", it) }
            obj.put("isGrouping", item.isGrouping)
            obj.put("isLogout", item.isLogout)
            if (item.subLinks.isNotEmpty()) obj.put("subLinks", menuItemsToJson(item.subLinks))
            array.put(obj)
        }
        return array
    }

    fun onThemeChanged() {
        val theme = main.theme
        navMenu.setBackgroundColor(main.resources.getColor(R.color.sidebarBackground, theme))
        jsonMenuAdapter.onThemeChanged()
    }
}