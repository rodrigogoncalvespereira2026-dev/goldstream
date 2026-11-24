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

/**
 * O APK do telemóvel (Median/GoNative) injeta um script antes da página que fala
 * com o código nativo por estas pontes:
 * - `GoldStreamNative`: recebe o estado (título, artista, posição) e emite os
 *   botões do aviso como evento `goldstream-native-control`;
 * - `GoldStreamHold`: diz se o áudio está "segurado" em segundo plano e deixa
 *   instalar o APK novo;
 * - `__gsPageControls` / `__gsAllowPauseUntil`: marcas que o próprio script lê.
 */
type PonteApp = {
  GoldStreamNative?: { postMessage?: (data: string) => void }
  GoldStreamHold?: {
    appCodigo?: () => number
    appVersao?: () => string
    instalar?: (url: string) => void
  }
  __gsNativeHooked?: boolean
  __gsPageControls?: boolean
  __gsAllowPauseUntil?: number
}

const janela = (): PonteApp => window as unknown as PonteApp

/** Existe ponte do APK nesta página? */
export const temPonteApp = (): boolean =>
  typeof window !== 'undefined' && Boolean(janela().GoldStreamNative)

/** O script do APK já está a reportar o estado sozinho? */
export const scriptInjetado = (): boolean => temPonteApp() && Boolean(janela().__gsNativeHooked)

/**
 * O script do APK também clica nos botões do player quando não lhe dizemos que
 * tomamos conta dos controlos. Sem esta marca cada ação do aviso era aplicada
 * duas vezes: a pausa voltava atrás, o "seguinte" saltava duas faixas.
 */
export function assumirControlos(): void {
  if (temPonteApp()) janela().__gsPageControls = true
}

/**
 * Enquanto segura a música em segundo plano, o script do APK ignora o `pause()`
 * do `<audio>`. Antes de uma pausa pedida pela app abre-se esta janela curta,
 * senão trocar de faixa deixava a anterior a tocar por baixo da nova.
 */
export function permitirPausa(ms = 2000): void {
  if (temPonteApp()) janela().__gsAllowPauseUntil = Date.now() + ms
}

/**
 * Ao voltar à app, o código nativo chama `window.__gsResumeHeld()` para retomar
 * o que ficou em pausa. Sem filtro, isso voltava a tocar uma música que o
 * utilizador tinha pausado no aviso. Passa a retomar só se a app quiser tocar.
 */
export function controlarRetomaNativa(querTocar: () => boolean): void {
  const alvo = window as unknown as { __gsResumeHeld?: () => void }
  const original = alvo.__gsResumeHeld
  if (!temPonteApp() || !original) return
  alvo.__gsResumeHeld = () => {
    if (querTocar()) original()
  }
}
