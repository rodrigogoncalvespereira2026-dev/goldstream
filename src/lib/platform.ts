import { Capacitor } from '@capacitor/core'

/**
 * Corre num telemóvel Android: o APK da Capacitor, um conversor "site → APK"
 * (que só embrulha o site num WebView) ou o próprio browser. Nem todos os
 * conversores deixam o "; wv)" no user agent, por isso qualquer Android liga o
 * modo leve — o WebView compõe e descodifica muito pior do que o Chrome no PC.
 */
export const isWebView: boolean =
  typeof navigator !== 'undefined' &&
  (Capacitor.isNativePlatform() || /;\s*wv\)|Android/i.test(navigator.userAgent))
