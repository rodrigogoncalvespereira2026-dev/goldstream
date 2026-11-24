import { Capacitor } from '@capacitor/core'

/**
 * Corre dentro de um WebView do Android: o APK da Capacitor ou um conversor
 * "site → APK" (que só embrulha o site). O WebView compõe e descodifica muito
 * pior do que o Chrome, por isso a app poupa onde pode.
 */
export const isWebView: boolean =
  typeof navigator !== 'undefined' &&
  (Capacitor.isNativePlatform() || /;\s*wv\)/.test(navigator.userAgent))
