package com.ivan.pelagic;

import android.app.PendingIntent;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DataSourceBitmapLoader;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.HttpDataSource;
import androidx.media3.datasource.ResolvingDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.session.CommandButton;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import androidx.media3.session.SessionCommand;
import androidx.media3.session.SessionCommands;
import androidx.media3.session.SessionResult;

import com.google.common.collect.ImmutableList;

import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.common.util.concurrent.MoreExecutors;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Executors;

/**
 * Native playback (phase C): ExoPlayer inside a MediaSessionService.
 *
 * The queue lives here, so tracks keep advancing with the screen off and the app in the background.
 * Media3 provides the media notification, lock-screen / Bluetooth / headset controls, audio focus
 * (pauses for calls and other apps) and pause-on-unplug. The web UI is a controller: it sends the
 * queue and transport commands through PelagicNativePlugin and mirrors this player's state.
 *
 * Audio and artwork stream straight from Google Drive; every request to googleapis.com gets the
 * OAuth header from DriveAuth — unless the file is downloaded (Offline), then the stored copy plays. A 401 drops the token and retries once with a fresh one; any other
 * failure skips to the next track (at most 3 in a row), like the web player.
 */
@UnstableApi
public class PelagicPlaybackService extends MediaSessionService {

    private static final int MAX_SKIPS = 3;

    /* DJ (step 22): media item extras set by PelagicPlayerPlugin.toItem */
    static final String EXTRA_DJ = "pelagic.dj";
    static final String EXTRA_INTRO = "pelagic.intro";
    static final String EXTRA_VOLUME = "pelagic.volume";
    /** "Skip session": the notification / lock-screen action while the DJ plays */
    static final String ACTION_SKIP_SESSION = "com.ivan.pelagic.SKIP_SESSION";
    private static final SessionCommand SKIP_SESSION = new SessionCommand(ACTION_SKIP_SESSION, Bundle.EMPTY);
    private CommandButton skipButton;
    private boolean djShown = false;

    private ExoPlayer player;
    private MediaSession session;
    private int authRetries = 0;
    private int skips = 0;

    /* Home screen widget: the running service (main thread), and its progress refresh while playing */
    @Nullable static volatile PelagicPlaybackService instance;
    private final Handler main = new Handler(Looper.getMainLooper());
    private static final long WIDGET_TICK_MS = 30_000;
    private final Runnable widgetTick = new Runnable() {
        @Override
        public void run() {
            PelagicWidget.requestUpdate(PelagicPlaybackService.this);
            if (player != null && player.isPlaying()) main.postDelayed(this, WIDGET_TICK_MS);
        }
    };

    /** The player, for the widget (main thread only). */
    @Nullable
    ExoPlayer player() {
        return player;
    }

    @Override
    public void onCreate() {
        super.onCreate();

        DataSource.Factory http = new DefaultHttpDataSource.Factory()
            .setUserAgent("Pelagic")
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(20_000);
        // DefaultDataSource: http(s) through `http`, plus file:// for downloaded copies
        DataSource.Factory any = new DefaultDataSource.Factory(this, http);
        DataSource.Factory drive = new ResolvingDataSource.Factory(any, new ResolvingDataSource.Resolver() {
            @NonNull
            @Override
            public androidx.media3.datasource.DataSpec resolveDataSpec(@NonNull androidx.media3.datasource.DataSpec spec) throws IOException {
                String host = spec.uri.getHost();
                if (host == null || !host.endsWith("googleapis.com")) return spec;
                // Offline downloads (phase D): a stored copy of this Drive file plays from the phone
                File local = Offline.localFile(PelagicPlaybackService.this, spec.uri);
                if (local != null) return spec.withUri(Uri.fromFile(local));
                String token = DriveAuth.getToken(PelagicPlaybackService.this);
                if (token == null) throw new IOException("Not signed in to Google Drive");
                return spec.withAdditionalHeaders(Collections.singletonMap("Authorization", "Bearer " + token));
            }
        });

        player = new ExoPlayer.Builder(this)
            // KnownLengthDataSource: Drive sends no Content-Length; without the file size the Opus /
            // FLAC extractors can't seek and every seek would restart the track
            .setMediaSourceFactory(new DefaultMediaSourceFactory(new KnownLengthDataSource.Factory(drive)))
            .setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                .build(), /* handleAudioFocus= */ true)
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build();
        player.addListener(new Player.Listener() {
            @Override
            public void onPlayerError(@NonNull PlaybackException error) {
                handleError(error);
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                if (isPlaying) {
                    authRetries = 0;
                    skips = 0;
                }
            }

            @Override
            public void onMediaItemTransition(@Nullable MediaItem mediaItem, int reason) {
                updateDj();
            }

            @Override
            public void onTimelineChanged(@NonNull androidx.media3.common.Timeline timeline, int reason) {
                updateDj();
            }

            /* home screen widget: redraw on any change; remember where it is for Resume */
            @Override
            public void onEvents(@NonNull Player p, @NonNull Player.Events events) {
                PelagicWidget.requestUpdate(PelagicPlaybackService.this);
                if (events.containsAny(Player.EVENT_MEDIA_ITEM_TRANSITION, Player.EVENT_IS_PLAYING_CHANGED, Player.EVENT_POSITION_DISCONTINUITY)) {
                    saveResume();
                }
                main.removeCallbacks(widgetTick);
                if (p.isPlaying()) main.postDelayed(widgetTick, WIDGET_TICK_MS);
            }
        });
        instance = this;

        // tapping the media notification / lock-screen player brings the app to the front
        // (MainActivity is singleTask, so the running instance is reused)
        Intent open = new Intent(this, MainActivity.class)
            .setAction(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openApp = PendingIntent.getActivity(this, 0, open,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        session = new MediaSession.Builder(this, player)
            .setSessionActivity(openApp)
            .setCallback(new MediaSession.Callback() {
                // every controller (notification, lock screen, Bluetooth) may send "Skip session"
                @NonNull
                @Override
                public MediaSession.ConnectionResult onConnect(@NonNull MediaSession s, @NonNull MediaSession.ControllerInfo c) {
                    MediaSession.ConnectionResult r = MediaSession.Callback.super.onConnect(s, c);
                    if (!r.isAccepted) return r;
                    SessionCommands cmds = r.availableSessionCommands.buildUpon().add(SKIP_SESSION).build();
                    return MediaSession.ConnectionResult.accept(cmds, r.availablePlayerCommands);
                }

                @NonNull
                @Override
                public ListenableFuture<SessionResult> onCustomCommand(@NonNull MediaSession s, @NonNull MediaSession.ControllerInfo c, @NonNull SessionCommand command, @NonNull Bundle args) {
                    if (ACTION_SKIP_SESSION.equals(command.customAction)) {
                        skipSession();
                        return Futures.immediateFuture(new SessionResult(SessionResult.RESULT_SUCCESS));
                    }
                    return MediaSession.Callback.super.onCustomCommand(s, c, command, args);
                }

                // Controllers can't send playable URIs across; the web app puts the Drive URL in
                // requestMetadata.mediaUri and it is restored here.
                @NonNull
                @Override
                public ListenableFuture<List<MediaItem>> onAddMediaItems(@NonNull MediaSession s, @NonNull MediaSession.ControllerInfo c, @NonNull List<MediaItem> items) {
                    List<MediaItem> out = new ArrayList<>(items.size());
                    for (MediaItem item : items) {
                        Uri uri = item.requestMetadata.mediaUri;
                        out.add(uri == null ? item : item.buildUpon().setUri(uri).build());
                    }
                    return Futures.immediateFuture(out);
                }
            })
            // covers are Drive files too: load them with the same authorised requests
            .setBitmapLoader(new DataSourceBitmapLoader(
                MoreExecutors.listeningDecorator(Executors.newSingleThreadExecutor()), drive))
            .build();
    }

    @SuppressWarnings("deprecation") // CommandButton.Builder() / setIconResId: still fine on Media3 1.5
    private CommandButton skipButton() {
        if (skipButton == null) {
            skipButton = new CommandButton.Builder()
                .setSessionCommand(SKIP_SESSION)
                .setDisplayName("Skip session")
                .setIconResId(R.drawable.ic_dj)
                .build();
        }
        return skipButton;
    }

    @Nullable
    private static Bundle extrasOf(@Nullable MediaItem item) {
        return item == null ? null : item.mediaMetadata.extras;
    }

    /** DJ items: "Skip session" in the notification / lock screen, intros at the voice volume. */
    private void updateDj() {
        if (player == null || session == null) return;
        Bundle x = extrasOf(player.getCurrentMediaItem());
        boolean dj = x != null && x.getBoolean(EXTRA_DJ, false);
        boolean intro = dj && x.getBoolean(EXTRA_INTRO, false);
        player.setVolume(intro ? x.getFloat(EXTRA_VOLUME, 0.7f) : 1f);
        if (dj != djShown) {
            djShown = dj;
            session.setCustomLayout(dj ? ImmutableList.of(skipButton()) : ImmutableList.of());
        }
    }

    /** Straight to the next session's intro (like the DJ button in the app; no Undo). */
    private void skipSession() {
        if (player == null) return;
        int n = player.getMediaItemCount();
        for (int i = player.getCurrentMediaItemIndex() + 1; i < n; i++) {
            Bundle x = extrasOf(player.getMediaItemAt(i));
            if (x != null && x.getBoolean(EXTRA_INTRO, false)) {
                player.seekTo(i, 0);
                if (player.getPlaybackState() == Player.STATE_IDLE) player.prepare();
                player.play();
                return;
            }
        }
    }

    private void handleError(PlaybackException error) {
        Throwable cause = error.getCause();
        boolean unauthorized = cause instanceof HttpDataSource.InvalidResponseCodeException
            && ((HttpDataSource.InvalidResponseCodeException) cause).responseCode == 401;
        if (unauthorized && authRetries < 1) {
            authRetries++;
            DriveAuth.invalidate(this, null);
            player.prepare();
            player.play();
            return;
        }
        if (!unauthorized && skips < MAX_SKIPS && player.hasNextMediaItem()) {
            skips++;
            player.seekToNextMediaItem();
            player.prepare();
            player.play();
        }
        // otherwise stay stopped; the web UI shows the error
    }

    @Nullable
    @Override
    public MediaSession onGetSession(@NonNull MediaSession.ControllerInfo controllerInfo) {
        return session;
    }

    /** Swiped away from recents: keep playing if music is on, otherwise shut down. */
    @Override
    public void onTaskRemoved(@Nullable Intent rootIntent) {
        if (player == null || !player.getPlayWhenReady() || player.getMediaItemCount() == 0) {
            stopSelf();
        }
    }

    /** Where the player is, for the widget's Resume (the queue itself is saved by PelagicPlayerPlugin). */
    private void saveResume() {
        WidgetState.Now n = WidgetState.capture(player);
        if (n != null) WidgetState.savePosition(this, n);
    }

    @Override
    public void onDestroy() {
        main.removeCallbacks(widgetTick);
        if (player != null) saveResume();
        instance = null;
        PelagicWidget.requestUpdate(this);
        if (session != null) {
            session.release();
            session = null;
        }
        if (player != null) {
            player.release();
            player = null;
        }
        super.onDestroy();
    }
}
