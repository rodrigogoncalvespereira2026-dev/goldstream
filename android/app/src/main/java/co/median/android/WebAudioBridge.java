package co.median.android;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;

import java.lang.ref.WeakReference;
import java.util.HashSet;
import java.util.Set;

/**
 * Liga a página (e o iframe do YouTube) ao {@link BackgroundAudioService}.
 *
 * Em cada frame do site e do YouTube é injetado {@link #SCRIPT}, que:
 *  - expõe {@code window.GoldStreamNative} para a página dizer o que está a tocar;
 *  - lê da própria página o título, o artista e a capa e envia-os para o aviso;
 *  - avisa a app quando qualquer &lt;audio&gt;/&lt;video&gt; começa ou pára;
 *  - enquanto a app está fora de primeiro plano finge que a página continua visível e
 *    ignora os pedidos de pausa (senão a música calava-se ao sair);
 *  - no iframe do YouTube finge que a página continua visível, senão o YouTube pausa
 *    a música assim que se sai da app.
 * Os botões do aviso voltam para a página como evento {@code goldstream-native-control}.
 */
public final class WebAudioBridge {
    private static final String TAG = "WebAudioBridge";
    private static final String OBJECT_NAME = "GoldStreamNative";
    private static final String HOLD_NAME = "GoldStreamHold";
    private static final int NOTIFICATION_PERMISSION_REQUEST = 4712;

    /** Janela em que a página pode calar a música (o utilizador carregou em pausa no aviso). */
    private static volatile long allowPauseUntil = 0;

    private static final String SCRIPT = "(function(){\n" +
            "if (window.__gsNativeHooked) return; window.__gsNativeHooked = true;\n" +
            "var bridge = window.GoldStreamNative; if (!bridge) return;\n" +
            "var flag = window.GoldStreamHold;\n" +
            // A versão que interessa para atualizar é a do APK, não a do site publicado.
            "try {\n" +
            "  if (flag && flag.appCodigo) {\n" +
            "    window.GoldStreamApp = {\n" +
            "      nome: String(flag.appVersao ? flag.appVersao() : ''),\n" +
            "      codigo: Number(flag.appCodigo()) || 0,\n" +
            "      instalar: function(url){ try { flag.instalar(String(url)); return true; } catch(e){ return false; } }\n" +
            "    };\n" +
            "  }\n" +
            "} catch(e){}\n" +
            "var isTop = window === window.top;\n" +
            "var yt = /(^|\\.)youtube(-nocookie)?\\.com$/.test(location.hostname);\n" +
            "function send(o){ try { bridge.postMessage(JSON.stringify(o)); } catch(e){} }\n" +
            "function held(){ try { if (flag && flag.isHeld) return !!flag.isHeld(); } catch(e){} return !!window.__gsHold; }\n" +
            "function mayPause(){ try { if (flag && flag.canPause) return !!flag.canPause(); } catch(e){} return Date.now() < (window.__gsAllowPauseUntil || 0); }\n" +
            // No iframe do YouTube a página tem de se achar sempre visível.
            "var forced = yt && !isTop;\n" +
            "function heldNow(){ return forced || held(); }\n" +
            "var hiddenDesc, visDesc;\n" +
            "try { hiddenDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden'); } catch(e){}\n" +
            "try { visDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState'); } catch(e){}\n" +
            "function defineDoc(name, getter){ try { Object.defineProperty(document, name, { configurable: true, get: getter }); } catch(e){} }\n" +
            "function readHidden(){ try { return hiddenDesc && hiddenDesc.get ? hiddenDesc.get.call(document) : false; } catch(e){ return false; } }\n" +
            "function readState(){ try { return visDesc && visDesc.get ? visDesc.get.call(document) : 'visible'; } catch(e){ return 'visible'; } }\n" +
            "defineDoc('hidden', function(){ return heldNow() ? false : readHidden(); });\n" +
            "defineDoc('webkitHidden', function(){ return heldNow() ? false : readHidden(); });\n" +
            "defineDoc('visibilityState', function(){ return heldNow() ? 'visible' : readState(); });\n" +
            "defineDoc('webkitVisibilityState', function(){ return heldNow() ? 'visible' : readState(); });\n" +
            "['visibilitychange','webkitvisibilitychange','blur','freeze','pagehide'].forEach(function(t){\n" +
            "  function swallow(e){ if (heldNow()) e.stopImmediatePropagation(); }\n" +
            "  window.addEventListener(t, swallow, true);\n" +
            "  document.addEventListener(t, swallow, true);\n" +
            "});\n" +
            "var live = [];\n" +
            "var reportTimer = 0;\n" +
            "function scheduleReport(){\n" +
            "  if (reportTimer) return;\n" +
            "  reportTimer = window.setTimeout(function(){ reportTimer = 0; report(); }, 200);\n" +
            "}\n" +
            "function track(el){\n" +
            "  if (!el || live.indexOf(el) >= 0) return;\n" +
            "  live.push(el);\n" +
            "  ['timeupdate','playing','durationchange','loadedmetadata','canplay'].forEach(function(t){\n" +
            "    try { el.addEventListener(t, scheduleReport); } catch(e){}\n" +
            "  });\n" +
            "}\n" +
            "function playingNow(){\n" +
            "  for (var i = 0; i < live.length; i++) {\n" +
            "    var el = live[i];\n" +
            "    try { if (el && !el.paused && !el.ended) return true; } catch(e){}\n" +
            "  }\n" +
            "  return false;\n" +
            "}\n" +
            "var proto = window.HTMLMediaElement && HTMLMediaElement.prototype;\n" +
            "if (proto && !proto.__gsHooked) {\n" +
            "  var origPause = proto.pause, origPlay = proto.play;\n" +
            "  proto.__gsHooked = true;\n" +
            "  proto.play = function(){ track(this); return origPlay.apply(this, arguments); };\n" +
            "  proto.pause = function(){\n" +
            // Fora da app o Chromium e a própria página pedem pausa: só o aviso manda.
            "    if (!forced && held() && !mayPause()) return;\n" +
            "    var i = live.indexOf(this); if (i >= 0) live.splice(i, 1);\n" +
            "    return origPause.apply(this, arguments);\n" +
            "  };\n" +
            "}\n" +
            "window.__gsResumeHeld = function(){\n" +
            "  live.forEach(function(el){\n" +
            "    try {\n" +
            "      if (el && el.paused && !el.ended) {\n" +
            "        var p = el.play();\n" +
            "        if (p && p.catch) p.catch(function(){});\n" +
            "      }\n" +
            "    } catch(e){}\n" +
            "  });\n" +
            "};\n" +
            "var lastKey = '';\n" +
            "function text(sel){ var el = document.querySelector(sel); return el && el.textContent ? el.textContent.trim() : ''; }\n" +
            "function firstText(sels){\n" +
            "  for (var i = 0; i < sels.length; i++) { var v = text(sels[i]); if (v) return v; }\n" +
            "  return '';\n" +
            "}\n" +
            "function firstArt(sels){\n" +
            "  for (var i = 0; i < sels.length; i++) {\n" +
            "    var el = document.querySelector(sels[i]);\n" +
            "    if (!el) continue;\n" +
            "    var img = el.tagName === 'IMG' ? el : el.querySelector('img');\n" +
            "    if (!img) continue;\n" +
            "    var src = img.currentSrc || img.src || '';\n" +
            "    if (src && src.indexOf('data:') !== 0) return src;\n" +
            "  }\n" +
            "  return '';\n" +
            "}\n" +
            "function meta(){\n" +
            "  var title = '', artist = '', album = '', artwork = '';\n" +
            "  try {\n" +
            "    var md = navigator.mediaSession && navigator.mediaSession.metadata;\n" +
            "    if (md) {\n" +
            "      title = md.title || ''; artist = md.artist || ''; album = md.album || '';\n" +
            "      if (md.artwork && md.artwork.length) artwork = md.artwork[md.artwork.length - 1].src || '';\n" +
            "    }\n" +
            "  } catch(e){}\n" +
            "  if (!title) title = firstText(['.player-title', '.np-title', '[class*=\"player-title\"]']);\n" +
            "  if (!artist) artist = firstText(['.player-artist', '.np-artist', '[class*=\"player-artist\"]']);\n" +
            "  if (!artwork) artwork = firstArt(['img.player-art', '.player-art', '.np-art']);\n" +
            "  if (artwork && artwork.indexOf('data:') === 0) artwork = '';\n" +
            "  return { title: title, artist: artist, album: album, artwork: artwork };\n" +
            "}\n" +
            "function parseTime(txt){\n" +
            "  if (!txt) return 0;\n" +
            "  var parts = String(txt).trim().split(':');\n" +
            "  var secs = 0;\n" +
            "  for (var i = 0; i < parts.length; i++) {\n" +
            "    var n = parseInt(parts[i], 10);\n" +
            "    if (!isFinite(n)) return 0;\n" +
            "    secs = secs * 60 + n;\n" +
            "  }\n" +
            "  return secs;\n" +
            "}\n" +
            // O tempo que a própria página mostra na barra do player e no ecrã agora tocando.
            "function domClock(){\n" +
            "  var out = { position: 0, duration: 0 };\n" +
            "  var times = document.querySelectorAll('.progress .time');\n" +
            "  if (times.length >= 2) {\n" +
            "    out.position = parseTime(times[0].textContent);\n" +
            "    out.duration = parseTime(times[1].textContent);\n" +
            "  }\n" +
            "  if (!out.duration) {\n" +
            "    var np = document.querySelectorAll('.np-times span');\n" +
            "    if (np.length >= 2) {\n" +
            "      if (!out.position) out.position = parseTime(np[0].textContent);\n" +
            "      out.duration = parseTime(np[1].textContent);\n" +
            "    }\n" +
            "  }\n" +
            "  return out;\n" +
            "}\n" +
            "function clock(){\n" +
            "  var out = { position: 0, duration: 0 };\n" +
            "  for (var i = 0; i < live.length; i++) {\n" +
            "    var el = live[i];\n" +
            "    try {\n" +
            "      if (el && !el.paused && !el.ended) {\n" +
            "        out.position = el.currentTime || 0;\n" +
            "        var d = el.duration;\n" +
            // Em streams o duration é Infinity: a parte que já se pode saltar é o tamanho real.
            "        if (!(d > 0 && isFinite(d))) {\n" +
            "          try { if (el.seekable && el.seekable.length) d = el.seekable.end(el.seekable.length - 1); } catch(e){}\n" +
            "        }\n" +
            "        if (d > 0 && isFinite(d)) out.duration = d;\n" +
            "        break;\n" +
            "      }\n" +
            "    } catch(e){}\n" +
            "  }\n" +
            "  if (!out.duration || !out.position) {\n" +
            "    var d2 = domClock();\n" +
            "    if (!out.duration) out.duration = d2.duration;\n" +
            "    if (!out.position) out.position = d2.position;\n" +
            "  }\n" +
            "  return out;\n" +
            "}\n" +
            "function clickPlayer(sel){\n" +
            "  var b = document.querySelector(sel);\n" +
            "  if (!b) return false;\n" +
            "  try { b.click(); return true; } catch(e){ return false; }\n" +
            "}\n" +
            "function mediaEls(){\n" +
            "  var list = live.slice();\n" +
            "  if (!list.length) {\n" +
            "    var found = document.querySelectorAll('audio,video');\n" +
            "    for (var i = 0; i < found.length; i++) list.push(found[i]);\n" +
            "  }\n" +
            "  return list;\n" +
            "}\n" +
            // Página antiga (não conhece os comandos do aviso): carrega-se nos controlos dela.
            "function fallbackControl(action){\n" +
            "  if (!isTop || window.__gsPageControls) return;\n" +
            "  if (action === 'next') { clickPlayer('button[aria-label=\"Pr\\u00f3xima faixa\"]'); return; }\n" +
            "  if (action === 'prev') { clickPlayer('button[aria-label=\"Faixa anterior\"]'); return; }\n" +
            "  if (action === 'toggle') { if (clickPlayer('button.play-circle')) return; action = playingNow() ? 'pause' : 'play'; }\n" +
            "  if (action === 'play' || action === 'pause') {\n" +
            "    if (clickPlayer('button.play-circle')) return;\n" +
            "  }\n" +
            "  var els = mediaEls();\n" +
            "  for (var i = 0; i < els.length; i++) {\n" +
            "    try {\n" +
            "      if (action === 'play') { var p = els[i].play(); if (p && p.catch) p.catch(function(){}); }\n" +
            "      else if (action === 'pause') els[i].pause();\n" +
            "    } catch(e){}\n" +
            "  }\n" +
            "}\n" +
            "function report(){\n" +
            "  if (!isTop) return;\n" +
            "  var m = meta();\n" +
            "  var c = clock();\n" +
            "  var payload = { type: 'state', playing: playingNow(), title: m.title, artist: m.artist,\n" +
            "    album: m.album, artwork: m.artwork, native: true,\n" +
            "    position: Math.floor(c.position / 5) * 5, duration: Math.round(c.duration) };\n" +
            "  var key = JSON.stringify(payload);\n" +
            "  if (key === lastKey) return;\n" +
            "  lastKey = key;\n" +
            "  send(payload);\n" +
            "}\n" +
            "document.addEventListener('playing', function(e){ track(e.target); report(); }, true);\n" +
            "['pause','ended','emptied','loadedmetadata','durationchange'].forEach(function(t){\n" +
            "  document.addEventListener(t, function(e){ track(e.target); report(); }, true);\n" +
            "});\n" +
            "if (!window.__gsMetaTimer) {\n" +
            "  window.__gsMetaTimer = window.setInterval(function(){\n" +
            "    if (isTop && playingNow()) report();\n" +
            "  }, 1000);\n" +
            "}\n" +
            "if (isTop) {\n" +
            "  bridge.addEventListener('message', function(e){\n" +
            "    var action = String(e.data);\n" +
            "    try { window.dispatchEvent(new CustomEvent('goldstream-native-control', { detail: action })); } catch(err){}\n" +
            "    fallbackControl(action);\n" +
            "  });\n" +
            "}\n" +
            "report();\n" +
            "})();";

    /**
     * Objeto lido pela página: em sincronia decide se a música pode continuar fora da app e
     * diz qual é a versão do APK instalado (o site publicado não a sabe).
     */
    private static final class HoldFlag {
        private final Context context;

        HoldFlag(Context context) {
            this.context = context;
        }

        @JavascriptInterface
        public boolean isHeld() {
            return LeanWebView.keepPlayingInBackground;
        }

        @JavascriptInterface
        public boolean canPause() {
            return System.currentTimeMillis() < allowPauseUntil;
        }

        @JavascriptInterface
        public String appVersao() {
            try {
                String nome = context.getPackageManager()
                        .getPackageInfo(context.getPackageName(), 0).versionName;
                return nome == null ? "" : nome;
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public int appCodigo() {
            try {
                android.content.pm.PackageInfo info = context.getPackageManager()
                        .getPackageInfo(context.getPackageName(), 0);
                return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                        ? (int) info.getLongVersionCode() : info.versionCode;
            } catch (Exception e) {
                return 0;
            }
        }

        @JavascriptInterface
        public void instalar(String url) {
            AppUpdateInstaller.install(context, url);
        }
    }
    private static WeakReference<JavaScriptReplyProxy> topFrame = new WeakReference<>(null);
    private static WeakReference<WebView> currentWebView = new WeakReference<>(null);
    private static boolean pageReportsState = false;
    /** A página já trata dos comandos do aviso (versão nova do site). */
    private static boolean pageHandlesControls = false;
    private static boolean askedNotificationPermission = false;
    /** A app está à frente do utilizador? Só se segura a música quando ela sai. */
    private static volatile boolean appVisible = true;

    private WebAudioBridge() {}

    /** Chamar depois de configurar o WebView e antes de carregar a página. */
    public static void attach(Activity activity, Object webviewObject) {
        if (!(webviewObject instanceof WebView)) return;
        WebView webView = (WebView) webviewObject;
        currentWebView = new WeakReference<>(webView);

        Set<String> origins = allowedOrigins();
        Context appContext = activity.getApplicationContext();
        WeakReference<Activity> activityRef = new WeakReference<>(activity);
        try {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
                WebViewCompat.addWebMessageListener(webView, OBJECT_NAME, origins,
                        (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                            if (isMainFrame) topFrame = new WeakReference<>(replyProxy);
                            handleMessage(appContext, activityRef, message.getData(), isMainFrame);
                        });
            } else {
                Log.w(TAG, "WebView sem WEB_MESSAGE_LISTENER; atualiza o Android System WebView");
                return;
            }
            if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                WebViewCompat.addDocumentStartJavaScript(webView, SCRIPT, origins);
            }
            if (webView.getTag(R.id.webviewContainer) != WebAudioBridge.class) {
                // Objeto síncrono: o script sabe logo, sem atrasos, se pode continuar a tocar.
                webView.addJavascriptInterface(new HoldFlag(appContext), HOLD_NAME);
                webView.setTag(R.id.webviewContainer, WebAudioBridge.class);
            }
        } catch (Exception e) {
            Log.w(TAG, "Não foi possível ligar a ponte de áudio", e);
        }

        BackgroundAudioService.setControlListener(WebAudioBridge::sendControl);
    }

    public static boolean isAppVisible() {
        return appVisible;
    }

    /** A app saiu de primeiro plano (chamar antes de a janela ficar invisível). */
    public static void onHostPause(Context context) {
        appVisible = false;
    }

    /** A app voltou: o WebView e a página deixam de estar presos em segundo plano. */
    public static void onHostResume(Context context) {
        appVisible = true;
        release(context);
    }

    /**
     * Segura a música fora da app: a janela do WebView continua a ser dada como visível ao
     * Chromium, o WebView não é pausado e a página não se dá por escondida.
     */
    public static void hold(Context context) {
        LeanWebView.keepPlayingInBackground = true;
        WebView webView = currentWebView.get();
        if (webView == null) return;
        evaluate(webView, "window.__gsHold=true;window.__gsResumeHeld&&window.__gsResumeHeld();");
        runOnUi(webView, view -> {
            try {
                view.onResume();
                view.resumeTimers();
            } catch (Exception e) {
                Log.w(TAG, "Não foi possível retomar o WebView", e);
            }
        });
    }

    /** A app voltou (ou a música parou): o WebView e a página voltam ao normal. */
    public static void release(Context context) {
        LeanWebView.keepPlayingInBackground = false;
        WebView webView = currentWebView.get();
        if (webView == null) return;
        evaluate(webView, "window.__gsHold=false;");
    }

    /** Muda o estado da música: só se segura o WebView com a app fora de primeiro plano. */
    static void onPlaybackStateChanged(Context context, boolean playing) {
        if (!playing) {
            release(context);
        } else if (!appVisible) {
            hold(context);
        }
    }

    /** O utilizador mandou parar no aviso: a página pode calar a música durante uns segundos. */
    static void allowPause() {
        allowPauseUntil = System.currentTimeMillis() + 3000;
    }

    private static void evaluate(WebView webView, String script) {
        runOnUi(webView, view -> {
            try {
                view.evaluateJavascript(script, null);
            } catch (Exception e) {
                Log.w(TAG, "Não foi possível falar com a página", e);
            }
        });
    }

    private static void runOnUi(WebView webView, UiAction action) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            action.run(webView);
        } else {
            new Handler(Looper.getMainLooper()).post(() -> action.run(webView));
        }
    }

    private interface UiAction {
        void run(WebView webView);
    }

    private static Set<String> allowedOrigins() {
        Set<String> origins = new HashSet<>();
        try {
            Uri initial = Uri.parse(MedianConfig.get().getConfigRoot().getGeneral().getInitialUrl());
            if (initial.getScheme() != null && initial.getHost() != null) {
                origins.add(initial.getScheme() + "://" + initial.getHost()
                        + (initial.getPort() > 0 ? ":" + initial.getPort() : ""));
            }
        } catch (Exception e) {
            Log.w(TAG, "initialUrl inválido", e);
        }
        origins.add("https://goldstream-uzxb.onrender.com");
        origins.add("https://youtube.com");
        origins.add("https://*.youtube.com");
        origins.add("https://youtube-nocookie.com");
        origins.add("https://*.youtube-nocookie.com");
        return origins;
    }

    private static void handleMessage(Context context, WeakReference<Activity> activityRef,
                                      String data, boolean isMainFrame) {
        if (data == null) return;
        try {
            JSONObject json = new JSONObject(data);
            String type = json.optString("type");
            boolean playing = json.optBoolean("playing", false);
            if ("state".equals(type) && isMainFrame) {
                // A página diz exatamente o que toca: passa a mandar ela.
                pageReportsState = true;
                // Mensagens do próprio site (sem a marca do script injetado): já tem os
                // seus controlos ligados aos botões do aviso.
                if (!json.optBoolean("native", false) && !pageHandlesControls) {
                    pageHandlesControls = true;
                    WebView webView = currentWebView.get();
                    if (webView != null) evaluate(webView, "window.__gsPageControls=true;");
                }
                BackgroundAudioService.update(context, new BackgroundAudioService.NowPlaying(
                        playing,
                        emptyToNull(json.optString("title")),
                        emptyToNull(json.optString("artist")),
                        emptyToNull(json.optString("album")),
                        emptyToNull(json.optString("artwork")),
                        Math.round(json.optDouble("position", 0) * 1000),
                        Math.round(json.optDouble("duration", 0) * 1000)));
                if (playing) askNotificationPermission(activityRef.get());
            } else if ("media".equals(type) && !pageReportsState && isMainFrame) {
                // Página antiga: só sabemos que há som.
                BackgroundAudioService.update(context,
                        new BackgroundAudioService.NowPlaying(playing, null, null, null, null));
                if (playing) askNotificationPermission(activityRef.get());
            }
        } catch (Exception e) {
            Log.d(TAG, "Mensagem inválida: " + data);
        }
    }

    private static void sendControl(String action) {
        JavaScriptReplyProxy proxy = topFrame.get();
        if (proxy == null) return;
        try {
            proxy.postMessage(action);
        } catch (Exception e) {
            Log.w(TAG, "Não foi possível enviar '" + action + "' à página", e);
        }
    }

    /** Sem esta permissão (Android 13+) o aviso da música não aparece. Pede-se uma vez. */
    public static void askNotificationPermission(Activity activity) {
        if (askedNotificationPermission || activity == null) return;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        askedNotificationPermission = true;
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) return;
        ActivityCompat.requestPermissions(activity,
                new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
    }

    private static String emptyToNull(String value) {
        return value == null || value.isEmpty() ? null : value;
    }
}
