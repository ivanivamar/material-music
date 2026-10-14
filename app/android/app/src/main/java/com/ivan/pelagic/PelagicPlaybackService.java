package com.ivan.pelagic;

import android.content.Intent;
import android.net.Uri;

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
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.HttpDataSource;
import androidx.media3.datasource.ResolvingDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.common.util.concurrent.MoreExecutors;

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
 * OAuth header from DriveAuth. A 401 drops the token and retries once with a fresh one; any other
 * failure skips to the next track (at most 3 in a row), like the web player.
 */
@UnstableApi
public class PelagicPlaybackService extends MediaSessionService {

    private static final int MAX_SKIPS = 3;

    private ExoPlayer player;
    private MediaSession session;
    private int authRetries = 0;
    private int skips = 0;

    @Override
    public void onCreate() {
        super.onCreate();

        DataSource.Factory http = new DefaultHttpDataSource.Factory()
            .setUserAgent("Pelagic")
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(20_000);
        DataSource.Factory drive = new ResolvingDataSource.Factory(http, new ResolvingDataSource.Resolver() {
            @NonNull
            @Override
            public androidx.media3.datasource.DataSpec resolveDataSpec(@NonNull androidx.media3.datasource.DataSpec spec) throws IOException {
                String host = spec.uri.getHost();
                if (host == null || !host.endsWith("googleapis.com")) return spec;
                String token = DriveAuth.getToken(PelagicPlaybackService.this);
                if (token == null) throw new IOException("Not signed in to Google Drive");
                return spec.withAdditionalHeaders(Collections.singletonMap("Authorization", "Bearer " + token));
            }
        });

        player = new ExoPlayer.Builder(this)
            .setMediaSourceFactory(new DefaultMediaSourceFactory(drive))
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
        });

        session = new MediaSession.Builder(this, player)
            .setCallback(new MediaSession.Callback() {
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

    @Override
    public void onDestroy() {
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
