package com.ivan.pelagic;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;

import androidx.annotation.Nullable;
import androidx.media3.common.Player;

import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Builds the widget's RemoteViews for its size (design_handoff_android_widget, "Layout mode by
 * cols / rows"). The handoff's cells are 80dp with 16dp gaps; launchers differ, so the mode follows
 * the widget's real size in dp, with the thresholds between the handoff's span sizes:
 *
 *   width  < 128 → 1 column  (album tile)
 *   width  < 224 → 2 columns (compact when 1 row, else cover)
 *   else           3–4 columns: bar (1 row; prev from 320dp), player (up to 250dp tall), player + queue
 *
 * Android 12+ gives the sizes the launcher may show (portrait / landscape): one layout per size.
 * Earlier versions: the portrait size (min width × max height).
 *
 * The handoff's heart / like button is left out on purpose (Pelagic has no liked songs, see the
 * plan's Decisions): the player has Shuffle in its place, player + queue has Repeat.
 */
final class WidgetRenderer {
    private static final int TEXT = 0xFFEDEDED, TEXT2 = 0xFFBDBDBD, MUTED = 0xFF8A8A8E, FAINT = 0xFF55555A;

    private WidgetRenderer() {}

    /** Everything one render needs (read once, used for every size). */
    static final class Model {
        @Nullable WidgetState.Now now;
        WidgetState.Info info;
        @Nullable WidgetState.Resume resume;
        /** the app's JavaScript is running: app-side actions go to it without opening the app */
        boolean ui;
    }

    static RemoteViews build(Context ctx, int widgetId, Bundle opts, Model m) {
        if (Build.VERSION.SDK_INT >= 31) {
            List<SizeF> sizes = sizesOf(opts);
            if (sizes != null && !sizes.isEmpty()) {
                Map<SizeF, RemoteViews> map = new LinkedHashMap<>();
                for (SizeF s : sizes) {
                    if (map.containsKey(s)) continue;
                    map.put(s, one(ctx, widgetId, s.getWidth(), s.getHeight(), m));
                }
                if (map.size() == 1) return map.values().iterator().next();
                return new RemoteViews(map);
            }
        }
        float w = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        float h = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        if (w <= 0 || h <= 0) {
            w = 368;
            h = 176;
        }
        return one(ctx, widgetId, w, h, m);
    }

    @SuppressWarnings("deprecation")
    @Nullable
    private static List<SizeF> sizesOf(Bundle opts) {
        return opts.getParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES);
    }

    /* ── One size ────────────────────────────────────── */

    private static final class R2 {
        final Context ctx;
        final int id;
        final float w, h;
        final int cols, rows;
        final Model m;
        /** px per dp for covers / picks / scrubber, and for the background */
        final float k, kBg;
        final boolean on, dj;
        final int accent, accentGlow;
        @Nullable Bitmap art;

        R2(Context ctx, int id, float w, float h, Model m) {
            this.ctx = ctx;
            this.id = id;
            this.w = w;
            this.h = h;
            this.m = m;
            cols = w < 128 ? 1 : w < 224 ? 2 : w < 320 ? 3 : 4;
            rows = h < 128 ? 1 : h < 250 ? 2 : 3;
            float d = ctx.getResources().getDisplayMetrics().density;
            k = Math.min(d, 2.25f);
            kBg = Math.min(d, 1.5f);
            on = m.now != null && m.now.playing;
            dj = m.now != null && m.now.dj;
            accent = dj ? WidgetArt.LILAC : 0xFFFFFFFF;
            accentGlow = dj ? 0x99C6B4F2 : 0x80FFFFFF;
        }
    }

    private static RemoteViews one(Context ctx, int widgetId, float w, float h, Model m) {
        R2 r = new R2(ctx, widgetId, w, h, m);
        if (m.now == null) return idle(r);
        r.art = WidgetArt.load(ctx, m.now.cur.art);
        if (r.cols == 1) return tile(r);
        if (r.cols == 2) return r.rows == 1 ? compact(r) : coverMode(r);
        if (r.rows == 1) return bar(r);
        return r.rows == 2 ? player(r) : tall(r);
    }

    /* ── Playing / paused layouts ────────────────────── */

    private static RemoteViews tile(R2 r) {
        RemoteViews v = new RemoteViews(r.ctx.getPackageName(), R.layout.widget_tile);
        WidgetArt.Bg bg = bg(r);
        bg.full = r.art;
        bg.fullAlpha = r.on ? 1f : 0.62f;
        bg.fullScrim = 1;
        bg.hairline = r.m.now.fraction();
        background(v, r, bg);
        v.setViewVisibility(R.id.wg_eq_badge, r.on ? View.VISIBLE : View.GONE);
        v.setInt(R.id.wg_eq, "setColorFilter", r.dj ? WidgetArt.LILAC : 0xFFFFFFFF);
        playButton(v, r);
        v.setOnClickPendingIntent(android.R.id.background, PelagicWidget.openApp(r.ctx, "open"));
        return v;
    }

    private static RemoteViews compact(R2 r) {
        RemoteViews v = new RemoteViews(r.ctx.getPackageName(), R.layout.widget_compact);
        WidgetArt.Bg bg = bg(r);
        bg.hairline = r.m.now.fraction();
        background(v, r, bg);
        label(v, r, false);
        texts(v, r);
        playButton(v, r);
        v.setOnClickPendingIntent(android.R.id.background, PelagicWidget.openApp(r.ctx, "open"));
        return v;
    }

    private static RemoteViews coverMode(R2 r) {
        RemoteViews v = new RemoteViews(r.ctx.getPackageName(), R.layout.widget_cover);
        WidgetArt.Bg bg = bg(r);
        bg.full = r.art;
        bg.fullAlpha = r.on ? 1f : 0.62f;
        bg.fullScrim = 2;
        bg.hairline = r.m.now.fraction();
        background(v, r, bg);
        label(v, r, false);
        texts(v, r);
        playButton(v, r);
        v.setOnClickPendingIntent(android.R.id.background, PelagicWidget.openApp(r.ctx, "open"));
        return v;
    }

    private static RemoteViews bar(R2 r) {
        RemoteViews v = new RemoteViews(r.ctx.getPackageName(), R.layout.widget_bar);
        WidgetArt.Bg bg = bg(r);
        bg.hairline = r.m.now.fraction();
        background(v, r, bg);
        v.setImageViewBitmap(R.id.wg_art, WidgetArt.cover(r.art, 48, 10, r.on ? 1f : 0.62f, r.k));
        texts(v, r);
        boolean prev = r.w >= 320;
        v.setViewVisibility(R.id.wg_eq, r.on ? View.VISIBLE : View.GONE);
        v.setInt(R.id.wg_eq, "setColorFilter", r.dj ? WidgetArt.LILAC : 0xFFFFFFFF);
        // the title wraps its text so the EQ sits right after it; cap it so the EQ stays visible
        float controls = (prev ? 42 : 0) + 44 + 42;
        float textW = r.w - 16 - 48 - 12 - 12 - controls - 10 - (r.on ? 16.5f : 0);
        v.setInt(R.id.wg_title, "setMaxWidth", Math.max(0, Math.round(textW * r.ctx.getResources().getDisplayMetrics().density)));
        v.setViewVisibility(R.id.wg_prev, prev ? View.VISIBLE : View.GONE);
        transport(v, r);
        playButton(v, r);
        v.setOnClickPendingIntent(android.R.id.background, PelagicWidget.openApp(r.ctx, "open"));
        return v;
    }

    private static RemoteViews player(R2 r) {
        RemoteViews v = new RemoteViews(r.ctx.getPackageName(), R.layout.widget_player);
        // cover: the full inner height, square — but leave the right column room for its controls
        float cover = Math.max(48, Math.min(r.h - 32, r.w - 32 - 16 - 176));
        WidgetArt.Bg bg = bg(r);
        bg.gx = 16;
        bg.gy = 16;
        bg.gs = cover;
        bg.glow = glowOf(r);
        background(v, r, bg);
        v.setImageViewBitmap(R.id.wg_art, WidgetArt.cover(r.art, cover, 14, r.on ? 1f : 0.62f, r.k));
        label(v, r, false);
        texts(v, r);
        float col = r.w - 32 - cover - 16;
        v.setImageViewBitmap(R.id.wg_scrub, WidgetArt.scrubber(col, r.m.now.fraction(), r.accent, r.accentGlow, r.k));
        transport(v, r);
        playButton(v, r);
        shuffle(v, r);
        v.setOnClickPendingIntent(android.R.id.background, PelagicWidget.openApp(r.ctx, "open"));
        return v;
    }

    private static RemoteViews tall(R2 r) {
        RemoteViews v = new RemoteViews(r.ctx.getPackageName(), R.layout.widget_tall);
        WidgetState.Now n = r.m.now;
        WidgetArt.Bg bg = bg(r);
        bg.gx = 16;
        bg.gy = 16;
        bg.gs = 88;
        bg.glow = glowOf(r);
        background(v, r, bg);
        v.setImageViewBitmap(R.id.wg_art, WidgetArt.cover(r.art, 88, 14, r.on ? 1f : 0.62f, r.k));
        label(v, r, true);
        texts(v, r);
        v.setImageViewBitmap(R.id.wg_scrub, WidgetArt.scrubber(r.w - 32, n.fraction(), r.accent, r.accentGlow, r.k));
        // elapsed time runs by itself while playing (Chronometer); the line moves on each update
        v.setChronometer(R.id.wg_pos, SystemClock.elapsedRealtime() - n.positionNow(), null, r.on);
        v.setTextViewText(R.id.wg_dur, n.durationMs > 0 ? clock(n.durationMs) : "--:--");
        transport(v, r);
        playButton(v, r);
        shuffle(v, r);
        repeat(v, r);

        int rows = Math.max(0, Math.min(6, (int) Math.floor((r.h - 222) / 44f)));
        rows = Math.min(rows, n.up.size());
        v.removeAllViews(R.id.wg_queue);
        v.setViewVisibility(R.id.wg_queue_box, rows > 0 ? View.VISIBLE : View.GONE);
        for (int i = 0; i < rows; i++) {
            WidgetState.Item it = n.up.get(i);
            RemoteViews row = new RemoteViews(r.ctx.getPackageName(), R.layout.widget_queue_row);
            row.setImageViewBitmap(R.id.wg_row_art, WidgetArt.cover(WidgetArt.load(r.ctx, it.art), 32, 6, 1f, r.k));
            row.setTextViewText(R.id.wg_row_title, it.title);
            row.setTextViewText(R.id.wg_row_artist, it.artist);
            row.setTextViewText(R.id.wg_row_n, i == 0 ? "NEXT" : "+" + (i + 1));
            row.setOnClickPendingIntent(R.id.wg_row, PelagicWidget.command(r.ctx, "jump", it.index, it.id));
            v.addView(R.id.wg_queue, row);
        }
        v.setOnClickPendingIntent(android.R.id.background, PelagicWidget.openApp(r.ctx, "open"));
        return v;
    }

    /* ── Nothing playing ─────────────────────────────── */

    private static RemoteViews idle(R2 r) {
        WidgetState.Resume res = r.m.resume;
        String album = res != null && !res.album.isEmpty() ? res.album : null;
        PendingIntent resume = res != null ? PelagicWidget.command(r.ctx, "resume", -1, null) : PelagicWidget.openApp(r.ctx, null);
        WidgetArt.Bg bg = bg(r);
        RemoteViews v;
        if (r.cols == 1) {
            v = new RemoteViews(r.ctx.getPackageName(), R.layout.widget_idle_tile);
            v.setOnClickPendingIntent(android.R.id.background, resume);
        } else if (r.cols == 2 && r.rows == 1) {
            v = new RemoteViews(r.ctx.getPackageName(), R.layout.widget_idle_compact);
            v.setTextViewText(R.id.wg_title, album != null ? album : "Pelagic");
            v.setTextViewText(R.id.wg_sub, album != null ? "Tap to resume" : "Tap to open");
            v.setOnClickPendingIntent(R.id.wg_play, resume);
            v.setOnClickPendingIntent(android.R.id.background, PelagicWidget.openApp(r.ctx, null));
        } else if (r.cols == 2) {
            v = new RemoteViews(r.ctx.getPackageName(), R.layout.widget_idle_cover);
            v.setTextViewText(R.id.wg_title, greeting());
            v.setTextViewText(R.id.wg_sub, album != null ? "Resume " + album : "Your library is ready");
            v.setOnClickPendingIntent(R.id.wg_play, resume);
            v.setOnClickPendingIntent(R.id.wg_dj, app(r, "dj"));
            v.setOnClickPendingIntent(android.R.id.background, PelagicWidget.openApp(r.ctx, null));
        } else if (r.rows == 1) {
            v = new RemoteViews(r.ctx.getPackageName(), R.layout.widget_idle_bar);
            v.setTextViewText(R.id.wg_title, "Nothing playing");
            v.setTextViewText(R.id.wg_sub, album != null ? "Resume " + album : "Tap to open Pelagic");
            v.setViewVisibility(R.id.wg_dj, r.w >= 320 ? View.VISIBLE : View.GONE);
            v.setOnClickPendingIntent(R.id.wg_dj, app(r, "dj"));
            v.setOnClickPendingIntent(R.id.wg_play, resume);
            v.setOnClickPendingIntent(android.R.id.background, PelagicWidget.openApp(r.ctx, null));
        } else {
            v = grid(r, res, resume);
        }
        background(v, r, bg);
        return v;
    }

    /** 3+ columns, 2+ rows: Resume · DJ · Daily Mix 1 (+ a second row at 4 rows) and Shuffle library. */
    private static RemoteViews grid(R2 r, @Nullable WidgetState.Resume res, PendingIntent resume) {
        RemoteViews v = new RemoteViews(r.ctx.getPackageName(), R.layout.widget_idle_grid);
        boolean tall = r.rows >= 3;
        boolean two = tall && r.h >= 340;
        v.setViewVisibility(R.id.wg_greeting, tall ? View.VISIBLE : View.GONE);
        v.setTextViewText(R.id.wg_greeting, greeting());
        v.setViewVisibility(R.id.wg_shuffle_all, tall ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.wg_gap2, tall ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.wg_grid2, two ? View.VISIBLE : View.GONE);
        if (tall) {
            int songs = r.m.info.songs;
            v.setTextViewText(R.id.wg_songs, songs > 0 ? NumberFormat.getIntegerInstance(Locale.US).format(songs) + " SONGS" : "");
            v.setOnClickPendingIntent(R.id.wg_shuffle_all, app(r, "shuffle-all"));
        }

        // tiles: square, 3 a row with 8dp gaps; smaller when the height doesn't allow it
        float tile = (r.w - 32 - 16) / 3f;
        float header = tall ? 44 : 20;
        float avail = r.h - 32 - header - 10 - (tall ? 10 + 44 : 0) - (two ? 8 : 0);
        tile = Math.max(40, Math.min(tile, two ? avail / 2f : avail));

        List<WidgetState.Pick> picks = new ArrayList<>();
        if (res != null) picks.add(new WidgetState.Pick("resume", res.album.isEmpty() ? "Resume" : res.album, "RESUME", res.art));
        picks.add(new WidgetState.Pick("dj", "DJ", "TAP TO START", null));
        picks.addAll(r.m.info.picks);

        v.removeAllViews(R.id.wg_grid1);
        v.removeAllViews(R.id.wg_grid2);
        int count = Math.min(picks.size(), two ? 6 : 3);
        for (int i = 0; i < count; i++) {
            WidgetState.Pick p = picks.get(i);
            boolean dj = "dj".equals(p.action);
            RemoteViews t = new RemoteViews(r.ctx.getPackageName(), R.layout.widget_idle_pick);
            t.setViewVisibility(R.id.wg_pick_gap, i % 3 == 0 ? View.GONE : View.VISIBLE);
            t.setImageViewBitmap(R.id.wg_pick_img, WidgetArt.pick(dj ? null : WidgetArt.load(r.ctx, p.art), dj, tile, r.k));
            t.setTextViewText(R.id.wg_pick_title, p.title);
            t.setTextColor(R.id.wg_pick_title, dj ? 0xFFFFFFFF : TEXT);
            t.setTextViewText(R.id.wg_pick_sub, p.sub);
            t.setTextColor(R.id.wg_pick_sub, dj ? WidgetArt.LILAC : TEXT2);
            t.setOnClickPendingIntent(R.id.wg_pick, "resume".equals(p.action) ? resume : app(r, p.action));
            v.addView(i < 3 ? R.id.wg_grid1 : R.id.wg_grid2, t);
        }
        v.setOnClickPendingIntent(android.R.id.background, PelagicWidget.openApp(r.ctx, null));
        return v;
    }

    /* ── Shared pieces ───────────────────────────────── */

    private static WidgetArt.Bg bg(R2 r) {
        WidgetArt.Bg bg = new WidgetArt.Bg();
        bg.w = r.w;
        bg.h = r.h;
        bg.scale = r.kBg;
        bg.radius = radiusDp(r.ctx);
        WidgetState.Now n = r.m.now;
        if (n != null) {
            bg.light = WidgetArt.load(r.ctx, n.cur.art);
            bg.lightAlpha = r.on ? 0.6f : 0.32f; // brighter album light on the glass base (was 0.42 / 0.22)
        }
        bg.accent = r.accent;
        bg.accentGlow = r.accentGlow;
        // contour offset: varies per widget and size, like the handoff's contourPos
        int seed = Math.abs((n != null ? n.cur.album : "").hashCode() % 5);
        bg.cx = (seed * 170 + r.cols * 90 + r.rows * 40) % 900;
        bg.cy = (r.rows * 120) % 500;
        return bg;
    }

    private static void background(RemoteViews v, R2 r, WidgetArt.Bg bg) {
        v.setImageViewBitmap(R.id.wg_bg, WidgetArt.background(r.ctx, bg));
    }

    private static float radiusDp(Context ctx) {
        float d = ctx.getResources().getDisplayMetrics().density;
        float px = ctx.getResources().getDimension(R.dimen.wg_radius);
        return px > 0 ? px / d : 24;
    }

    private static int glowOf(R2 r) {
        float hue = r.dj ? 295 : WidgetArt.hueOf(r.art);
        return WidgetArt.oklch(0.34, 0.06, hue, 0.9);
    }

    /** Status label: PLAYING / PAUSED / DJ · ON AIR; the long form says what it's playing from. */
    private static void label(RemoteViews v, R2 r, boolean full) {
        String ctxLabel = r.m.info.context == null ? "" : r.m.info.context.toUpperCase(Locale.ROOT);
        String text;
        if (r.dj) {
            String step = r.m.info.djStep;
            text = full && step != null && !step.isEmpty() ? "DJ · ON AIR · " + step : "DJ · ON AIR";
        } else if (!full || ctxLabel.isEmpty()) {
            text = r.on ? "PLAYING" : "PAUSED";
        } else {
            text = (r.on ? "PLAYING FROM " : "PAUSED · ") + ctxLabel;
        }
        v.setTextViewText(R.id.wg_label, text);
        v.setTextColor(R.id.wg_label, r.dj ? WidgetArt.LILAC : r.on ? TEXT2 : MUTED);
        v.setViewVisibility(R.id.wg_eq, r.on ? View.VISIBLE : View.GONE);
        v.setInt(R.id.wg_eq, "setColorFilter", r.dj ? WidgetArt.LILAC : 0xFFFFFFFF);
    }

    private static void texts(RemoteViews v, R2 r) {
        WidgetState.Item it = r.m.now.cur;
        v.setTextViewText(R.id.wg_title, it.title);
        v.setTextViewText(R.id.wg_artist, it.artist);
    }

    private static void playButton(RemoteViews v, R2 r) {
        v.setImageViewResource(R.id.wg_play, r.on ? R.drawable.ic_wg_pause : R.drawable.ic_wg_play);
        v.setInt(R.id.wg_play, "setBackgroundResource", r.dj ? R.drawable.wg_play_bg_dj : R.drawable.wg_play_bg);
        v.setInt(R.id.wg_play, "setColorFilter", WidgetArt.BASE);
        v.setContentDescription(R.id.wg_play, r.ctx.getString(r.on ? R.string.wg_pause : R.string.wg_play));
        v.setOnClickPendingIntent(R.id.wg_play, PelagicWidget.command(r.ctx, "toggle", -1, null));
    }

    private static void transport(RemoteViews v, R2 r) {
        v.setOnClickPendingIntent(R.id.wg_prev, PelagicWidget.command(r.ctx, "prev", -1, null));
        v.setOnClickPendingIntent(R.id.wg_next, PelagicWidget.command(r.ctx, "next", -1, null));
    }

    private static void shuffle(RemoteViews v, R2 r) {
        WidgetState.Info info = r.m.info;
        boolean ok = info.shuffleOk && !r.dj;
        v.setInt(R.id.wg_shuffle, "setColorFilter", !ok ? FAINT : info.shuffle ? r.accent : MUTED);
        if (ok) v.setOnClickPendingIntent(R.id.wg_shuffle, app(r, "shuffle"));
    }

    private static void repeat(RemoteViews v, R2 r) {
        boolean ok = r.m.info.shuffleOk && !r.dj;
        int mode = r.m.now.repeat;
        v.setImageViewResource(R.id.wg_repeat, mode == Player.REPEAT_MODE_ONE ? R.drawable.ic_wg_repeat_one : R.drawable.ic_wg_repeat);
        v.setInt(R.id.wg_repeat, "setColorFilter", !ok ? FAINT : mode != Player.REPEAT_MODE_OFF ? r.accent : MUTED);
        if (ok) v.setOnClickPendingIntent(R.id.wg_repeat, app(r, "repeat"));
    }

    /**
     * An action the app's JavaScript performs (shuffle, DJ, a mix…): straight to it when it's running,
     * else open the app with the action.
     */
    private static PendingIntent app(R2 r, String action) {
        return r.m.ui ? PelagicWidget.command(r.ctx, "app:" + action, -1, null) : PelagicWidget.openApp(r.ctx, action);
    }

    private static String greeting() {
        int h = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    }

    private static String clock(long ms) {
        long s = Math.max(0, ms / 1000);
        long h = s / 3600;
        return h > 0 ? String.format(Locale.US, "%d:%02d:%02d", h, (s / 60) % 60, s % 60)
            : String.format(Locale.US, "%02d:%02d", s / 60, s % 60);
    }
}
