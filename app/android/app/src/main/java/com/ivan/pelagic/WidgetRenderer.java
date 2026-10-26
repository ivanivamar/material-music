package com.ivan.pelagic;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Bundle;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;

import androidx.annotation.Nullable;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Builds the widget's RemoteViews for its size (Material 3 Expressive redesign, WidgetMaterial.dc.html).
 * The handoff's cells are 80dp with 16dp gaps; launchers differ, so the mode follows the widget's real
 * size in dp, with the thresholds between the handoff's span sizes:
 *
 *   width  < 128 → 1 column  (mTiny / iTiny)
 *   width  < 224 → 2 columns (mPill / iPill when 1 row, else mSq / iDual column)
 *   else           3–4 columns: mBar / iDual row (1 row), mPlayer / iGrid (2 rows), mPlayer + Up next / iGrid + Shuffle (3–4 rows)
 *
 * Android 12+ gives the sizes the launcher may show (portrait / landscape): one layout per size.
 * Earlier versions: the portrait size (min width × max height).
 *
 * No like / favourite button anywhere (Material Music rule).
 */
final class WidgetRenderer {

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
        /** px per dp for covers / picks / buttons, and for the background */
        final float k, kBg;
        final boolean on, dj;
        @Nullable Bitmap art;
        WidgetArt.Scheme s;

        R2(Context ctx, int id, float w, float h, Model m) {
            this.ctx = ctx;
            this.id = id;
            this.w = w;
            this.h = h;
            this.m = m;
            cols = w < 128 ? 1 : w < 224 ? 2 : w < 320 ? 3 : 4;
            rows = h < 128 ? 1 : h < 250 ? 2 : h < 330 ? 3 : 4;
            float d = ctx.getResources().getDisplayMetrics().density;
            k = Math.min(d, 2.25f);
            kBg = Math.min(d, 1.5f);
            on = m.now != null && m.now.playing;
            dj = m.now != null && m.now.dj;
            s = WidgetArt.Scheme.of(dj ? WidgetArt.DJ_HUE : WidgetArt.BRAND_HUE);
        }
    }

    private static RemoteViews one(Context ctx, int widgetId, float w, float h, Model m) {
        R2 r = new R2(ctx, widgetId, w, h, m);
        if (m.now == null) return idle(r);
        r.art = WidgetArt.load(ctx, m.now.cur.art);
        r.s = r.dj ? WidgetArt.Scheme.of(WidgetArt.DJ_HUE) : WidgetArt.Scheme.fromArt(r.art);
        if (r.cols == 1) return tile(r);
        if (r.cols == 2) return r.rows == 1 ? compact(r) : coverMode(r);
        if (r.rows == 1) return bar(r);
        return r.rows == 2 ? player(r) : tall(r);
    }

    /* ── Playing / paused layouts ────────────────────── */

    /** 1×1 (mTiny): full-bleed cover + 36×36 play/pause at bottom-right. */
    private static RemoteViews tile(R2 r) {
        RemoteViews v = new RemoteViews(r.ctx.getPackageName(), R.layout.widget_tile);
        WidgetArt.Bg bg = bg(r);
        bg.full = r.art;
        bg.fullAlpha = r.on ? 1f : 0.7f;
        background(v, bg);
        playButton(v, r, 36, 36, r.on ? 18 : 12, 22);
        v.setOnClickPendingIntent(android.R.id.background, PelagicWidget.openApp(r.ctx, "open"));
        return v;
    }

    /** 2×1 (mPill): 56dp cover (radius 16) + title + artist. */
    private static RemoteViews compact(R2 r) {
        RemoteViews v = new RemoteViews(r.ctx.getPackageName(), R.layout.widget_compact);
        WidgetArt.Bg bg = bg(r);
        bg.gx = 12;
        bg.gy = Math.max(8, (r.h - 56) * 0.5f);
        bg.gs = 56;
        bg.gr = 16;
        background(v, bg);
        v.setImageViewBitmap(R.id.wg_art, WidgetArt.cover(r.art, 56, 16, r.on ? 1f : 0.7f, r.k));
        v.setOnClickPendingIntent(R.id.wg_art, PelagicWidget.command(r.ctx, "toggle", -1, null));
        texts(v, r);
        v.setOnClickPendingIntent(android.R.id.background, PelagicWidget.openApp(r.ctx, "open"));
        return v;
    }

    /** 2×2+ (mSq): 72dp cover + 56dp play/pause at top, title + artist + 4dp progress bar at bottom. */
    private static RemoteViews coverMode(R2 r) {
        RemoteViews v = new RemoteViews(r.ctx.getPackageName(), R.layout.widget_cover);
        WidgetArt.Bg bg = bg(r);
        bg.gx = 16;
        bg.gy = 16;
        bg.gs = 72;
        bg.gr = 16;
        background(v, bg);
        v.setImageViewBitmap(R.id.wg_art, WidgetArt.cover(r.art, 72, 16, r.on ? 1f : 0.7f, r.k));
        playButton(v, r, 56, 56, r.on ? 28 : 16, 28);
        texts(v, r);
        v.setImageViewBitmap(R.id.wg_scrub, WidgetArt.progressBar(r.w - 32, r.m.now.fraction(), r.s.track, r.s.primary, r.k));
        v.setOnClickPendingIntent(android.R.id.background, PelagicWidget.openApp(r.ctx, "open"));
        return v;
    }

    /** 3×1 / 4×1 (mBar): 56dp cover, title + artist, prev · play 56 · next. */
    private static RemoteViews bar(R2 r) {
        RemoteViews v = new RemoteViews(r.ctx.getPackageName(), R.layout.widget_bar);
        WidgetArt.Bg bg = bg(r);
        bg.gx = 12;
        bg.gy = Math.max(8, (r.h - 56) * 0.5f);
        bg.gs = 56;
        bg.gr = 16;
        background(v, bg);
        v.setImageViewBitmap(R.id.wg_art, WidgetArt.cover(r.art, 56, 16, r.on ? 1f : 0.7f, r.k));
        texts(v, r);
        transport(v, r);
        playButton(v, r, 56, 56, r.on ? 28 : 16, 28);
        v.setOnClickPendingIntent(android.R.id.background, PelagicWidget.openApp(r.ctx, "open"));
        return v;
    }

    /** 3×2 / 4×2 (mPlayer): 144dp cover, status label (+ DJ knob), title, artist, 4dp progress bar, prev · play 64×48 · next · shuffle. */
    private static RemoteViews player(R2 r) {
        RemoteViews v = new RemoteViews(r.ctx.getPackageName(), R.layout.widget_player);
        float cover = Math.max(48, Math.min(144, Math.min(r.h - 32, r.w - 32 - 16 - 176)));
        WidgetArt.Bg bg = bg(r);
        bg.gx = 16;
        bg.gy = 16;
        bg.gs = cover;
        bg.gr = 20;
        background(v, bg);
        populatePlayerTop(v, r, cover);
        v.setOnClickPendingIntent(android.R.id.background, PelagicWidget.openApp(r.ctx, "open"));
        return v;
    }

    /** 3×3+ / 4×3+ (mPlayer + hasUp): 176dp mPlayer top + "Up next" card with upcoming queue rows. */
    private static RemoteViews tall(R2 r) {
        RemoteViews v = new RemoteViews(r.ctx.getPackageName(), R.layout.widget_tall);
        WidgetState.Now n = r.m.now;
        float cover = Math.max(48, Math.min(144, r.w - 32 - 16 - 176));

        int maxRows = r.rows == 3 ? 1 : Math.max(1, Math.min(3, (int) Math.floor((r.h - 176 - 16 - 36) / 48f)));
        int count = Math.min(maxRows, n.up.size());

        WidgetArt.Bg bg = bg(r);
        bg.gx = 16;
        bg.gy = 16;
        bg.gs = cover;
        bg.gr = 20;
        bg.hasUp = count > 0;
        background(v, bg);

        populatePlayerTop(v, r, cover);

        v.removeAllViews(R.id.wg_queue);
        v.setViewVisibility(R.id.wg_queue_box, count > 0 ? View.VISIBLE : View.GONE);
        v.setTextColor(R.id.wg_up_label, r.s.onVar);
        for (int i = 0; i < count; i++) {
            WidgetState.Item it = n.up.get(i);
            RemoteViews row = new RemoteViews(r.ctx.getPackageName(), R.layout.widget_queue_row);
            row.setImageViewBitmap(R.id.wg_row_art, WidgetArt.cover(WidgetArt.load(r.ctx, it.art), 36, 8, 1f, r.k));
            row.setTextViewText(R.id.wg_row_title, it.title);
            row.setTextColor(R.id.wg_row_title, r.s.on);
            row.setTextViewText(R.id.wg_row_artist, it.artist);
            row.setTextColor(R.id.wg_row_artist, r.s.onVar);
            row.setOnClickPendingIntent(R.id.wg_row, PelagicWidget.command(r.ctx, "jump", it.index, it.id));
            v.addView(R.id.wg_queue, row);
        }
        v.setOnClickPendingIntent(android.R.id.background, PelagicWidget.openApp(r.ctx, "open"));
        return v;
    }

    private static void populatePlayerTop(RemoteViews v, R2 r, float cover) {
        v.setImageViewBitmap(R.id.wg_art, WidgetArt.cover(r.art, cover, 20, r.on ? 1f : 0.7f, r.k));
        label(v, r);
        texts(v, r);
        float col = Math.max(80, r.w - 32 - cover - 16);
        v.setImageViewBitmap(R.id.wg_scrub, WidgetArt.progressBar(col, r.m.now.fraction(), r.s.track, r.s.primary, r.k));
        transport(v, r);
        playButton(v, r, 64, 48, r.on ? 24 : 16, 28);
        shuffle(v, r);
    }

    /* ── Nothing playing (idle) ──────────────────────── */

    private static RemoteViews idle(R2 r) {
        WidgetState.Resume res = r.m.resume;
        String album = res != null && !res.album.isEmpty() ? res.album : null;
        Bitmap resArt = res != null ? WidgetArt.load(r.ctx, res.art) : null;
        PendingIntent resume = res != null ? PelagicWidget.command(r.ctx, "resume", -1, null) : PelagicWidget.openApp(r.ctx, null);
        WidgetArt.Bg bg = bg(r);
        RemoteViews v;
        if (r.cols == 1) {
            v = new RemoteViews(r.ctx.getPackageName(), R.layout.widget_idle_tile);
            v.setImageViewBitmap(R.id.wg_play, WidgetArt.playButton(48, 48, 16, 28, r.s.primary, r.s.onPrimary, false, r.k));
            v.setOnClickPendingIntent(R.id.wg_play, resume);
            v.setOnClickPendingIntent(android.R.id.background, resume);
        } else if (r.cols == 2 && r.rows == 1) {
            v = new RemoteViews(r.ctx.getPackageName(), R.layout.widget_idle_compact);
            v.setImageViewBitmap(R.id.wg_art, WidgetArt.resumePillArt(resArt, r.s, r.k));
            v.setTextViewText(R.id.wg_title, "Resume");
            v.setTextColor(R.id.wg_title, r.s.on);
            v.setTextViewText(R.id.wg_sub, album != null ? album : "Material Music");
            v.setTextColor(R.id.wg_sub, r.s.onVar);
            v.setOnClickPendingIntent(android.R.id.background, resume);
        } else if (r.cols == 2 || r.rows == 1) {
            boolean col = r.cols == 2;
            bg.dualMode = col ? 1 : 2;
            v = new RemoteViews(r.ctx.getPackageName(), col ? R.layout.widget_idle_cover : R.layout.widget_idle_bar);
            v.setImageViewBitmap(R.id.wg_art, WidgetArt.cover(resArt, 40, 12, 1f, r.k));
            v.setTextViewText(R.id.wg_title, "Resume");
            v.setTextColor(R.id.wg_title, r.s.on);
            v.setTextViewText(R.id.wg_sub, album != null ? album : "Material Music");
            v.setTextColor(R.id.wg_sub, r.s.onVar);
            v.setImageViewBitmap(R.id.wg_knob, WidgetArt.knobBitmap(40, WidgetArt.DJ_KNOB, r.k));
            v.setTextColor(R.id.wg_dj_title, WidgetArt.DJ_CARD_FG);
            v.setTextColor(R.id.wg_dj_sub, WidgetArt.DJ_CARD_SUB);
            v.setOnClickPendingIntent(R.id.wg_play, resume);
            v.setOnClickPendingIntent(R.id.wg_dj, app(r, "dj"));
            v.setOnClickPendingIntent(android.R.id.background, PelagicWidget.openApp(r.ctx, null));
        } else {
            v = grid(r, res, resArt, resume);
        }
        background(v, bg);
        return v;
    }

    /** 3+ columns, 2+ rows (iGrid): 3 or 6 quick-start cards + "Shuffle library" pill from 3 rows. */
    private static RemoteViews grid(R2 r, @Nullable WidgetState.Resume res, @Nullable Bitmap resArt, PendingIntent resume) {
        RemoteViews v = new RemoteViews(r.ctx.getPackageName(), R.layout.widget_idle_grid);
        boolean showShuffle = r.rows >= 3;
        boolean twoRows = r.rows >= 4;

        v.setViewVisibility(R.id.wg_grid2, twoRows ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.wg_gap2, showShuffle ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.wg_shuffle_all, showShuffle ? View.VISIBLE : View.GONE);
        if (showShuffle) {
            v.setImageViewBitmap(R.id.wg_shuffle_bg, WidgetArt.pillButton(r.w - 16, 56, r.s.primary, r.k));
            v.setInt(R.id.wg_shuffle_ic, "setColorFilter", r.s.onPrimary);
            v.setTextColor(R.id.wg_shuffle_text, r.s.onPrimary);
            v.setOnClickPendingIntent(R.id.wg_shuffle_all, app(r, "shuffle-all"));
        }

        float cardW = Math.max(64, (r.w - 16 - 16) / 3f);
        float availH = r.h - 16 - (showShuffle ? 56 + 8 : 0) - (twoRows ? 8 : 0);
        float targetH = r.rows >= 4 ? 140 : r.rows == 3 ? 136 : 144;
        float cardH = Math.max(88, Math.min(targetH, twoRows ? availH / 2f : availH));
        float artH = Math.max(36, cardH - 60);

        List<WidgetState.Pick> picks = new ArrayList<>();
        if (res != null) {
            picks.add(new WidgetState.Pick("resume", res.album.isEmpty() ? "Resume" : res.album, "Resume", res.art));
        } else {
            picks.add(new WidgetState.Pick("resume", "Resume", "Tap to open", null));
        }
        picks.add(new WidgetState.Pick("dj", "DJ", "Start a session", null));
        picks.addAll(r.m.info.picks);

        v.removeAllViews(R.id.wg_grid1);
        v.removeAllViews(R.id.wg_grid2);
        int count = Math.min(picks.size(), twoRows ? 6 : 3);
        for (int i = 0; i < count; i++) {
            WidgetState.Pick p = picks.get(i);
            boolean dj = "dj".equals(p.action);
            Bitmap pArt = dj ? null : ("resume".equals(p.action) ? resArt : WidgetArt.load(r.ctx, p.art));
            RemoteViews t = new RemoteViews(r.ctx.getPackageName(), R.layout.widget_idle_pick);
            t.setViewVisibility(R.id.wg_pick_gap, i % 3 == 0 ? View.GONE : View.VISIBLE);
            t.setImageViewBitmap(R.id.wg_pick_img, WidgetArt.pick(pArt, dj, cardW, cardH, artH, r.s, r.k));
            t.setTextViewText(R.id.wg_pick_title, p.title);
            t.setTextColor(R.id.wg_pick_title, dj ? WidgetArt.DJ_CARD_FG : r.s.on);
            t.setTextViewText(R.id.wg_pick_sub, p.sub);
            t.setTextColor(R.id.wg_pick_sub, dj ? WidgetArt.DJ_CARD_SUB : r.s.onVar);
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
        bg.scheme = r.s;
        if (r.m.now != null) {
            bg.light = r.art;
            bg.lightAlpha = r.on ? 0.42f : 0.22f;
        }
        return bg;
    }

    private static void background(RemoteViews v, WidgetArt.Bg bg) {
        v.setImageViewBitmap(R.id.wg_bg, WidgetArt.background(bg));
    }

    private static float radiusDp(Context ctx) {
        float d = ctx.getResources().getDisplayMetrics().density;
        float px = ctx.getResources().getDimension(R.dimen.wg_radius);
        return px > 0 ? px / d : 28;
    }

    /** Status label in mPlayer: sentence case, colored s.primary, with the 16dp DJ knob when DJ is on. */
    private static void label(RemoteViews v, R2 r) {
        String ctxLabel = r.m.info.context == null ? "" : r.m.info.context.trim();
        if (ctxLabel.isEmpty() && r.m.now != null && !r.m.now.cur.album.isEmpty()) {
            ctxLabel = r.m.now.cur.album;
        }
        String text;
        if (r.dj) {
            String step = r.m.info.djStep;
            text = step != null && !step.isEmpty() ? "DJ · On air · " + step : "DJ · On air";
        } else if (ctxLabel.isEmpty()) {
            text = r.on ? "Playing" : "Paused";
        } else {
            text = (r.on ? "Playing from " : "Paused · ") + ctxLabel;
        }
        v.setTextViewText(R.id.wg_label, text);
        v.setTextColor(R.id.wg_label, r.s.primary);
        v.setViewVisibility(R.id.wg_knob, r.dj ? View.VISIBLE : View.GONE);
        if (r.dj) {
            v.setImageViewBitmap(R.id.wg_knob, WidgetArt.knobBitmap(16, r.s.primary, r.k));
        }
    }

    private static void texts(RemoteViews v, R2 r) {
        WidgetState.Item it = r.m.now.cur;
        v.setTextViewText(R.id.wg_title, it.title);
        v.setTextColor(R.id.wg_title, r.s.on);
        v.setTextViewText(R.id.wg_artist, it.artist);
        v.setTextColor(R.id.wg_artist, r.s.onVar);
    }

    private static void playButton(RemoteViews v, R2 r, float wDp, float hDp, float radiusDp, float iconDp) {
        v.setImageViewBitmap(R.id.wg_play, WidgetArt.playButton(wDp, hDp, radiusDp, iconDp, r.s.primary, r.s.onPrimary, r.on, r.k));
        v.setContentDescription(R.id.wg_play, r.ctx.getString(r.on ? R.string.wg_pause : R.string.wg_play));
        v.setOnClickPendingIntent(R.id.wg_play, PelagicWidget.command(r.ctx, "toggle", -1, null));
    }

    private static void transport(RemoteViews v, R2 r) {
        v.setInt(R.id.wg_prev, "setColorFilter", r.s.on);
        v.setInt(R.id.wg_next, "setColorFilter", r.s.on);
        v.setOnClickPendingIntent(R.id.wg_prev, PelagicWidget.command(r.ctx, "prev", -1, null));
        v.setOnClickPendingIntent(R.id.wg_next, PelagicWidget.command(r.ctx, "next", -1, null));
    }

    private static void shuffle(RemoteViews v, R2 r) {
        WidgetState.Info info = r.m.info;
        boolean ok = info.shuffleOk && !r.dj;
        v.setImageViewBitmap(R.id.wg_shuffle, WidgetArt.shuffleButton(info.shuffle, ok, r.s, r.k));
        if (ok) v.setOnClickPendingIntent(R.id.wg_shuffle, app(r, "shuffle"));
    }

    /**
     * An action the app's JavaScript performs (shuffle, DJ, a mix…): straight to it when it's running,
     * else open the app with the action.
     */
    private static PendingIntent app(R2 r, String action) {
        return r.m.ui ? PelagicWidget.command(r.ctx, "app:" + action, -1, null) : PelagicWidget.openApp(r.ctx, action);
    }
}
