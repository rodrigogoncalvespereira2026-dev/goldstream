package pt.goldstream.sonora;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * O WebView da app não descarrega ficheiros APK: um link ou window.open fica em nada.
 * Este plugin entrega o endereço ao Chrome, que transfere o ficheiro e pede a instalação.
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

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
}
