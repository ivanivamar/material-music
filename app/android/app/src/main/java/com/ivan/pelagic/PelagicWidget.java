package com.ivan.pelagic;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.widget.RemoteViews;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.media3.common.Player;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;

import com.google.common.util.concurrent.ListenableFuture;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The home screen "Now playing" widget (design_handoff_android_widget).
 *
 * Drawing: PelagicPlaybackService asks for an update on every player change (and every 30 s while
 * playing, for the progress line); the app asks when its info changes (PelagicWidgetPlugin). The
 * player is read on the main thread, then WidgetRenderer builds the views on BG (covers, blur).
 *
 * Taps: play / pause, previous, next, a queue row and Resume work on the native player directly —
 * also with the app closed (Resume loads the last queue the app sent, WidgetState). Shuffle, repeat,
 * the DJ, the mixes, a radio and Shuffle library are the app's: sent to its JavaScript when it's
 * running (PelagicWidgetPlugin), else they open the app with the action. Anything else opens the app
 * on the full-screen player.
 */
public class PelagicWidget extends AppWidgetProvider {
    private static final String TAG = "PelagicWidget";
    static final String ACTION_COMMAND = "com.ivan.materialmusic.widget.COMMAND";
    /** MainActivity intent action for widget launches (not MAIN, so a running app gets onNewIntent) */
    static final String ACTION_OPEN = "com.ivan.materialmusic.widget.OPEN";
    private static final String EXTRA_CMD = "cmd";
    private static final String EXTRA_INDEX = "index";
    private static final String EXTRA_ID = "id";

    /** widget work off the main thread: rendering, the resume file */
    static final ExecutorService BG = Executors.newSingleThreadExecutor();
    private static final Handler main = new Handler(Looper.getMainLooper());
    @Nullable private static Context app;
    private static final Runnable render = PelagicWidget::renderNow;

    /* ── Updates ─────────────────────────────────────── */

    /** Redraw every placed widget soon (changes within 250 ms are drawn once). Any thread. */
    static void requestUpdate(Context ctx) {
        app = ctx.getApplicationContext();
        main.removeCallbacks(render);
        main.postDelayed(render, 250);
    }

    private static void renderNow() {
        Context ctx = app;
        if (ctx == null) return;
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, PelagicWidget.class));
        if (ids == null || ids.length == 0) return;
        PelagicPlaybackService svc = PelagicPlaybackService.instance;
        WidgetRenderer.Model m = new WidgetRenderer.Model();
        m.now = svc != null ? WidgetState.capture(svc.player()) : null;
        m.ui = PelagicWidgetPlugin.alive();
        BG.execute(() -> {
            m.info = WidgetState.info(ctx);
            m.resume = WidgetState.resume(ctx);
            for (int id : ids) {
                try {
                    Bundle opts = mgr.getAppWidgetOptions(id);
                    RemoteViews views = WidgetRenderer.build(ctx, id, opts, m);
                    mgr.updateAppWidget(id, views);
                } catch (Exception e) {
                    Log.w(TAG, "Widget update failed", e);
                }
            }
        });
    }

    @Override
    public void onUpdate(@NonNull Context context, @NonNull AppWidgetManager mgr, @NonNull int[] ids) {
        requestUpdate(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(@NonNull Context context, @NonNull AppWidgetManager mgr, int id, @NonNull Bundle opts) {
        requestUpdate(context);
    }

    @Override
    public void onReceive(@NonNull Context context, @NonNull Intent intent) {
        if (ACTION_COMMAND.equals(intent.getAction())) {
            handle(context, intent);
            return;
        }
        super.onReceive(context, intent);
    }

    /* ── Pending intents ─────────────────────────────── */

    /** A tap handled here (play / pause, prev, next, jump, resume, app:…). */
    static PendingIntent command(Context ctx, String cmd, int index, @Nullable String id) {
        Intent i = new Intent(ctx, PelagicWidget.class)
            .setAction(ACTION_COMMAND)
            // the data makes each command its own PendingIntent
            .setData(Uri.parse("pelagic-widget://" + Uri.encode(cmd) + "/" + index))
            .putExtra(EXTRA_CMD, cmd)
            .putExtra(EXTRA_INDEX, index);
        if (id != null) i.putExtra(EXTRA_ID, id);
        return PendingIntent.getBroadcast(ctx, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Open the app; with an action ("open" = the full-screen player, "dj", "mix:<id>"…) for its JavaScript. */
    static PendingIntent openApp(Context ctx, @Nullable String action) {
        Intent i = launchIntent(ctx, action);
        int code = action == null ? 1 : 2 + (action.hashCode() & 0x3FFFFFFF);
        return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static Intent launchIntent(Context ctx, @Nullable String action) {
        Intent i = new Intent(ctx, MainActivity.class)
            .setAction(ACTION_OPEN)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (action != null) {
            i.putExtra(PelagicWidgetPlugin.EXTRA_ACTION, action);
            i.putExtra(PelagicWidgetPlugin.EXTRA_AT, System.currentTimeMillis());
        }
        return i;
    }

    /** From a tap whose app wasn't running any more: best effort (Android may not allow it from here). */
    static void startApp(Context ctx, @Nullable String action) {
        try {
            ctx.startActivity(launchIntent(ctx, action));
        } catch (Exception e) {
            Log.w(TAG, "Could not open the app", e);
        }
    }

    /* ── Taps ────────────────────────────────────────── */

    private static void handle(Context ctx, Intent intent) {
        String cmd = intent.getStringExtra(EXTRA_CMD);
        if (cmd == null) return;
        if (cmd.startsWith("app:")) {
            PelagicWidgetPlugin.dispatch(ctx, cmd.substring(4));
            requestUpdate(ctx);
            return;
        }
        PelagicPlaybackService svc = PelagicPlaybackService.instance;
        Player p = svc != null ? svc.player() : null;
        boolean loaded = p != null && p.getMediaItemCount() > 0;
        switch (cmd) {
            case "toggle":
                if (!loaded) {
                    resume(ctx, p);
                } else if (p.getPlayWhenReady() && p.getPlaybackState() != Player.STATE_ENDED) {
                    p.pause();
                } else {
                    play(p);
                }
                break;
            case "next":
                if (loaded) {
                    p.seekToNext();
                    if (p.getPlaybackState() == Player.STATE_IDLE) p.prepare();
                }
                break;
            case "prev":
                if (loaded) {
                    p.seekToPrevious();
                    if (p.getPlaybackState() == Player.STATE_IDLE) p.prepare();
                }
                break;
            case "jump": {
                int index = intent.getIntExtra(EXTRA_INDEX, -1);
                String id = intent.getStringExtra(EXTRA_ID);
                if (loaded && index >= 0 && index < p.getMediaItemCount() && p.getMediaItemAt(index).mediaId.equals(id)) {
                    p.seekTo(index, 0);
                    play(p);
                }
                break;
            }
            case "resume":
                if (loaded) play(p);
                else resume(ctx, p);
                break;
            default:
                break;
        }
        requestUpdate(ctx);
    }

    private static void play(Player p) {
        if (p.getPlaybackState() == Player.STATE_IDLE) p.prepare();
        if (p.getPlaybackState() == Player.STATE_ENDED) p.seekTo(p.getCurrentMediaItemIndex(), 0);
        p.play();
    }

    /**
     * Nothing loaded: start the last queue the app sent. With the service running, on its player;
     * otherwise a MediaController starts the service first.
     */
    private static void resume(Context ctx, @Nullable Player p) {
        if (p != null) {
            if (!loadSaved(ctx, p)) startApp(ctx, null);
            return;
        }
        Context appCtx = ctx.getApplicationContext();
        SessionToken token = new SessionToken(appCtx, new ComponentName(appCtx, PelagicPlaybackService.class));
        ListenableFuture<MediaController> future = new MediaController.Builder(appCtx, token).buildAsync();
        future.addListener(() -> {
            try {
                MediaController c = future.get();
                if (c.getMediaItemCount() > 0) play(c);
                else if (!loadSaved(appCtx, c)) startApp(appCtx, null);
            } catch (Exception e) {
                Log.w(TAG, "Resume failed", e);
            }
            // the service keeps playing on its own; this controller was only the way in
            main.postDelayed(() -> MediaController.releaseFuture(future), 3000);
            requestUpdate(appCtx);
        }, ContextCompat.getMainExecutor(appCtx));
    }

    private static boolean loadSaved(Context ctx, Player p) {
        WidgetState.Queue q = WidgetState.loadQueue(ctx);
        if (q == null) return false;
        p.setMediaItems(q.items, q.index, q.positionMs);
        p.prepare();
        p.play();
        return true;
    }
}
