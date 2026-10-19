package com.ivan.pelagic;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;

import androidx.annotation.Nullable;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The home screen widget ↔ the web app (JS: src/native/widget.ts).
 *
 *  - setInfo(info): what only the app knows — "playing from" label, shuffle, the DJ's step, the
 *    picks of the "nothing playing" grid, the library size (WidgetState.Info). Redraws the widget.
 *  - "action" events: widget taps the app performs ("open", "shuffle", "repeat", "dj", "mix:<id>",
 *    "radio:<id>", "shuffle-all"). Kept until a listener is there, so an action that launched the
 *    app arrives once the app has started.
 *
 * While this plugin is loaded the widget sends those taps here without opening the app (alive()).
 */
@CapacitorPlugin(name = "PelagicWidget")
public class PelagicWidgetPlugin extends Plugin {
    static final String EXTRA_ACTION = "pelagic.widget.action";
    static final String EXTRA_AT = "pelagic.widget.at";
    /** a launch intent re-delivered later (activity recreated) must not run its action again */
    private static final long MAX_AGE_MS = 60_000;

    @Nullable private static volatile PelagicWidgetPlugin current;

    static boolean alive() {
        return current != null;
    }

    @Override
    public void load() {
        current = this;
        Activity a = getActivity();
        if (a != null) take(a.getIntent());
        PelagicWidget.requestUpdate(getContext());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        take(intent);
    }

    @Override
    protected void handleOnDestroy() {
        if (current == this) current = null;
        PelagicWidget.requestUpdate(getContext());
    }

    private void take(@Nullable Intent intent) {
        if (intent == null) return;
        String action = intent.getStringExtra(EXTRA_ACTION);
        if (action == null) return;
        long at = intent.getLongExtra(EXTRA_AT, 0);
        intent.removeExtra(EXTRA_ACTION);
        intent.removeExtra(EXTRA_AT);
        if (System.currentTimeMillis() - at > MAX_AGE_MS) return;
        emit(action);
    }

    private void emit(String action) {
        JSObject o = new JSObject();
        o.put("action", action);
        notifyListeners("action", o, true);
    }

    /** A widget tap for the app: to its JavaScript if it's running, else open the app with it. */
    static void dispatch(Context ctx, String action) {
        PelagicWidgetPlugin p = current;
        if (p != null) p.emit(action);
        else PelagicWidget.startApp(ctx, action);
    }

    /** { context, shuffleOk, shuffle, djStep, songs, picks: [{ action, title, sub, art }] } */
    @PluginMethod
    public void setInfo(PluginCall call) {
        WidgetState.setInfo(getContext(), call.getData());
        PelagicWidget.requestUpdate(getContext());
        call.resolve();
    }
}
