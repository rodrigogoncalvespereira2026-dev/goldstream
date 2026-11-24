package co.median.android

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.drawable.Drawable
import android.text.TextUtils
import android.util.Log
import android.view.LayoutInflater
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.ImageView
import android.widget.ListView
import android.widget.PopupWindow
import android.widget.TextView
import androidx.appcompat.app.ActionBar
import androidx.appcompat.content.res.AppCompatResources
import androidx.appcompat.widget.SearchView
import androidx.appcompat.widget.Toolbar
import androidx.coordinatorlayout.widget.CoordinatorLayout
import androidx.core.content.ContextCompat
import androidx.core.graphics.BlendModeColorFilterCompat
import androidx.core.graphics.BlendModeCompat
import co.median.android.icons.Icon
import co.median.core.config.NavigationTitleRule
import co.median.core.config.nav2.MenuBarItem
import co.median.core.config.nav2.TopNavComponent
import com.google.android.material.appbar.AppBarLayout
import com.google.android.material.appbar.MaterialToolbar
import org.json.JSONArray
import org.json.JSONObject
import java.io.UnsupportedEncodingException
import java.net.URLEncoder
import java.util.regex.Pattern


class ActionManager(private val main: MainActivity) {

    private var isRoot = true
    private var actionBar: ActionBar? = null
    private var appBarLayout: AppBarLayout? = null
    private var appBarBehavior: AppBarLayout.Behavior? = null
    private val toolbar: MaterialToolbar = main.findViewById(R.id.toolbar)
    private val titleImageView = main.findViewById<ImageView>(R.id.title_image)
    private val topNavHideOnScrollSpacer = main.findViewById<View>(R.id.top_nav_hide_on_scroll_spacer)
    private val itemToUrl: HashMap<MenuItem, String> = HashMap()
    private val menuItemSize: Int =
        main.resources.getDimensionPixelSize(R.dimen.action_menu_icon_size)
    private val overflowListWidth = main.resources.getDimensionPixelSize(R.dimen.action_custom_overflow_menu_width)
    private var colorForeground = ContextCompat.getColor(main, R.color.titleTextColor)
    private var menu: Menu? = null
    private var searchView: SearchView? = null
    private var currentMenuID: String? = null
    private var leftActionConfigured = false
    private var leftActionUrl: String? = null
    private var overflowPopupWindow: PopupWindow? = null
    private var topNavHeight = 0
    private var titleImageOverrideBytes: ByteArray? = null
    private var titleImageOverrideBitmap: Bitmap? = null
    private var titleImageOverrideShown = false
    private var hideOnScrollEnabled = false;
    private var hideBottomNavOnScrollEnabled = false

    init {
        main.setSupportActionBar(toolbar)
    }

    fun setupActionBar(isRoot: Boolean) {
        this.isRoot = isRoot
        this.actionBar = main.supportActionBar ?: return
        this.appBarLayout = main.findViewById(R.id.appBar)

        val params = appBarLayout?.layoutParams as? CoordinatorLayout.LayoutParams
        if (params != null) {
            val behavior = params.behavior as? AppBarLayout.Behavior
                ?: AppBarLayout.Behavior().also {
                    params.behavior = it
                }

            this.appBarBehavior = behavior
        }

        this.hideBottomNavOnScrollEnabled = MedianConfig.hideTabBarOnScroll()

        actionBar?.apply {
            if (isRoot) {
                if (!MedianConfig.get().showNavigationMenu) {
                    setDisplayHomeAsUpEnabled(false)
                }
            } else {
                setDisplayHomeAsUpEnabled(true)
                setDisplayShowHomeEnabled(true)
            }
        }

        toolbar.apply {

            // Menu item on click events
            setOnMenuItemClickListener { menuItem ->
                handleMenuClick(menuItem)
            }

            // Home/Up button
            navigationIcon?.colorFilter =
                BlendModeColorFilterCompat.createBlendModeColorFilterCompat(
                    colorForeground,
                    BlendModeCompat.SRC_ATOP
                )
        }

        this.toolbar.addOnLayoutChangeListener { _: View?, _: Int, top: Int, _: Int, bottom: Int, _: Int, _: Int, _: Int, _: Int ->
            this.topNavHeight = bottom - top
        }

        enableHideOnScroll(MedianConfig.hideTopNavBarOnScroll() && isActionBarShowing())
    }

    var offsetChangedListener: AppBarLayout.OnOffsetChangedListener? = null

    fun enableHideOnScroll(enable: Boolean) {
        val params: AppBarLayout.LayoutParams =
            toolbar.layoutParams as AppBarLayout.LayoutParams

        if (enable && !hideOnScrollEnabled) {
            params.setScrollFlags(
                AppBarLayout.LayoutParams.SCROLL_FLAG_SCROLL
                        or AppBarLayout.LayoutParams.SCROLL_FLAG_ENTER_ALWAYS
                        or AppBarLayout.LayoutParams.SCROLL_FLAG_SNAP
            )

            offsetChangedListener = AppBarLayout.OnOffsetChangedListener { appBar, verticalOffset ->
                val offset = topNavHeight + verticalOffset
                setTopHavSpacerHeight(offset)

                val totalRange = appBar.totalScrollRange
                val halfRange = totalRange / 2

                if (hideBottomNavOnScrollEnabled && isActionBarShowing()) {
                    // Let the AppBar control the bottom nav animation for synchronization
                    when {
                        // More than halfway expanded
                        kotlin.math.abs(verticalOffset) < halfRange -> {
                            main.tabManager.slideIn()
                        }

                        // More than halfway collapsed
                        kotlin.math.abs(verticalOffset) >= halfRange -> {
                            main.tabManager.slideOut()
                        }
                    }
                }
            }

            appBarLayout?.addOnOffsetChangedListener(offsetChangedListener)

            this.hideOnScrollEnabled = true
        } else if(!enable && hideOnScrollEnabled) {
            if (offsetChangedListener != null) {
                appBarLayout?.removeOnOffsetChangedListener(offsetChangedListener)
            }
            params.scrollFlags = 0
            this.hideOnScrollEnabled = false
        }
    }

    private fun setTopHavSpacerHeight(height: Int) {
        val params = topNavHideOnScrollSpacer.layoutParams
        params.height = height
        topNavHideOnScrollSpacer.layoutParams = params
    }

    fun showActionBar() {
        if (!isActionBarShowing()) {
            actionBar?.show()
        }

        if (MedianConfig.hideTopNavBarOnScroll() && !hideOnScrollEnabled) {
            enableHideOnScroll(true)
        }
    }

    fun hideActionBar() {
        if (hideOnScrollEnabled) {
            enableHideOnScroll(false)
            actionBar?.hide()
            setTopHavSpacerHeight(0)
        } else {
            actionBar?.hide()
        }
    }

    fun expandAppBar() {
        if (!MedianConfig.hideTopNavBarOnScroll() || appBarLayout == null) return
        appBarLayout?.setExpanded(true, true)
    }

    fun isActionBarShowing(): Boolean {
        return actionBar?.isShowing ?: false
    }

    fun isHideOnScrollActive(): Boolean{
        return isActionBarShowing() && hideOnScrollEnabled
    }

    private fun handleMenuClick(menuItem: MenuItem): Boolean {
        val url = itemToUrl[menuItem]
        return handleAction(url)
    }

    private fun handleAction(urlAction: String?): Boolean {
        urlAction?.let {
            when (it) {
                ACTION_SHARE -> main.sharePage("", "")
                ACTION_REFRESH -> main.onRefresh()
                ACTION_SEARCH -> {
                    // ignore action as this is handled by the SearchView widget
                }
                ACTION_OVERFLOW -> {
                    showPopupOverflowWindow()
                }

                else -> {
                    this.main.urlLoader.loadUrl(urlAction, true);
                }
            }
            return true
        } ?: return false
    }

    // Action-menu id whose selection regex matches [url] (median-core navigation.actionConfig).
    private fun actionMenuIdForUrl(url: String): String? {
        val selection = MedianConfig.get().configRoot.navigation.actionConfig?.actionSelection ?: return null
        for (rule in selection) {
            if (rule.regex.isNotEmpty() &&
                runCatching { Pattern.compile(rule.regex).matcher(url).matches() }.getOrDefault(false)) {
                return rule.id
            }
        }
        return null
    }

    private fun actionMenuForId(id: String?) =
        if (id == null) null
        else MedianConfig.get().configRoot.navigation.actionConfig?.actions?.find { it.id == id }

    // The action menu's items as org.json (median-core exposes raw JSON via itemsJson()).
    private fun actionItemsForId(id: String?): JSONArray? {
        val menu = actionMenuForId(id) ?: return null
        return runCatching { JSONArray(menu.itemsJson()) }.getOrNull()
    }

    // --- Native Navigation V2 (contract: NATIVE-NAV-V2-CONTRACT.md) ---

    private var nav2TopNav: TopNavComponent? = null
    private var nav2SidebarActive = false

    // Applies the resolved top-bar component for [url]; V1 actionConfig/titleRuleForUrl are bypassed.
    fun applyNav2(url: String, topNav: TopNavComponent?, sidebarActive: Boolean) {
        this.nav2TopNav = topNav
        this.nav2SidebarActive = sidebarActive
        setTitleDisplayForUrl(url)
        main.invalidateOptionsMenu()
    }

    // V2 title: dynamicTitle carries V1 NavigationTitleRule semantics (regex rules win over instance title).
    private fun setNav2TitleDisplay(url: String, allowPageTitle: Boolean) {
        val topNav = nav2TopNav
        if (topNav == null || !topNav.active) {
            hideActionBar()
            return
        }

        val pageTitle = main.getWebView().getTitle() ?: main.getString(R.string.app_name)
        val dynamicTitle = topNav.dynamicTitle

        if (dynamicTitle == null || !dynamicTitle.customTitle) {
            showImageOrTextTitle(dynamicTitle?.showImage ?: false, pageTitle, url)
            showActionBar()
            return
        }

        val rule = dynamicTitle.titles.firstOrNull {
            it.regex.isNotEmpty() &&
                runCatching { Pattern.compile(it.regex).matcher(url).matches() }.getOrDefault(false)
        }

        val configTitle = (rule?.title ?: dynamicTitle.title).orEmpty()
        if (configTitle.isEmpty() && !allowPageTitle)
            // Same guard as V1: don't fall back to a possibly-stale page title pre-load.
            return

        val title = configTitle.ifEmpty { pageTitle }
        main.setTitle(title)
        showImageOrTextTitle(rule?.showImage ?: dynamicTitle.showImage, title, url)
        showActionBar()
    }

    // Bridge nav2 MenuBarItems to the JSON shape addMenuItem/addSystemMenuItem consume.
    private fun menuBarItemsToJson(items: List<MenuBarItem>): JSONArray {
        val array = JSONArray()
        for (item in items) {
            val obj = JSONObject()
            obj.put("label", item.label)
            item.url?.let { obj.put("url", it) }
            item.icon?.let { obj.put("icon", it) }
            item.system?.let { obj.put("system", it) }
            array.put(obj)
        }
        return array
    }

    fun checkActions(url: String?) {
        if (url.isNullOrBlank()) return

        if (MedianConfig.get().isUrlSplashPage(url))
            return

        setTitleDisplayForUrl(url)
        setMenuID(actionMenuIdForUrl(url))
    }

    private fun setMenuID(menuID: String?) {
        val changed = if (this.currentMenuID == null) {
            menuID != null
        } else {
            this.currentMenuID != menuID
        }

        if (changed) {
            this.currentMenuID = menuID
            main.invalidateOptionsMenu()
        }
    }

    fun addActions(menu: Menu) {
        this.menu = menu
        this.itemToUrl.clear()

        val nav2 = MedianConfig.get().isNativeNavigationV2
        val sidebarVisible = if (nav2) nav2SidebarActive else MedianConfig.get().showNavigationMenu

        if (leftActionConfigured) {
            resetLeftNavigationMenu(sidebarVisible)
        }

        val actions: JSONArray?
        val allowLeftMenu: Boolean

        if (nav2) {
            val topNav = nav2TopNav
            if (topNav == null || !topNav.active) return
            actions = menuBarItemsToJson(topNav.items)
            allowLeftMenu = topNav.allowLeftMenu
        } else {
            val actionMenu = actionMenuForId(currentMenuID) ?: return
            actions = actionItemsForId(currentMenuID)
            allowLeftMenu = actionMenu.allowLeftMenu
        }

        if (actions == null || actions.length() == 0) {
            return
        }

        val overflowMenus = mutableListOf<JSONObject>()
        var menuOverflowed = false

        for (i in 0 until actions.length()) {

            val entry = actions.getJSONObject(i)
            val remainingItems = actions.length() - i

            if (!menuOverflowed && menu.size() == 1 && remainingItems > 1) {
                menuOverflowed = true
            }

            if (menuOverflowed) {
                overflowMenus.add(entry)
                continue
            }

            if (i == 0
                && allowLeftMenu
                && !leftActionConfigured
                && !sidebarVisible
                && addAsLeftActionMenu(entry)
            ) {
                leftActionConfigured = true
                continue
            }

            addMenuItem(menu, i, entry)
        }

        setupOverflowMenu(menu, overflowMenus)
    }

    private fun addMenuItem(menu: Menu, itemID: Int, entry: JSONObject?) {
        entry ?: return

        if (addSystemMenuItem(menu, entry, itemID))
            return

        val label = entry.optString("label")
        val icon = entry.optString("icon")
        val url = entry.optString("url")

        val drawableIcon = Icon(main, icon, menuItemSize, colorForeground).getDrawable()

        val menuItem = menu.add(Menu.NONE, itemID, Menu.NONE, label)
            .setIcon(drawableIcon)
            .setShowAsActionFlags(MenuItem.SHOW_AS_ACTION_ALWAYS)

        itemToUrl[menuItem] = url
    }

    private fun addSystemMenuItem(
        menu: Menu,
        entry: JSONObject,
        itemID: Int
    ): Boolean {
        val system = entry.optString("system")

        if (TextUtils.isEmpty(system))
            return false

        var label = entry.optString("label")
        var icon = entry.optString("icon")
        val url = entry.optString("url")

        val (action, defaultIcon, defaultLabel) = when (system) {
            "refresh" -> Triple(ACTION_REFRESH, "fa-rotate-right", "Refresh")
            "share" -> Triple(ACTION_SHARE, "fa-share", "Share")
            "search" -> Triple(ACTION_SEARCH, "fa fa-search", "Search")
            else -> return false
        }

        if (TextUtils.isEmpty(label)) label = defaultLabel
        if (TextUtils.isEmpty(icon)) icon = defaultIcon

        val drawableIcon = Icon(main, icon, menuItemSize, colorForeground).getDrawable()

        val menuItem = menu.add(Menu.NONE, itemID, Menu.NONE, label)
            .setIcon(drawableIcon)
            .setShowAsActionFlags(MenuItem.SHOW_AS_ACTION_IF_ROOM)

        if (action == ACTION_SEARCH) {
            createSearchView(menuItem, url, drawableIcon)
        }

        itemToUrl[menuItem] = action
        return true
    }

    private fun addAsLeftActionMenu(entry: JSONObject?): Boolean {
        entry ?: return false

        if (!isRoot)
        // Consume the event but keep the menu hidden on non-root windows for the native back button.
            return true

        // Show navigation button
        var url = entry.optString("url")
        var icon = entry.optString("icon")
        var label = entry.optString("label")
        val system = entry.optString("system")

        if (!system.isNullOrBlank()) {
            when (system) {
                "refresh" -> {
                    url = ACTION_REFRESH
                    if (icon.isNullOrBlank()) icon = "fa-rotate-right"
                    if (label.isNullOrBlank()) label = "Refresh"
                }

                "share" -> {
                    url = ACTION_SHARE
                    if (icon.isNullOrBlank()) icon = "fa-share"
                    if (label.isNullOrBlank()) label = "Share"
                }

                "search" -> {
                    Log.e(TAG, "addAsLeftActionMenu: The \"search\" system menu is not supported as a left-menu yet.")
                    return false
                }
            }
        }

        // Shown as the action bar's home button, so taps arrive as android.R.id.home
        // (handleLeftAction) and the toolbar keeps the click handler AppCompat installed.
        val drawableIcon = Icon(main, icon, menuItemSize, colorForeground).getDrawable()
        actionBar?.apply {
            setHomeAsUpIndicator(drawableIcon)
            setHomeActionContentDescription(label)
            setDisplayHomeAsUpEnabled(true)
        }
        leftActionUrl = url
        return true
    }

    private fun resetLeftNavigationMenu(sidebarVisible: Boolean) {
        if (leftActionUrl != null && !sidebarVisible) {
            actionBar?.setDisplayHomeAsUpEnabled(false)
        }
        leftActionUrl = null
        leftActionConfigured = false
    }

    // Home button tap while it shows the top bar's left-slot item.
    fun handleLeftAction(): Boolean {
        val url = leftActionUrl ?: return false
        when (url) {
            ACTION_SHARE -> main.sharePage("", "")
            ACTION_REFRESH -> main.onRefresh()
            else -> this.main.urlLoader.loadUrl(url, true)
        }
        return true
    }

    private fun setupOverflowMenu(menu: Menu, overflowMenus: List<JSONObject>) {
        if (overflowMenus.isEmpty()) return

        val overflowIcon = toolbar.overflowIcon?.constantState?.newDrawable()?.mutate()

        overflowIcon?.colorFilter =
            BlendModeColorFilterCompat.createBlendModeColorFilterCompat(
                colorForeground,
                BlendModeCompat.SRC_ATOP
            )

        val menuItem = menu.add(Menu.NONE, 99, Menu.NONE, "Overflow")
            .setIcon(overflowIcon)
            .setShowAsActionFlags(MenuItem.SHOW_AS_ACTION_ALWAYS)

        itemToUrl[menuItem] = ACTION_OVERFLOW

        val popupView = LayoutInflater.from(main).inflate(R.layout.overflow_menu_list_view, null)

        val listView = popupView.findViewById<ListView>(R.id.menuListView)

        var overflowMenuHasIcons = false
        for (menuJson in overflowMenus) {
            val icon = menuJson.optString("icon")
            if (!icon.isNullOrBlank()) {
                overflowMenuHasIcons = true
                break
            }
        }

        val adapter = OverFlowMenuItemAdapter(main, overflowMenus, overflowMenuHasIcons)
        listView.adapter = adapter

        overflowPopupWindow = PopupWindow(
            popupView,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            true // focusable
        ).apply {
            width = overflowListWidth
            elevation = 10f
        }

        // handle item click
        listView.setOnItemClickListener { _, _, position, _ ->
            val item = overflowMenus[position]
            val system = item.optString("system")
            var url = item.optString("url")

            if (system.isNullOrBlank()) {
                when (system) {
                    "refresh" -> {
                        url = ACTION_REFRESH
                    }

                    "share" -> {
                        url = ACTION_SHARE
                    }

                    "search" -> {
                        Log.e(TAG, "setupOverflowMenu: The \"search\" system menu is not supported on the custom overflow menu yet.")
                        url = ""
                    }
                }
            }

            if (url.isNotBlank()) handleAction(url)

            overflowPopupWindow?.dismiss()
        }
    }

    private fun showPopupOverflowWindow() {
        overflowPopupWindow?.let{
            val padding = 15
            val popupWidth = overflowListWidth
            val xOffset = toolbar.width - popupWidth - padding
            it.showAsDropDown(toolbar, xOffset, 0)
        }
    }

    @SuppressLint("RestrictedApi")
    private fun createSearchView(menuItem: MenuItem, url: String, icon: Drawable?) {
        this.searchView = SearchView(main).apply {
            layoutParams = Toolbar.LayoutParams(
                Toolbar.LayoutParams.MATCH_PARENT,
                Toolbar.LayoutParams.WRAP_CONTENT
            )
            maxWidth = Int.MAX_VALUE

            setOnQueryTextListener(object : SearchView.OnQueryTextListener {
                override fun onQueryTextSubmit(query: String): Boolean {
                    try {
                        val q = URLEncoder.encode(query, "UTF-8")
                        main.loadUrl(url + q)
                    } catch (e: UnsupportedEncodingException) {
                        return true
                    }

                    return true
                }

                override fun onQueryTextChange(newText: String): Boolean {
                    // do nothing
                    return true
                }
            })

            setOnQueryTextFocusChangeListener { _, hasFocus ->
                if (!hasFocus && !isIconified) {
                    closeSearchView()
                }
            }

            // edit text color
            val editText =
                findViewById<SearchView.SearchAutoComplete>(androidx.appcompat.R.id.search_src_text)

            editText?.apply {
                setTextColor(colorForeground)
                var hintColor = colorForeground
                hintColor = Color.argb(
                    192, Color.red(hintColor), Color.green(hintColor),
                    Color.blue(hintColor)
                )
                setHintTextColor(hintColor)
            }

            // close button color
            val closeButton: ImageView? = findViewById(androidx.appcompat.R.id.search_close_btn)
            closeButton?.setColorFilter(colorForeground)
        }

        menuItem.apply {
            actionView = searchView
            setShowAsActionFlags(MenuItem.SHOW_AS_ACTION_IF_ROOM or MenuItem.SHOW_AS_ACTION_COLLAPSE_ACTION_VIEW)

            setOnActionExpandListener(object : MenuItem.OnActionExpandListener {
                override fun onMenuItemActionExpand(item: MenuItem): Boolean {
                    // hide other menus
                    setMenuItemsVisible(false, menuItem)
                    return true
                }

                override fun onMenuItemActionCollapse(item: MenuItem): Boolean {
                    // re-show other menus
                    closeSearchView()
                    return true
                }
            })
        }
    }

    fun setMenuItemsVisible(visible: Boolean, exception: MenuItem) {
        if (menu == null) return

        menu?.let {
            for (i in 0 until it.size()) {
                val item: MenuItem = it.getItem(i)
                if (item === exception) {
                    continue
                }

                item.setVisible(visible)
                item.setEnabled(visible)
            }
        }

    }

    private fun closeSearchView() {
        searchView?.isIconified = true
        main.invalidateOptionsMenu()
    }

    fun canCloseSearchView(): Boolean {
        searchView?.let {
            if (it.hasFocus()) {
                closeSearchView()
                return true
            }
        }
        return false
    }

    fun setTitleDisplayForUrl(url: String?, allowPageTitle: Boolean = true) {
        if (actionBar == null || url.isNullOrBlank()) return

        if (MedianConfig.get().isUrlSplashPage(url)) {
            hideActionBar()
            return
        }

        if (MedianConfig.get().isNativeNavigationV2) {
            setNav2TitleDisplay(url, allowPageTitle)
            return
        }

        var urlHasNavTitle = false
        var urlHasActionMenu = false

        // Check for Nav title
        val urlNavTitle: NavigationTitleRule? = MedianConfig.get().titleRuleForUrl(url)

        if (urlNavTitle != null) {
            urlHasNavTitle = true
        }

        // Check for Action Menus
        val actionItems = actionItemsForId(actionMenuIdForUrl(url))
        if (actionItems != null && actionItems.length() > 0) {
            urlHasActionMenu = true
        }

        if (!MedianConfig.get().configRoot.styling.showActionBar && !MedianConfig.get().showNavigationMenu && !urlHasNavTitle && !urlHasActionMenu) {
            hideActionBar()
            return
        }

        // default title
        var title: String = if (main.getWebView().getTitle() != null) main.getWebView().getTitle()!! else main.getString(R.string.app_name)

        if (!urlHasNavTitle) {
            showImageOrTextTitle(urlNavTitle?.showImage ?: false, title, url)
        } else {

            val urlNavTitleString = (urlNavTitle?.title).orEmpty()

            if (urlNavTitleString.isEmpty() && !allowPageTitle)
                // If config title is empty and allowPageTitle is false,
                // ignore using the page title as it may not be the actual title
                // due to the method being called before the URL is loaded.
                return

            title = urlNavTitleString.ifEmpty { title }

            main.setTitle(title)

            val showImage = urlNavTitle?.showImage ?: false
            showImageOrTextTitle(showImage, title, url)
        }
        showActionBar()
    }

    fun setTitle(title: CharSequence) {
        if (title.isBlank()) return
        if (showTitleImageOverride(main.getWebView().getUrl())) return
        titleImageView.visibility = View.GONE
        toolbar.title = title
    }

    private fun showImageOrTextTitle(show: Boolean, title: String, url: String) {
        if (showTitleImageOverride(url)) return
        if (titleImageOverrideShown) {
            titleImageView.setImageDrawable(AppCompatResources.getDrawable(main, R.drawable.ic_actionbar))
            titleImageOverrideShown = false
        }
        if (show) {
            titleImageView.visibility = View.VISIBLE
            toolbar.title = ""
        } else {
            titleImageView.visibility = View.GONE
            toolbar.title = title
        }
    }

    fun onThemeChanged() {
        val theme = main.theme
        this.colorForeground = ContextCompat.getColor(main, R.color.titleTextColor)

        this.toolbar.apply {
            setBackgroundColor(main.resources.getColor(R.color.colorPrimary, theme))

            navigationIcon?.colorFilter =
                BlendModeColorFilterCompat.createBlendModeColorFilterCompat(
                    colorForeground,
                    BlendModeCompat.SRC_ATOP
                )
        }

        if (!titleImageOverrideShown) {
            titleImageView.setImageDrawable(AppCompatResources.getDrawable(main, R.drawable.ic_actionbar))
        }
        main.invalidateOptionsMenu()
    }

    // median.navigation.setTitleImage: shown in place of the title, at the configured image's height
    private fun showTitleImageOverride(url: String?): Boolean {
        val bytes = url?.let { MedianConfig.get().navTitleImageForUrl(it) } ?: return false
        if (bytes !== titleImageOverrideBytes) {
            titleImageOverrideBytes = bytes
            titleImageOverrideBitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.let { scaleToTitleHeight(it) }
        }
        val bitmap = titleImageOverrideBitmap ?: return false
        titleImageView.setImageBitmap(bitmap)
        titleImageView.visibility = View.VISIBLE
        toolbar.title = ""
        titleImageOverrideShown = true
        return true
    }

    private fun scaleToTitleHeight(bitmap: Bitmap): Bitmap {
        val configured = AppCompatResources.getDrawable(main, R.drawable.ic_actionbar)?.intrinsicHeight ?: 0
        val height = if (configured > 0) configured else (30 * main.resources.displayMetrics.density).toInt()
        if (bitmap.height <= 0 || bitmap.height == height) return bitmap
        val width = (bitmap.width.toLong() * height / bitmap.height).toInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(bitmap, width, height, true)
    }

    companion object {
        const val ACTION_SHARE: String = "share"
        const val ACTION_REFRESH: String = "refresh"
        const val ACTION_SEARCH: String = "search"
        const val ACTION_OVERFLOW: String = "overflow"
        private const val TAG = "ActionManager"
    }
}

class OverFlowMenuItemAdapter(context: Context, items: List<JSONObject>, private val hasIcons: Boolean) : ArrayAdapter<JSONObject>(context, 0, items) {
    override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
        val view = convertView ?: LayoutInflater.from(context)
            .inflate(R.layout.overflow_menu_item, parent, false)
        val menuItem = getItem(position)

        val menuItemTextView = view.findViewById<TextView>(R.id.overFlowItemTextView)
        val menuItemImageView = view.findViewById<ImageView>(R.id.overFlowItemDrawable)

        menuItem?.let {
            val label = it.optString("label")

            val menuItemSize: Int =
                context.resources.getDimensionPixelSize(R.dimen.action_menu_icon_size)
            val colorForeground = ContextCompat.getColor(context, R.color.titleTextColor)

            menuItemTextView.text = label

            if (hasIcons) {
                val icon = it.optString("icon")
                if (icon.isNotBlank()) {
                    val drawableIcon = Icon(context, icon, menuItemSize, colorForeground).getDrawable()
                    menuItemImageView.setImageDrawable(drawableIcon)
                    menuItemImageView.visibility = View.VISIBLE
                } else {
                    menuItemImageView.visibility = View.INVISIBLE
                }
            } else {
                menuItemImageView.visibility = View.GONE
            }
        }
        return view
    }
}