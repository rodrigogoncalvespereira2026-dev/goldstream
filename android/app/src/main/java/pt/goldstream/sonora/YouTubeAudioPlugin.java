package pt.goldstream.sonora;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.schabi.newpipe.extractor.Image;
import org.schabi.newpipe.extractor.InfoItem;
import org.schabi.newpipe.extractor.NewPipe;
import org.schabi.newpipe.extractor.ServiceList;
import org.schabi.newpipe.extractor.search.SearchExtractor;
import org.schabi.newpipe.extractor.stream.AudioStream;
import org.schabi.newpipe.extractor.stream.StreamInfo;
import org.schabi.newpipe.extractor.stream.StreamInfoItem;

import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * As APIs públicas (Piped, Invidious) deixaram de devolver o áudio do YouTube. Aqui a
 * extração é feita no telemóvel, para a música poder tocar no player nativo em segundo plano.
 */
@CapacitorPlugin(name = "YouTubeAudio")
public class YouTubeAudioPlugin extends Plugin {

    private static boolean initialized = false;
    private static final Pattern VIDEO_ID = Pattern.compile("[?&]v=([a-zA-Z0-9_-]{11})");
    private static final Pattern SHORT_URL = Pattern.compile("youtu\\.be/([a-zA-Z0-9_-]{11})");

    /** NewPipe só pode ser iniciado uma vez; busca e áudio podem chegar em paralelo. */
    private static synchronized void ensureInitialized() {
        if (initialized) return;
        NewPipe.init(new SonoraDownloader());
        initialized = true;
    }

    /**
     * Busca direto no YouTube (via NewPipe), com a mesma ordem que o YouTube devolve. É o que
     * garante que tudo o que existe no YouTube aparece na app, sem depender de APIs públicas.
     */
    @PluginMethod
    public void search(final PluginCall call) {
        final String query = call.getString("query");
        if (query == null || query.trim().isEmpty()) {
            call.reject("query em falta.");
            return;
        }

        final int limit = call.getInt("limit", 30);

        new Thread(() -> {
            try {
                ensureInitialized();

                final JSArray items = new JSArray();
                final Set<String> seen = new HashSet<>();
                final String[] filters = {"music_songs", "music_videos", "videos", "all"};

                for (final String filter : filters) {
                    if (items.length() >= limit) break;
                    try {
                        final SearchExtractor extractor = ServiceList.YouTube.getSearchExtractor(
                                query.trim(), Collections.singletonList(filter), "");
                        final List<InfoItem> results = extractor.getInitialPage().getItems();

                        for (final InfoItem item : results) {
                            if (!(item instanceof StreamInfoItem)) continue;
                            final StreamInfoItem stream = (StreamInfoItem) item;
                            final String videoId = videoIdFrom(stream.getUrl());
                            if (videoId == null || seen.contains(videoId)) continue;
                            seen.add(videoId);

                            final JSObject entry = new JSObject();
                            entry.put("videoId", videoId);
                            entry.put("title", stream.getName());
                            entry.put("uploader", stream.getUploaderName());
                            entry.put("duration", stream.getDuration());
                            entry.put("thumbnail", bestThumbnail(stream));
                            items.put(entry);

                            if (items.length() >= limit) break;
                        }
                    } catch (final Exception ignored) {
                        // um filtro pode falhar (ex.: sem resultados de música): tenta o seguinte
                    }
                }

                if (items.length() == 0) {
                    reject(call, "Sem resultados no YouTube para esta busca.");
                    return;
                }

                final JSObject result = new JSObject();
                result.put("items", items);
                getActivity().runOnUiThread(() -> call.resolve(result));
            } catch (final Exception error) {
                reject(call, error.getMessage() != null ? error.getMessage() : "Falha na busca do YouTube.");
            }
        }).start();
    }

    private static String bestThumbnail(final StreamInfoItem stream) {
        final List<Image> thumbnails = stream.getThumbnails();
        if (thumbnails == null || thumbnails.isEmpty()) return "";
        Image best = thumbnails.get(0);
        for (final Image image : thumbnails) {
            if (image.getWidth() > best.getWidth()) best = image;
        }
        return best.getUrl() != null ? best.getUrl() : "";
    }

    private static String videoIdFrom(final String url) {
        if (url == null) return null;
        final Matcher watch = VIDEO_ID.matcher(url);
        if (watch.find()) return watch.group(1);
        final Matcher shortUrl = SHORT_URL.matcher(url);
        return shortUrl.find() ? shortUrl.group(1) : null;
    }

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
                ensureInitialized();

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
