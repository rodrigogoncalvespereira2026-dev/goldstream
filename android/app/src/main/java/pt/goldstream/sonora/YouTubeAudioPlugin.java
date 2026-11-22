package pt.goldstream.sonora;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.schabi.newpipe.extractor.NewPipe;
import org.schabi.newpipe.extractor.ServiceList;
import org.schabi.newpipe.extractor.stream.AudioStream;
import org.schabi.newpipe.extractor.stream.StreamInfo;

import java.util.List;

/**
 * As APIs públicas (Piped, Invidious) deixaram de devolver o áudio do YouTube. Aqui a
 * extração é feita no telemóvel, para a música poder tocar no player nativo em segundo plano.
 */
@CapacitorPlugin(name = "YouTubeAudio")
public class YouTubeAudioPlugin extends Plugin {

    private static boolean initialized = false;

    @PluginMethod
    public void resolve(final PluginCall call) {
        final String videoId = call.getString("videoId");
        if (videoId == null || videoId.isEmpty()) {
            call.reject("videoId em falta.");
            return;
        }

        final String watchUrl = "https://www.youtube.com/watch?v=" + videoId;

        new Thread(() -> {
            try {
                if (!initialized) {
                    NewPipe.init(new SonoraDownloader());
                    initialized = true;
                }

                final StreamInfo info = StreamInfo.getInfo(ServiceList.YouTube, watchUrl);
                final List<AudioStream> streams = info.getAudioStreams();

                if (streams == null || streams.isEmpty()) {
                    reject(call, "Sem áudio disponível para esta música.");
                    return;
                }

                AudioStream best = streams.get(0);
                for (final AudioStream candidate : streams) {
                    if (candidate.getAverageBitrate() > best.getAverageBitrate()) {
                        best = candidate;
                    }
                }

                final JSObject result = new JSObject();
                result.put("url", best.getContent());
                result.put("mimeType", best.getFormat() != null ? best.getFormat().getMimeType() : "audio/mp4");

                getActivity().runOnUiThread(() -> call.resolve(result));
            } catch (final Exception error) {
                reject(call, error.getMessage() != null ? error.getMessage() : "Falha ao obter o áudio.");
            }
        }).start();
    }

    private void reject(final PluginCall call, final String message) {
        getActivity().runOnUiThread(() -> call.reject(message));
    }
}
