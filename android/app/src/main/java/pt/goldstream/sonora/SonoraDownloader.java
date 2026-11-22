package pt.goldstream.sonora;

import org.schabi.newpipe.extractor.downloader.Downloader;
import org.schabi.newpipe.extractor.downloader.Request;
import org.schabi.newpipe.extractor.downloader.Response;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.List;
import java.util.Map;

/** Downloader mínimo (HttpURLConnection) usado pelo NewPipeExtractor. */
public final class SonoraDownloader extends Downloader {

    @Override
    public Response execute(final Request request) throws IOException {
        final HttpURLConnection connection = (HttpURLConnection) new URL(request.url()).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(15000);
        connection.setRequestMethod(request.httpMethod());

        final Map<String, List<String>> headers = request.headers();
        if (headers != null) {
            for (final Map.Entry<String, List<String>> entry : headers.entrySet()) {
                for (final String value : entry.getValue()) {
                    connection.setRequestProperty(entry.getKey(), value);
                }
            }
        }

        final byte[] data = request.dataToSend();
        if (data != null && data.length > 0) {
            connection.setDoOutput(true);
            connection.getOutputStream().write(data);
        }

        final int code = connection.getResponseCode();
        final InputStream stream = code >= 400 ? connection.getErrorStream() : connection.getInputStream();
        final String body = readAll(stream);

        return new Response(code, connection.getResponseMessage(), connection.getHeaderFields(), body, request.url());
    }

    private static String readAll(final InputStream input) throws IOException {
        if (input == null) {
            return "";
        }
        final ByteArrayOutputStream out = new ByteArrayOutputStream();
        final byte[] buffer = new byte[8192];
        int read;
        while ((read = input.read(buffer)) != -1) {
            out.write(buffer, 0, read);
        }
        input.close();
        return out.toString("UTF-8");
    }
}
