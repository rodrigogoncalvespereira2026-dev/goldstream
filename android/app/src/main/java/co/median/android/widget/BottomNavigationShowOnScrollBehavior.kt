package co.median.android.widget

import android.content.Context
import android.util.AttributeSet
import android.view.View
import androidx.coordinatorlayout.widget.CoordinatorLayout
import co.median.android.MedianConfig
import co.median.android.TabManager
import com.google.android.material.behavior.HideViewOnScrollBehavior
import com.google.android.material.bottomnavigation.BottomNavigationView

class BottomNavigationShowOnScrollBehavior(
    context: Context,
    attrs: AttributeSet
) : HideViewOnScrollBehavior<BottomNavigationView>(context, attrs) {

    private val hideBottomNavBarOnScrollEnabled = MedianConfig.hideTabBarOnScroll()

    private lateinit var tabManager: TabManager

    fun setTabManager(tabManager: TabManager) {
        this.tabManager = tabManager
    }

    override fun onNestedScroll(
        coordinatorLayout: CoordinatorLayout,
        child: BottomNavigationView,
        target: View,
        dxConsumed: Int,
        dyConsumed: Int,
        dxUnconsumed: Int,
        dyUnconsumed: Int,
        type: Int,
        consumed: IntArray
    ) {
        if (!hideBottomNavBarOnScrollEnabled || tabManager.isHideTopNavOnScrollActive) return

        when {
            dyUnconsumed > 0 || dyConsumed < -50 -> {
                slideOut(child, true)
            }
            dyUnconsumed < 0 || dyConsumed > 50 -> {
                slideIn(child, true)
            }
        }
    }
}
