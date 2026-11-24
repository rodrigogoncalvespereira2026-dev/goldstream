package co.median.android.widget

import android.content.Context
import android.util.AttributeSet
import android.view.View
import android.widget.FrameLayout
import androidx.core.content.ContextCompat
import co.median.android.R
import co.median.core.bridge.MedianProgressViewItem
import com.google.android.material.progressindicator.CircularProgressIndicator

class MedianProgressView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyle: Int = 0
) : FrameLayout(context, attrs, defStyle) {

    private val fadeOutDuration = 60L
    private var progressViewItem: MedianProgressViewItem? = null

    fun show() {
        visibility = View.VISIBLE
        alpha = 1.0f
        progressViewItem?.listener?.onShow()
    }

    fun hide() {
        animate()
            .alpha(0.0f)
            .setDuration(fadeOutDuration)
            .withEndAction {
                visibility = View.INVISIBLE
                progressViewItem?.listener?.onHide()
            }
    }

    fun hideImmediately() {
        alpha = 1.0f
        visibility = View.INVISIBLE
        progressViewItem?.listener?.onHide()
    }

    /** Install a plugin-provided progress view (e.g. Lottie); replaces the default spinner. */
    fun setProgressView(item: MedianProgressViewItem) {
        this.progressViewItem = item
        removeAllViews()
        addView(item.view)
    }

    fun setupDefaultProgress() {
        addView(
            CircularProgressIndicator(context).apply {
                isIndeterminate = true
                setIndicatorColor(ContextCompat.getColor(context, R.color.progress_indicator))
            }
        )
    }
}
