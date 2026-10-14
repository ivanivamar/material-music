package com.ivan.pelagic;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.GoogleAuthUtil;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;

import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Native side of the Android app (step 7). JS: src/native/bridge.ts.
 *
 * Google sign-in: a WebView can't run Google's web OAuth flow, so the app asks Play services for a
 * Drive access token (AuthorizationClient). Play services remembers the grant and can mint a new
 * token silently whenever the old one expires — no refresh token is stored by the app.
 * The OAuth client is matched by package name + signing-key SHA-1 ("Pelagic Android" client in
 * Google Cloud), so no client ID appears here.
 */
@CapacitorPlugin(name = "PelagicNative")
public class PelagicNativePlugin extends Plugin {

    private static final String DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private ActivityResultLauncher<IntentSenderRequest> consentLauncher;
    private PluginCall consentCall;

    @Override
    public void load() {
        // Registered while the activity is being created (required by the Activity Result API).
        consentLauncher = getActivity().registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(),
            result -> {
                PluginCall call = consentCall;
                consentCall = null;
                if (call == null) return;
                Intent data = result.getData();
                if (result.getResultCode() != Activity.RESULT_OK || data == null) {
                    call.reject("Sign-in was cancelled.", "cancelled");
                    return;
                }
                try {
                    AuthorizationResult auth = Identity.getAuthorizationClient(getActivity()).getAuthorizationResultFromIntent(data);
                    resolveToken(call, auth);
                } catch (ApiException e) {
                    call.reject("Google sign-in failed (" + e.getStatusCode() + ").", "failed", e);
                }
            }
        );
    }

    /** { interactive: boolean } → { accessToken } */
    @PluginMethod
    public void authorize(PluginCall call) {
        boolean interactive = Boolean.TRUE.equals(call.getBoolean("interactive", false));
        AuthorizationRequest request = AuthorizationRequest.builder()
            .setRequestedScopes(Collections.singletonList(new Scope(DRIVE_SCOPE)))
            .build();
        Identity.getAuthorizationClient(getActivity())
            .authorize(request)
            .addOnSuccessListener(result -> {
                if (!result.hasResolution()) {
                    resolveToken(call, result);
                    return;
                }
                PendingIntent pending = result.getPendingIntent();
                if (!interactive || pending == null) {
                    call.reject("Google needs you to sign in again.", "needs_consent");
                    return;
                }
                if (consentCall != null) consentCall.reject("Replaced by a newer sign-in.", "cancelled");
                consentCall = call;
                consentLauncher.launch(new IntentSenderRequest.Builder(pending.getIntentSender()).build());
            })
            .addOnFailureListener(e -> call.reject(describe(e), "failed", e));
    }

    /** { token } — forget a cached token so the next authorize() returns a fresh one. */
    @PluginMethod
    public void clearToken(PluginCall call) {
        String token = call.getString("token");
        if (token == null || token.isEmpty()) {
            call.resolve();
            return;
        }
        io.execute(() -> {
            try {
                GoogleAuthUtil.clearToken(getContext(), token);
            } catch (Exception ignored) {
                // nothing cached / Play services busy: the token will simply expire
            }
            call.resolve();
        });
    }

    /** → { versionName, versionCode } */
    @PluginMethod
    public void appInfo(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
            JSObject out = new JSObject();
            out.put("versionName", info.versionName);
            out.put("versionCode", code);
            call.resolve(out);
        } catch (Exception e) {
            call.reject("Could not read the app version.", e);
        }
    }

    /** { url } — open in the browser (e.g. the APK of an update). */
    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null) {
            call.reject("No URL.");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("No app can open this link.", e);
        }
    }

    private void resolveToken(PluginCall call, AuthorizationResult result) {
        String token = result.getAccessToken();
        if (token == null || token.isEmpty()) {
            call.reject("Google didn't return a Drive token.", "failed");
            return;
        }
        if (!result.getGrantedScopes().contains(DRIVE_SCOPE)) {
            call.reject("Pelagic needs access to Google Drive to read your library. Allow Drive when Google asks.", "no_drive");
            return;
        }
        JSObject out = new JSObject();
        out.put("accessToken", token);
        call.resolve(out);
    }

    private static String describe(Exception e) {
        if (e instanceof ApiException) {
            int code = ((ApiException) e).getStatusCode();
            // 10 = DEVELOPER_ERROR: the Android OAuth client (package + SHA-1) is missing or wrong
            if (code == 10) return "Google sign-in isn't set up for this build (Android OAuth client / SHA-1).";
            if (code == 7) return "No connection to Google. Check the network and try again.";
            return "Google sign-in failed (" + code + ").";
        }
        return e.getMessage() != null ? e.getMessage() : "Google sign-in failed.";
    }

    @Override
    protected void handleOnDestroy() {
        io.shutdown();
    }
}
