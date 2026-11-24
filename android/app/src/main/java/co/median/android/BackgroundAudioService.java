package co.median.android;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.Icon;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.text.TextUtils;
import android.util.Log;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Serviço em primeiro plano da música: mostra o aviso com a faixa (título, artista, capa e
 * botões), liga a MediaSession (ecrã bloqueado, auscultadores) e mantém o processo vivo com
 * a app em segundo plano. O som continua a sair do WebView; para o Chromium não pausar o
 * áudio ao sair da app, o WebView é segurado pelo {@link WebAudioBridge#hold(Context)}
 * (janela sempre "visível" e sem pausa). Os botões são reenviados para a página.
 */
public class BackgroundAudioService extends Service {
    private static final String TAG = "BackgroundAudioService";
    private static final String CHANNEL_ID = "background_audio";
    private static final int NOTIFICATION_ID = 4711;
    private static final long CHECK_INTERVAL_MS = 15_000;
    // Parado (pausa, fim da fila) durante este tempo: larga o aviso e o serviço.
    private static final long IDLE_TIMEOUT_MS = 10 * 60_000;

    static final String ACTION_UPDATE = "co.median.android.audio.UPDATE";
    static final String ACTION_TOGGLE = "co.median.android.audio.TOGGLE";
    static final String ACTION_NEXT = "co.median.android.audio.NEXT";
    static final String ACTION_PREV = "co.median.android.audio.PREV";

    /** Para onde vão os botões do aviso / MediaSession. */
    public interface ControlListener {
        void onControl(String action);
    }

    /** O que está a tocar, vindo da página. */
    public static final class NowPlaying {
        public final boolean playing;
        public final String title;
        public final String artist;
        public final String album;
        public final String artwork;
        /** Posição e duração na faixa (ms), para a barra e os minutos do aviso. */
        public final long positionMs;
        public final long durationMs;

        public NowPlaying(boolean playing, String title, String artist, String album, String artwork) {
            this(playing, title, artist, album, artwork, 0, 0);
        }

        public NowPlaying(boolean playing, String title, String artist, String album, String artwork,
                          long positionMs, long durationMs) {
            this.playing = playing;
            this.title = title;
            this.artist = artist;
            this.album = album;
            this.artwork = artwork;
            this.positionMs = Math.max(0, positionMs);
            this.durationMs = Math.max(0, durationMs);
        }

        NowPlaying withPlaying(boolean value) {
            return new NowPlaying(value, title, artist, album, artwork, positionMs, durationMs);
        }
    }

    private static BackgroundAudioService instance;
    private static NowPlaying state;
    private static ControlListener controlListener;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService artworkLoader = Executors.newSingleThreadExecutor();
    private MediaSession session;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private long idleSince = 0;
    private String artworkUrl;
    private Bitmap artwork;

    public static void setControlListener(ControlListener listener) {
        controlListener = listener;
    }

    public static boolean isRunning() {
        return instance != null;
    }

    /**
     * Atualiza o aviso. Arranca o serviço quando começa a tocar; se já estiver a correr só
     * troca o conteúdo (funciona também com a app em segundo plano). Chamar na main thread.
     */
    public static void update(Context context, NowPlaying nowPlaying) {
        NowPlaying previous = state;
        // Uma leitura sem duração (stream a começar) não pode apagar a que já se conhece
        // da mesma faixa: era isso que deixava a barra do aviso sem minutos.
        if (nowPlaying.durationMs == 0 && previous != null && previous.durationMs > 0
                && nowPlaying.title != null && nowPlaying.title.equals(previous.title)) {
            nowPlaying = new NowPlaying(nowPlaying.playing, nowPlaying.title, nowPlaying.artist,
                    nowPlaying.album, nowPlaying.artwork, nowPlaying.positionMs, previous.durationMs);
        }
        state = nowPlaying;
        if (instance != null) {
            instance.refresh();
            return;
        }
        if (!nowPlaying.playing) return;
        start(context, previous == null);
    }

    /**
     * Rede de segurança para páginas que ainda não falam com a app: ao sair, se houver som,
     * arranca o serviço com um aviso genérico. Chamar com a atividade ainda visível.
     */
    public static void startIfPlaying(Context context) {
        AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        boolean pagePlaying = state != null && state.playing;
        boolean musicActive = am != null && am.isMusicActive();
        // Sem som não há nada para manter vivo.
        if (!pagePlaying && !musicActive) return;
        // Segura já o WebView: o Chromium pausa o áudio assim que a janela fica invisível.
        WebAudioBridge.hold(context);
        if (instance != null) return;
        if (state == null) state = new NowPlaying(true, null, null, null, null);
        else state = state.withPlaying(true);
        start(context, false);
    }

    public static void stop(Context context) {
        context.stopService(new Intent(context, BackgroundAudioService.class));
    }

    private static void start(Context context, boolean first) {
        try {
            Intent intent = new Intent(context, BackgroundAudioService.class).setAction(ACTION_UPDATE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception e) {
            // Android 12+ recusa arrancar a partir de segundo plano.
            Log.w(TAG, "Não foi possível arrancar o serviço de áudio", e);
        }
    }

    private final Runnable idleChecker = new Runnable() {
        @Override
        public void run() {
            boolean playing = (state != null && state.playing) || isMusicActive();
            long now = System.currentTimeMillis();
            if (playing) {
                idleSince = 0;
            } else if (idleSince == 0) {
                idleSince = now;
            } else if (now - idleSince >= IDLE_TIMEOUT_MS) {
                Log.d(TAG, "Parado há algum tempo; a fechar o aviso");
                stopSelf();
                return;
            }
            handler.postDelayed(this, CHECK_INTERVAL_MS);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createChannel();
        session = new MediaSession(this, "GoldenStream");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { sendControl("play"); }
            @Override public void onPause() { sendControl("pause"); }
            @Override public void onSkipToNext() { sendControl("next"); }
            @Override public void onSkipToPrevious() { sendControl("prev"); }
            @Override public void onStop() { sendControl("pause"); }
        });
        session.setSessionActivity(contentIntent());
        session.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // startForeground tem de acontecer sempre, logo de início.
        startForegroundCompat(buildNotification());

        String action = intent != null ? intent.getAction() : null;
        if (ACTION_TOGGLE.equals(action)) {
            sendControl(state != null && state.playing ? "pause" : "play");
        } else if (ACTION_NEXT.equals(action)) {
            sendControl("next");
        } else if (ACTION_PREV.equals(action)) {
            sendControl("prev");
        }

        refresh();
        handler.removeCallbacks(idleChecker);
        handler.postDelayed(idleChecker, CHECK_INTERVAL_MS);
        return START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // App fechada nos recentes: pára tudo.
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(idleChecker);
        artworkLoader.shutdownNow();
        releaseLocks();
        WebAudioBridge.release(this);
        if (session != null) {
            session.setActive(false);
            session.release();
        }
        if (instance == this) instance = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void sendControl(String action) {
        // Mostra logo a mudança no aviso; a página confirma a seguir.
        if (state != null && ("play".equals(action) || "pause".equals(action))) {
            if ("pause".equals(action)) WebAudioBridge.allowPause();
            state = state.withPlaying("play".equals(action));
            refresh();
        }
        ControlListener listener = controlListener;
        if (listener != null) listener.onControl(action);
    }

    private boolean isMusicActive() {
        AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        return am != null && am.isMusicActive();
    }

    private void refresh() {
        NowPlaying np = state;
        boolean playing = np != null && np.playing;
        if (playing) {
            idleSince = 0;
            acquireLocks();
        } else {
            releaseLocks();
        }
        // Mantém a música viva (ou liberta o WebView) conforme a app esteja fora ou dentro.
        WebAudioBridge.onPlaybackStateChanged(this, playing);
        loadArtwork(np != null ? np.artwork : null);
        updateSession(np);
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(NOTIFICATION_ID, buildNotification());
    }

    private void updateSession(NowPlaying np) {
        if (session == null) return;
        MediaMetadata.Builder meta = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title(np))
                .putString(MediaMetadata.METADATA_KEY_ARTIST, np != null && np.artist != null ? np.artist : "")
                .putString(MediaMetadata.METADATA_KEY_ALBUM, np != null && np.album != null ? np.album : "");
        if (artwork != null) meta.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, artwork);
        // Sem a duração o Android mostra 00:00 nos dois lados da barra.
        if (np != null && np.durationMs > 0) {
            meta.putLong(MediaMetadata.METADATA_KEY_DURATION, np.durationMs);
        }
        session.setMetadata(meta.build());

        boolean playing = np != null && np.playing;
        long position = np != null ? np.positionMs : 0;
        session.setPlaybackState(new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
                        | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SKIP_TO_NEXT
                        | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_STOP
                        | PlaybackState.ACTION_SEEK_TO)
                .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                        position, playing ? 1f : 0f)
                .build());
    }

    private String title(NowPlaying np) {
        if (np != null && !TextUtils.isEmpty(np.title)) return np.title;
        return getString(R.string.app_name);
    }

    private Notification buildNotification() {
        NowPlaying np = state;
        boolean playing = np != null && np.playing;
        String text = np != null && !TextUtils.isEmpty(np.artist) ? np.artist
                : (playing ? "A tocar" : "Em pausa");

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        builder.setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title(np))
                .setContentText(text)
                .setContentIntent(contentIntent())
                .setOngoing(playing)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setCategory(Notification.CATEGORY_TRANSPORT)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .addAction(action(android.R.drawable.ic_media_previous, "Anterior", ACTION_PREV, 1))
                .addAction(playing
                        ? action(android.R.drawable.ic_media_pause, "Pausa", ACTION_TOGGLE, 2)
                        : action(android.R.drawable.ic_media_play, "Tocar", ACTION_TOGGLE, 2))
                .addAction(action(android.R.drawable.ic_media_next, "Seguinte", ACTION_NEXT, 3))
                .setStyle(new Notification.MediaStyle()
                        .setMediaSession(session != null ? session.getSessionToken() : null)
                        .setShowActionsInCompactView(0, 1, 2));
        if (artwork != null) builder.setLargeIcon(artwork);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        }
        return builder.build();
    }

    private Notification.Action action(int icon, String label, String action, int requestCode) {
        return new Notification.Action.Builder(Icon.createWithResource(this, icon), label,
                serviceIntent(action, requestCode)).build();
    }

    private PendingIntent serviceIntent(String action, int requestCode) {
        Intent intent = new Intent(this, BackgroundAudioService.class).setAction(action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? PendingIntent.getForegroundService(this, requestCode, intent, flags)
                : PendingIntent.getService(this, requestCode, intent, flags);
    }

    private PendingIntent contentIntent() {
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open == null) open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        return PendingIntent.getActivity(this, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void startForegroundCompat(Notification notification) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Exception e) {
            Log.w(TAG, "startForeground falhou", e);
        }
    }

    private void loadArtwork(String url) {
        if (TextUtils.isEmpty(url)) {
            artworkUrl = null;
            artwork = null;
            return;
        }
        if (url.equals(artworkUrl)) return;
        artworkUrl = url;
        artwork = null;
        try {
            artworkLoader.execute(() -> {
                Bitmap bitmap = download(url);
                handler.post(() -> {
                    if (bitmap == null || !url.equals(artworkUrl) || instance != this) return;
                    artwork = bitmap;
                    refresh();
                });
            });
        } catch (Exception ignored) {
            // serviço a fechar
        }
    }

    private static Bitmap download(String url) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(8000);
            try (InputStream in = connection.getInputStream()) {
                Bitmap bitmap = BitmapFactory.decodeStream(in);
                if (bitmap == null) return null;
                int max = 512;
                int w = bitmap.getWidth(), h = bitmap.getHeight();
                if (w <= max && h <= max) return bitmap;
                float scale = Math.min((float) max / w, (float) max / h);
                return Bitmap.createScaledBitmap(bitmap, Math.round(w * scale), Math.round(h * scale), true);
            }
        } catch (Exception e) {
            Log.d(TAG, "Capa indisponível: " + url);
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Reprodução de música", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Música a tocar e controlos");
        channel.setShowBadge(false);
        nm.createNotificationChannel(channel);
    }

    private void acquireLocks() {
        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, getPackageName() + ":audio");
                wakeLock.setReferenceCounted(false);
            }
        }
        if (wakeLock != null && !wakeLock.isHeld()) wakeLock.acquire();

        if (wifiLock == null) {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                int mode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                        ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY
                        : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
                wifiLock = wm.createWifiLock(mode, getPackageName() + ":audio");
                wifiLock.setReferenceCounted(false);
            }
        }
        if (wifiLock != null && !wifiLock.isHeld()) wifiLock.acquire();
    }

    private void releaseLocks() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
    }
}
