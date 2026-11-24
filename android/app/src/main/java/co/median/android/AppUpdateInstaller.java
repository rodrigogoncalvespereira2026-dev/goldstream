package co.median.android;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Descarrega o APK publicado no site e abre o instalador do Android.
 *
 * O WebView não escreve ficheiros nem instala aplicações, por isso a atualização que a
 * página pede (botão "Verificar atualização" / "Baixar o APK") é feita aqui. O ficheiro
 * fica na pasta interna da app, exposta pelo FileProvider já declarado no manifesto.
 */
public final class AppUpdateInstaller {
    private static final String TAG = "AppUpdateInstaller";
    private static final String FILE_NAME = "atualizacao.apk";
    /** Um APK menor do que isto é uma página de erro do servidor. */
    private static final long MIN_APK_BYTES = 1024 * 1024;

    private static final ExecutorService WORKER = Executors.newSingleThreadExecutor();
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private AppUpdateInstaller() {}

    /** Descarrega em segundo plano e abre o instalador na main thread. */
    public static void install(Context context, String url) {
        if (url == null || url.isEmpty()) return;
        final Context app = context.getApplicationContext();
        WORKER.execute(() -> {
            File apk = null;
            try {
                apk = download(app, url);
            } catch (Exception e) {
                Log.w(TAG, "Não foi possível descarregar o APK", e);
            }
            final File file = apk;
            MAIN.post(() -> {
                if (file == null) {
                    Log.w(TAG, "Download do APK falhou: " + url);
                    return;
                }
                openInstaller(app, file);
            });
        });
    }

    private static File download(Context context, String url) throws Exception {
        File target = new File(context.getFilesDir(), FILE_NAME);
        File temp = new File(context.getFilesDir(), FILE_NAME + ".part");
        if (temp.exists() && !temp.delete()) {
            Log.w(TAG, "Não consegui apagar o download anterior");
        }

        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setConnectTimeout(20000);
            connection.setReadTimeout(60000);
            connection.setInstanceFollowRedirects(true);
            try (InputStream in = connection.getInputStream();
                 FileOutputStream out = new FileOutputStream(temp)) {
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = in.read(buffer)) != -1) {
                    out.write(buffer, 0, read);
                }
            }
        } finally {
            if (connection != null) connection.disconnect();
        }

        if (temp.length() < MIN_APK_BYTES) {
            Log.w(TAG, "O que veio não é um APK (" + temp.length() + " bytes)");
            temp.delete();
            return null;
        }
        if (target.exists() && !target.delete()) {
            Log.w(TAG, "Não consegui substituir o APK anterior");
        }
        if (!temp.renameTo(target)) {
            Log.w(TAG, "Não consegui guardar o APK; fica o ficheiro temporário");
            return temp;
        }
        return target;
    }

    private static void openInstaller(Context context, File apk) {
        try {
            Uri uri = FileProvider.getUriForFile(
                    context, context.getPackageName() + ".fileprovider", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
        } catch (Exception e) {
            Log.w(TAG, "Não foi possível abrir o instalador", e);
            openUnknownSourcesSettings(context);
        }
    }

    /** Quando o Android bloqueia a instalação, leva o utilizador à opção que a permite. */
    private static void openUnknownSourcesSettings(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + context.getPackageName()))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
        } catch (Exception e) {
            Log.w(TAG, "Não consegui abrir as definições de instalação", e);
        }
    }
}
