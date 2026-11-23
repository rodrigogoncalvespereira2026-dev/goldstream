package pt.goldstream.sonora;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * O WebView não descarrega ficheiros APK nem instala nada: o ficheiro é transferido
 * aqui, para a cache da app, e entregue ao instalador do Android por um URI de conteúdo.
 * openDownload fica como alternativa (abre o Chrome no endereço do APK).
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    private static final String NOME_FICHEIRO = "goldenstream.apk";

    @PluginMethod
    public void openDownload(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("URL do APK em falta.");
            return;
        }

        try {
            Context context = getContext();
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);

            JSObject result = new JSObject();
            result.put("opened", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Não consegui abrir o navegador para o download.", error);
        }
    }

    /** Descarrega o APK para a cache e abre o instalador do sistema. */
    @PluginMethod
    public void instalar(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("URL do APK em falta.");
            return;
        }

        Context context = getContext();
        // Android 8+: sem "instalar apps desconhecidas" o instalador não faz nada.
        // Em vez de falhar em silêncio, abre o ecrã certo das definições e explica.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !context.getPackageManager().canRequestPackageInstalls()) {
            Intent ajustes = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + context.getPackageName()));
            ajustes.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(ajustes);
            rejectar(call, "Autorize a instalação de apps desconhecidas e toque em atualizar outra vez.");
            return;
        }

        // O download corre fora da thread da interface (senão a app congela) e a
        // resposta volta à thread da interface, como o Capacitor espera.
        new Thread(() -> {
            try {
                File apk = baixar(url);
                naInterface(() -> {
                    try {
                        abrirInstalador(apk);
                        JSObject result = new JSObject();
                        result.put("caminho", apk.getAbsolutePath());
                        call.resolve(result);
                    } catch (Exception erro) {
                        call.reject("Não consegui abrir o instalador: " + erro.getMessage());
                    }
                });
            } catch (Exception erro) {
                rejectar(call, "Não consegui baixar a atualização: " + erro.getMessage());
            }
        }).start();
    }

    private File baixar(String endereco) throws Exception {
        File destino = new File(getContext().getCacheDir(), NOME_FICHEIRO);
        HttpURLConnection ligacao = (HttpURLConnection) new URL(endereco).openConnection();
        // O Render/CDN pode redirecionar.
        ligacao.setInstanceFollowRedirects(true);
        ligacao.setConnectTimeout(20000);
        ligacao.setReadTimeout(60000);
        ligacao.connect();
        try (InputStream entrada = ligacao.getInputStream();
             FileOutputStream saida = new FileOutputStream(destino)) {
            byte[] bloco = new byte[8192];
            int lidos;
            while ((lidos = entrada.read(bloco)) > 0) {
                saida.write(bloco, 0, lidos);
            }
        } finally {
            ligacao.disconnect();
        }
        return destino;
    }

    private void abrirInstalador(File apk) {
        Context context = getContext();
        // A autoridade tem de casar com a do AndroidManifest: <package>.fileprovider.
        Uri uri = FileProvider.getUriForFile(
                context,
                context.getPackageName() + ".fileprovider",
                apk);
        Intent instalar = new Intent(Intent.ACTION_VIEW);
        instalar.setDataAndType(uri, "application/vnd.android.package-archive");
        instalar.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        instalar.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(instalar);
    }

    private void naInterface(Runnable acao) {
        if (getActivity() != null) {
            getActivity().runOnUiThread(acao);
        }
    }

    private void rejectar(PluginCall call, String mensagem) {
        naInterface(() -> call.reject(mensagem));
    }
}
