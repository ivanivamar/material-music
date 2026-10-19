package com.ivan.pelagic;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.SystemClock;

import androidx.annotation.Nullable;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * What the home screen widget shows (design_handoff_android_widget).
 *
 *  - Now: read from the playback service's player (main thread) whenever something changes.
 *  - Info: what only the web app knows — the "playing from" label, shuffle, the DJ's "3/7", and the
 *    picks of the "nothing playing" grid (today's mixes, a radio, the library size). Pushed by
 *    PelagicWidgetPlugin.setInfo, kept in prefs so the widget can draw it with the app closed.
 *  - Resume: the last queue the app sent to the player (a file) plus where it was (prefs), so the
 *    widget's Resume can start it again natively, even when the app isn't running.
 */
final class WidgetState {
    private static final String PREFS = "pelagic.widget";
    private static final String QUEUE_FILE = "widget-queue.json";

    private WidgetState() {}

    /* ── Now playing ─────────────────────────────────── */

    static final class Item {
        final String id;
        final String title;
        final String artist;
        final String album;
        @Nullable final String art;
        final int index;

        Item(String id, String title, String artist, String album, @Nullable String art, int index) {
            this.id = id;
            this.title = title;
            this.artist = artist;
            this.album = album;
            this.art = art;
            this.index = index;
        }
    }

    static final class Now {
        Item cur;
        /** upcoming rows (DJ intros left out), at most 6 */
        final List<Item> up = new ArrayList<>();
        /** playing or about to (playWhenReady) */
        boolean playing;
        /** a DJ item: lilac accent, "DJ · ON AIR" */
        boolean dj;
        long positionMs;
        long durationMs;
        /** SystemClock.elapsedRealtime() when read */
        long at;
        int repeat;

        /** position now, counting the time since it was read while playing */
        long positionNow() {
            long p = positionMs + (playing ? SystemClock.elapsedRealtime() - at : 0);
            return durationMs > 0 ? Math.min(p, durationMs) : Math.max(0, p);
        }

        float fraction() {
            return durationMs > 0 ? Math.max(0f, Math.min(1f, positionNow() / (float) durationMs)) : 0f;
        }
    }

    /** The player's state for the widget; null when it has nothing loaded. Main thread only. */
    @Nullable
    static Now capture(@Nullable Player p) {
        if (p == null || p.getMediaItemCount() == 0) return null;
        MediaItem it = p.getCurrentMediaItem();
        if (it == null) return null;
        Now n = new Now();
        int idx = p.getCurrentMediaItemIndex();
        n.cur = item(it, idx);
        int st = p.getPlaybackState();
        n.playing = p.getPlayWhenReady() && st != Player.STATE_ENDED && st != Player.STATE_IDLE;
        Bundle x = it.mediaMetadata.extras;
        n.dj = x != null && x.getBoolean(PelagicPlaybackService.EXTRA_DJ, false);
        n.positionMs = Math.max(0, p.getCurrentPosition());
        long d = p.getDuration();
        n.durationMs = d == C.TIME_UNSET ? 0 : Math.max(0, d);
        n.at = SystemClock.elapsedRealtime();
        n.repeat = p.getRepeatMode();
        int count = p.getMediaItemCount();
        for (int i = idx + 1; i < count && n.up.size() < 6; i++) {
            MediaItem m = p.getMediaItemAt(i);
            Bundle e = m.mediaMetadata.extras;
            if (e != null && e.getBoolean(PelagicPlaybackService.EXTRA_INTRO, false)) continue;
            n.up.add(item(m, i));
        }
        return n;
    }

    private static Item item(MediaItem m, int index) {
        MediaMetadata md = m.mediaMetadata;
        return new Item(m.mediaId, str(md.title), str(md.artist), str(md.albumTitle),
            md.artworkUri != null ? md.artworkUri.toString() : null, index);
    }

    private static String str(@Nullable CharSequence s) {
        return s == null ? "" : s.toString();
    }

    /* ── Info from the app ───────────────────────────── */

    static final class Pick {
        /** what tapping it does: "dj", "mix:<id>", "radio:<id>" (handled by the app, native/widget.ts) */
        final String action;
        final String title;
        final String sub;
        @Nullable final String art;

        Pick(String action, String title, String sub, @Nullable String art) {
            this.action = action;
            this.title = title;
            this.sub = sub;
            this.art = art;
        }
    }

    static final class Info {
        /** "playing from" label, e.g. the album title */
        String context = "";
        /** shuffle can be toggled (not for the DJ / a radio) */
        boolean shuffleOk = true;
        boolean shuffle;
        /** "3/7" while the DJ plays, else empty */
        String djStep = "";
        int songs;
        /** after Resume and DJ: Daily Mix 1, a radio, Daily Mix 2, Rediscover */
        final List<Pick> picks = new ArrayList<>();
    }

    static void setInfo(Context ctx, JSONObject o) {
        prefs(ctx).edit().putString("info", o.toString()).apply();
    }

    static Info info(Context ctx) {
        Info info = new Info();
        String raw = prefs(ctx).getString("info", null);
        if (raw == null) return info;
        try {
            JSONObject o = new JSONObject(raw);
            info.context = o.optString("context", "");
            info.shuffleOk = o.optBoolean("shuffleOk", true);
            info.shuffle = o.optBoolean("shuffle", false);
            info.djStep = o.optString("djStep", "");
            info.songs = o.optInt("songs", 0);
            JSONArray picks = o.optJSONArray("picks");
            if (picks != null) {
                for (int i = 0; i < picks.length(); i++) {
                    JSONObject p = picks.optJSONObject(i);
                    if (p == null) continue;
                    String action = p.optString("action", "");
                    if (action.isEmpty()) continue;
                    String art = p.optString("art", "");
                    info.picks.add(new Pick(action, p.optString("title", ""), p.optString("sub", ""), art.isEmpty() ? null : art));
                }
            }
        } catch (Exception ignored) {
            // a bad blob: draw without it
        }
        return info;
    }

    /* ── Resume ──────────────────────────────────────── */

    static final class Resume {
        /** the album of the track it was on (shown as "Resume <album>") */
        final String album;
        @Nullable final String art;

        Resume(String album, @Nullable String art) {
            this.album = album;
            this.art = art;
        }
    }

    /** The queue the app just sent to the player (PelagicPlayerPlugin.setQueue), raw JSON items. */
    static void saveQueue(Context ctx, String itemsJson) {
        Context app = ctx.getApplicationContext();
        PelagicWidget.BG.execute(() -> {
            File f = new File(app.getFilesDir(), QUEUE_FILE);
            File tmp = new File(app.getFilesDir(), QUEUE_FILE + ".tmp");
            try (FileOutputStream out = new FileOutputStream(tmp)) {
                out.write(itemsJson.getBytes(StandardCharsets.UTF_8));
            } catch (Exception e) {
                return;
            }
            //noinspection ResultOfMethodCallIgnored
            tmp.renameTo(f);
        });
    }

    /** Where the player is in that queue (the service saves it on pauses and track changes). */
    static void savePosition(Context ctx, Now n) {
        prefs(ctx).edit()
            .putString("resumeId", n.cur.id)
            .putInt("resumeIndex", n.cur.index)
            .putLong("resumePos", n.positionNow())
            .putString("resumeAlbum", n.cur.album.isEmpty() ? n.cur.title : n.cur.album)
            .putString("resumeArt", n.cur.art)
            .apply();
    }

    @Nullable
    static Resume resume(Context ctx) {
        SharedPreferences p = prefs(ctx);
        String id = p.getString("resumeId", null);
        if (id == null || !new File(ctx.getFilesDir(), QUEUE_FILE).isFile()) return null;
        return new Resume(p.getString("resumeAlbum", ""), p.getString("resumeArt", null));
    }

    static final class Queue {
        final List<MediaItem> items;
        final int index;
        final long positionMs;

        Queue(List<MediaItem> items, int index, long positionMs) {
            this.items = items;
            this.index = index;
            this.positionMs = positionMs;
        }
    }

    /** The saved queue as media items, positioned where it was; null when there is none. */
    @Nullable
    static Queue loadQueue(Context ctx) {
        SharedPreferences p = prefs(ctx);
        String id = p.getString("resumeId", null);
        File f = new File(ctx.getFilesDir(), QUEUE_FILE);
        if (!f.isFile()) return null;
        try (FileInputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[16384];
            int n;
            while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
            JSONArray arr = new JSONArray(buf.toString("UTF-8"));
            List<MediaItem> items = new ArrayList<>(arr.length());
            for (int i = 0; i < arr.length(); i++) items.add(PelagicPlayerPlugin.toItem(arr.getJSONObject(i)));
            if (items.isEmpty()) return null;
            int index = p.getInt("resumeIndex", 0);
            long pos = p.getLong("resumePos", 0);
            // the saved row must still be that track; else find it, else start from the top
            if (index < 0 || index >= items.size() || id == null || !id.equals(items.get(index).mediaId)) {
                index = 0;
                pos = 0;
                for (int i = 0; id != null && i < items.size(); i++) {
                    if (id.equals(items.get(i).mediaId)) {
                        index = i;
                        break;
                    }
                }
            }
            return new Queue(items, index, pos);
        } catch (Exception e) {
            return null;
        }
    }

    /** Sign-out: forget everything about the account. */
    static void clear(Context ctx) {
        prefs(ctx).edit().clear().apply();
        //noinspection ResultOfMethodCallIgnored
        new File(ctx.getFilesDir(), QUEUE_FILE).delete();
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
