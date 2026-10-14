package com.ivan.pelagic;

import android.content.ComponentName;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.common.util.concurrent.ListenableFuture;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Bridge between the web player store and the native player (phase C). JS: src/player/nativeEngine.ts.
 *
 * Holds a MediaController connected to PelagicPlaybackService (which starts the service). All
 * controller calls happen on the main thread. Sends "state" events (index, media id, position,
 * playing, buffering, ended) on every change and twice a second while playing, and "error" events.
 */
@CapacitorPlugin(name = "PelagicPlayer")
public class PelagicPlayerPlugin extends Plugin {

    private final Handler main = new Handler(Looper.getMainLooper());
    private final List<Runnable> pending = new ArrayList<>();
    private ListenableFuture<MediaController> future;
    private MediaController controller;

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            if (controller == null) return;
            emitState();
            if (controller.isPlaying()) main.postDelayed(this, 500);
        }
    };

    @Override
    public void load() {
        main.post(this::connect);
    }

    private void connect() {
        if (future != null) return;
        SessionToken token = new SessionToken(getContext(), new ComponentName(getContext(), PelagicPlaybackService.class));
        future = new MediaController.Builder(getContext(), token).buildAsync();
        future.addListener(() -> {
            try {
                controller = future.get();
            } catch (Exception e) {
                future = null;
                return;
            }
            controller.addListener(new Player.Listener() {
                @Override
                public void onEvents(@NonNull Player player, @NonNull Player.Events events) {
                    emitState();
                    main.removeCallbacks(ticker);
                    if (player.isPlaying()) main.postDelayed(ticker, 500);
                }

                @Override
                public void onPlayerError(@NonNull PlaybackException error) {
                    JSObject out = new JSObject();
                    MediaItem item = controller.getCurrentMediaItem();
                    out.put("index", controller.getCurrentMediaItemIndex());
                    out.put("mediaId", item != null ? item.mediaId : null);
                    out.put("code", error.getErrorCodeName());
                    out.put("message", describe(error));
                    notifyListeners("error", out);
                }
            });
            for (Runnable r : pending) r.run();
            pending.clear();
            emitState();
        }, ContextCompat.getMainExecutor(getContext()));
    }

    /** Run on the main thread once the controller is connected. */
    private void withController(PluginCall call, ControllerTask task) {
        main.post(() -> {
            Runnable r = () -> {
                try {
                    task.run(controller);
                    if (call != null) call.resolve();
                } catch (Exception e) {
                    if (call != null) call.reject(e.getMessage() != null ? e.getMessage() : "Player error", e);
                }
            };
            if (controller != null) r.run();
            else {
                pending.add(r);
                connect();
            }
        });
    }

    private interface ControllerTask {
        void run(MediaController c) throws Exception;
    }

    private JSObject snapshot(MediaController c) {
        JSObject out = new JSObject();
        MediaItem item = c.getCurrentMediaItem();
        out.put("index", c.getCurrentMediaItemIndex());
        out.put("mediaId", item != null ? item.mediaId : null);
        out.put("positionMs", c.getCurrentPosition());
        out.put("durationMs", c.getDuration());
        out.put("playing", c.isPlaying());
        out.put("playWhenReady", c.getPlayWhenReady());
        out.put("buffering", c.getPlaybackState() == Player.STATE_BUFFERING);
        out.put("ended", c.getPlaybackState() == Player.STATE_ENDED);
        out.put("idle", c.getPlaybackState() == Player.STATE_IDLE);
        out.put("count", c.getMediaItemCount());
        return out;
    }

    private void emitState() {
        if (controller == null) return;
        notifyListeners("state", snapshot(controller));
    }

    /* ── Plugin methods ─────────────────────────────── */

    /** { email, token, expiresAt } — the signed-in account and its current Drive token. */
    @PluginMethod
    public void setAuth(PluginCall call) {
        Long expiresAt = call.getLong("expiresAt", 0L);
        DriveAuth.setFromJs(getContext(), call.getString("email"), call.getString("token"), expiresAt != null ? expiresAt : 0L);
        call.resolve();
    }

    /** Sign-out: forget the account and stop. */
    @PluginMethod
    public void clearAuth(PluginCall call) {
        DriveAuth.clear(getContext());
        withController(call, c -> {
            c.stop();
            c.clearMediaItems();
        });
    }

    /**
     * { items: [{ id, uri, title, artist, album, artworkUri }], index, positionMs, play, keepCurrent, repeat }
     *
     * Same list as now → only jumps (unless keepCurrent). keepCurrent with the current track at
     * `index` → the rest is rebuilt around it without interrupting playback (queue edits).
     * Otherwise the whole queue is replaced.
     */
    @PluginMethod
    public void setQueue(PluginCall call) {
        JSArray arr = call.getArray("items", new JSArray());
        List<MediaItem> items = new ArrayList<>();
        try {
            for (int i = 0; i < arr.length(); i++) items.add(toItem(arr.getJSONObject(i)));
        } catch (Exception e) {
            call.reject("Bad queue", e);
            return;
        }
        int index = call.getInt("index", 0);
        long positionMs = call.getLong("positionMs", 0L);
        boolean play = Boolean.TRUE.equals(call.getBoolean("play", false));
        boolean keepCurrent = Boolean.TRUE.equals(call.getBoolean("keepCurrent", false));
        String repeat = call.getString("repeat", "off");
        withController(call, c -> {
            if (items.isEmpty()) {
                c.stop();
                c.clearMediaItems();
                return;
            }
            int target = Math.max(0, Math.min(index, items.size() - 1));
            int n = c.getMediaItemCount();
            boolean same = n == items.size();
            for (int i = 0; same && i < n; i++) same = c.getMediaItemAt(i).mediaId.equals(items.get(i).mediaId);
            MediaItem cur = c.getCurrentMediaItem();

            if (same) {
                if (!keepCurrent) c.seekTo(target, positionMs);
            } else if (keepCurrent && cur != null && cur.mediaId.equals(items.get(target).mediaId)) {
                int at = c.getCurrentMediaItemIndex();
                if (at + 1 < n) c.removeMediaItems(at + 1, n);
                if (at > 0) c.removeMediaItems(0, at);
                if (target > 0) c.addMediaItems(0, new ArrayList<>(items.subList(0, target)));
                if (target + 1 < items.size()) c.addMediaItems(target + 1, new ArrayList<>(items.subList(target + 1, items.size())));
            } else {
                c.setMediaItems(items, target, positionMs);
            }
            c.setRepeatMode("one".equals(repeat) ? Player.REPEAT_MODE_ONE : "all".equals(repeat) ? Player.REPEAT_MODE_ALL : Player.REPEAT_MODE_OFF);
            if (play) {
                if (c.getPlaybackState() == Player.STATE_IDLE || c.getPlaybackState() == Player.STATE_ENDED) c.prepare();
                c.play();
            }
        });
    }

    @PluginMethod
    public void play(PluginCall call) {
        withController(call, c -> {
            if (c.getMediaItemCount() == 0) return;
            if (c.getPlaybackState() == Player.STATE_IDLE) c.prepare();
            if (c.getPlaybackState() == Player.STATE_ENDED) c.seekTo(c.getCurrentMediaItemIndex(), 0);
            c.play();
        });
    }

    @PluginMethod
    public void pause(PluginCall call) {
        withController(call, MediaController::pause);
    }

    /** { positionMs } */
    @PluginMethod
    public void seek(PluginCall call) {
        long positionMs = call.getLong("positionMs", 0L);
        withController(call, c -> c.seekTo(positionMs));
    }

    /** { mode: off | all | one } */
    @PluginMethod
    public void setRepeat(PluginCall call) {
        String mode = call.getString("mode", "off");
        withController(call, c -> c.setRepeatMode("one".equals(mode) ? Player.REPEAT_MODE_ONE : "all".equals(mode) ? Player.REPEAT_MODE_ALL : Player.REPEAT_MODE_OFF));
    }

    /** { volume: 0..1 } */
    @PluginMethod
    public void setVolume(PluginCall call) {
        Double v = call.getDouble("volume", 1.0);
        float volume = v != null ? (float) Math.max(0, Math.min(1, v)) : 1f;
        withController(call, c -> c.setVolume(volume));
    }

    /** Stop and empty the native queue. */
    @PluginMethod
    public void stop(PluginCall call) {
        withController(call, c -> {
            c.stop();
            c.clearMediaItems();
        });
    }

    /** → state + ids: what the native player has (e.g. kept playing while the app was closed). */
    @PluginMethod
    public void getState(PluginCall call) {
        main.post(() -> {
            Runnable r = () -> {
                JSObject out = snapshot(controller);
                JSArray ids = new JSArray();
                for (int i = 0; i < controller.getMediaItemCount(); i++) ids.put(controller.getMediaItemAt(i).mediaId);
                out.put("ids", ids);
                call.resolve(out);
            };
            if (controller != null) r.run();
            else {
                pending.add(r);
                connect();
            }
        });
    }

    private static MediaItem toItem(JSONObject o) throws Exception {
        String uri = o.getString("uri");
        MediaMetadata.Builder meta = new MediaMetadata.Builder()
            .setTitle(o.optString("title", ""))
            .setArtist(o.optString("artist", ""))
            .setAlbumTitle(o.optString("album", ""))
            .setIsPlayable(true);
        String art = o.optString("artworkUri", "");
        if (!art.isEmpty()) meta.setArtworkUri(Uri.parse(art));
        return new MediaItem.Builder()
            .setMediaId(o.getString("id"))
            .setUri(uri)
            // survives the trip to the session (see PelagicPlaybackService.onAddMediaItems)
            .setRequestMetadata(new MediaItem.RequestMetadata.Builder().setMediaUri(Uri.parse(uri)).build())
            .setMediaMetadata(meta.build())
            .build();
    }

    private static String describe(PlaybackException e) {
        switch (e.errorCode) {
            case PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED:
            case PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT:
                return "Network error while streaming.";
            case PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS:
                return "Drive refused the stream.";
            case PlaybackException.ERROR_CODE_PARSING_CONTAINER_MALFORMED:
            case PlaybackException.ERROR_CODE_DECODING_FAILED:
            case PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED:
                return "The file couldn't be decoded.";
            default:
                return e.getMessage() != null ? e.getMessage() : "Playback failed.";
        }
    }

    @Override
    protected void handleOnDestroy() {
        main.removeCallbacks(ticker);
        if (future != null) MediaController.releaseFuture(future);
        future = null;
        controller = null;
    }
}
