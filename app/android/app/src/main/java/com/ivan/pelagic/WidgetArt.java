package com.ivan.pelagic;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.BlurMaskFilter;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.net.Uri;
import android.util.LruCache;

import androidx.annotation.Nullable;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;

/**
 * Pictures for the home screen widget (Material 3 Expressive redesign, WidgetMaterial.dc.html).
 * RemoteViews can't blur, mask or draw dynamic M3 shapes/gradients, so non-text visuals are drawn
 * here into bitmaps:
 *
 *  - background(): album-tinted surface s.bg, blurred album light top-left, radial scrim from
 *    bottom-right, dot grid (w >= 176dp) and ring (w >= 320dp, h >= 128dp), cover glow, full-bleed
 *    1×1 cover, "Up next" card surface (4×3 / 4×4), dual idle cards (2×2 / 4×1), and the 1.5dp rim.
 *  - cover(), resumePillArt(), pick(), progressBar(), playButton(), shuffleButton(), pillButton(),
 *    knobBitmap(): M3 Expressive rounded covers, quick-start cards, 4dp progress bar, morphing
 *    play/pause & shuffle buttons, and the 8-lobe scalloped DJ knob.
 *
 * Covers are Drive files: a downloaded copy (Offline) first, then a small disk cache, then Drive with
 * the account's token (DriveAuth). Runs on PelagicWidget.BG only.
 */
final class WidgetArt {
    static final float BRAND_HUE = 38f;
    static final float DJ_HUE = 290f;

    /** DJ card palette (WidgetMaterial.dc.html: oklch(0.30 0.07 290) etc.) */
    static final int DJ_CARD_BG = oklch(0.30, 0.07, 290, 1.0);
    static final int DJ_CARD_RIM = oklch(0.60, 0.10, 290, 0.45);
    static final int DJ_CARD_FG = oklch(0.95, 0.02, 290, 1.0);
    static final int DJ_CARD_SUB = oklch(0.82, 0.04, 290, 1.0);
    static final int DJ_KNOB = oklch(0.84, 0.09, 290, 1.0);

    private static final int MAX_DISK = 60;
    private static final LruCache<String, Bitmap> art = new LruCache<>(10);
    private static final LruCache<String, Bitmap> bases = new LruCache<>(6);
    /** covers that couldn't be fetched lately (offline…): not retried on every redraw */
    private static final LruCache<String, Long> failed = new LruCache<>(32);
    private static final long RETRY_MS = 60_000;

    private WidgetArt() {}

    /* ── Loading covers ──────────────────────────────── */

    /** A cover / artwork URI (Drive alt=media URL or file://) decoded to at most ~600px; null if unavailable. */
    @Nullable
    static Bitmap load(Context ctx, @Nullable String uri) {
        if (uri == null || uri.isEmpty()) return null;
        Bitmap hit = art.get(uri);
        if (hit != null) return hit;
        Bitmap bm = null;
        try {
            Uri u = Uri.parse(uri);
            if ("file".equals(u.getScheme()) && u.getPath() != null) {
                bm = decode(new File(u.getPath()));
            } else {
                File local = Offline.localFile(ctx, u);
                if (local != null) bm = decode(local);
                if (bm == null) {
                    File cached = new File(cacheDir(ctx), sha1(uri));
                    Long lastFail = failed.get(uri);
                    boolean wait = lastFail != null && System.currentTimeMillis() - lastFail < RETRY_MS;
                    if (!cached.isFile() && !wait && "https".equals(u.getScheme())) {
                        download(ctx, uri, cached);
                        if (!cached.isFile()) failed.put(uri, System.currentTimeMillis());
                    }
                    if (cached.isFile()) {
                        bm = decode(cached);
                        //noinspection ResultOfMethodCallIgnored
                        cached.setLastModified(System.currentTimeMillis());
                    }
                }
            }
        } catch (Exception e) {
            failed.put(uri, System.currentTimeMillis());
            bm = null;
        }
        if (bm != null) art.put(uri, bm);
        return bm;
    }

    private static File cacheDir(Context ctx) {
        File d = new File(ctx.getCacheDir(), "widget-art");
        //noinspection ResultOfMethodCallIgnored
        d.mkdirs();
        return d;
    }

    @Nullable
    private static Bitmap decode(File f) {
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(f.getPath(), o);
        if (o.outWidth <= 0) return null;
        int sample = 1;
        while (Math.max(o.outWidth, o.outHeight) / (sample * 2) >= 600) sample *= 2;
        BitmapFactory.Options d = new BitmapFactory.Options();
        d.inSampleSize = sample;
        return BitmapFactory.decodeFile(f.getPath(), d);
    }

    /** Drive only (googleapis.com, with the token); one retry with a fresh token after a 401. */
    private static void download(Context ctx, String uri, File to) throws Exception {
        String host = Uri.parse(uri).getHost();
        if (host == null || !host.endsWith("googleapis.com")) return;
        for (int attempt = 0; attempt < 2; attempt++) {
            String token = DriveAuth.getToken(ctx);
            if (token == null) return;
            HttpURLConnection c = (HttpURLConnection) new URL(uri).openConnection();
            c.setConnectTimeout(10_000);
            c.setReadTimeout(15_000);
            c.setRequestProperty("Authorization", "Bearer " + token);
            try {
                int code = c.getResponseCode();
                if (code == 401) {
                    DriveAuth.invalidate(ctx, token);
                    continue;
                }
                if (code != 200) return;
                File part = new File(to.getPath() + ".part");
                try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(part)) {
                    byte[] buf = new byte[16384];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                }
                //noinspection ResultOfMethodCallIgnored
                part.renameTo(to);
                prune(to.getParentFile());
                return;
            } finally {
                c.disconnect();
            }
        }
    }

    private static void prune(@Nullable File dir) {
        File[] files = dir == null ? null : dir.listFiles();
        if (files == null || files.length <= MAX_DISK) return;
        Arrays.sort(files, (a, b) -> Long.compare(a.lastModified(), b.lastModified()));
        for (int i = 0; i < files.length - MAX_DISK; i++) //noinspection ResultOfMethodCallIgnored
            files[i].delete();
    }

    private static String sha1(String s) throws Exception {
        byte[] d = MessageDigest.getInstance("SHA-1").digest(s.getBytes("UTF-8"));
        StringBuilder b = new StringBuilder();
        for (byte x : d) b.append(String.format("%02x", x));
        return b.toString();
    }

    /* ── Colour scheme (WidgetMaterial.dc.html) ──────── */

    static final class Scheme {
        final float hue, hc;
        final int bg, base, base6, high, on, onVar, primary, onPrimary, track, sec, rim, rim2, glow, dot, ringLine;

        Scheme(float h, float hc) {
            this.hue = h;
            this.hc = hc;
            bg = oklch(0.155, 0.014 * hc, h, 1.0);
            base = oklch(0.155, 0.014 * hc, h, 1.0);
            base6 = oklch(0.155, 0.014 * hc, h, 0.6);
            high = oklch(0.25, 0.035 * hc, h, 0.72);
            on = oklch(0.95, 0.015 * hc, h, 1.0);
            onVar = oklch(0.80, 0.03 * hc, h, 1.0);
            primary = oklch(0.84, 0.09 * hc, h, 1.0);
            onPrimary = oklch(0.25, 0.06 * hc, h, 1.0);
            track = oklch(0.40, 0.05 * hc, h, 1.0);
            sec = oklch(0.40, 0.06 * hc, h, 1.0);
            rim = oklch(0.62, 0.09 * hc, h, 0.55);
            rim2 = oklch(0.60, 0.07 * hc, h, 0.28);
            glow = oklch(0.55, 0.12 * hc, h, 0.9);
            dot = oklch(0.84, 0.09 * hc, h, 0.38);
            ringLine = oklch(0.84, 0.09 * hc, h, 0.14);
        }

        static Scheme of(float h) {
            return new Scheme(h, 1f);
        }

        /** Cover scheme: white/grey/black covers get near-white accents (hc = 0), missing cover gets coral (38). */
        static Scheme fromArt(@Nullable Bitmap bm) {
            if (bm == null) return new Scheme(BRAND_HUE, 1f);
            Bitmap s = Bitmap.createScaledBitmap(bm, 8, 8, true);
            double a = 0, b = 0, cSum = 0;
            int colorful = 0;
            for (int y = 0; y < 8; y++) {
                for (int x = 0; x < 8; x++) {
                    double[] lab = oklab(s.getPixel(x, y));
                    double c = Math.hypot(lab[1], lab[2]);
                    cSum += c;
                    if (c > 0.032) colorful++;
                    a += lab[1] * c;
                    b += lab[2] * c;
                }
            }
            if (s != bm) s.recycle();
            double avgC = cSum / 64.0;
            if (avgC < 0.018 || colorful < 6 || Math.abs(a) + Math.abs(b) < 1e-9) {
                return new Scheme(40f, 0f);
            }
            double h = Math.toDegrees(Math.atan2(b, a));
            return new Scheme((float) (h < 0 ? h + 360 : h), 1f);
        }
    }

    private static double[] oklab(int argb) {
        double r = lin(Color.red(argb) / 255.0), g = lin(Color.green(argb) / 255.0), bl = lin(Color.blue(argb) / 255.0);
        double l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * bl);
        double m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * bl);
        double s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * bl);
        return new double[] {
            0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
        };
    }

    private static double lin(double c) {
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }

    private static int enc(double c) {
        c = Math.max(0, Math.min(1, c));
        double v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
        return (int) Math.round(v * 255);
    }

    /** oklch(L C h / alpha) → ARGB. */
    static int oklch(double L, double C, double hDeg, double alpha) {
        double h = Math.toRadians(hDeg);
        double a = C * Math.cos(h), b = C * Math.sin(h);
        double l = L + 0.3963377774 * a + 0.2158037573 * b;
        double m = L - 0.1055613458 * a - 0.0638541728 * b;
        double s = L - 0.0894841775 * a - 1.2914855480 * b;
        l = l * l * l;
        m = m * m * m;
        s = s * s * s;
        double r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
        double g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
        double bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
        return Color.argb((int) Math.round(alpha * 255), enc(r), enc(g), enc(bl));
    }

    /* ── Background ──────────────────────────────────── */

    static final class Bg {
        float w, h;
        float scale;
        float radius = 28;
        Scheme scheme;
        @Nullable Bitmap light;
        float lightAlpha;
        @Nullable Bitmap full;
        float fullAlpha = 1;
        /** cover glow under a cover at (gx, gy) of size gs (dp), corner radius gr (dp) */
        float gx, gy, gs, gr = 16;
        /** Up next surface card (mPlayer + hasUp) */
        boolean hasUp;
        /** iDual surface cards: 0 = none, 1 = column (2×2+), 2 = row (3×1 / 4×1) */
        int dualMode;

        String key() {
            return w + "x" + h + "@" + scale + "/" + radius + "/" + scheme.hue + ":" + scheme.hc + "/"
                + System.identityHashCode(light) + ":" + lightAlpha + "/"
                + System.identityHashCode(full) + ":" + fullAlpha + "/"
                + gx + "," + gy + "," + gs + "," + gr + "/" + hasUp + "/" + dualMode;
        }
    }

    static Bitmap background(Bg s) {
        int W = Math.max(1, Math.round(s.w * s.scale)), H = Math.max(1, Math.round(s.h * s.scale));
        String key = s.key();
        Bitmap base = bases.get(key);
        if (base == null) {
            base = drawBase(s, W, H);
            bases.put(key, base);
        }
        return base;
    }

    private static Bitmap drawBase(Bg s, int W, int H) {
        float k = s.scale;
        Scheme sc = s.scheme;
        Bitmap full = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(full);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);

        // 1. base surface (s.bg)
        c.drawColor(sc.bg);

        // 2. album light: cover blurred 48, saturation ×1.3, at (−30%, −60%) 110% × 160%
        if (s.light != null && s.lightAlpha > 0) drawLight(c, s.light, W, H, k, s.lightAlpha);

        // 3. radial gradient scrim: 120% × 110% at 100% 100%, s.base 25%, s.base6 60%, transparent 100%
        Paint scrim = new Paint(Paint.ANTI_ALIAS_FLAG);
        RadialGradient rg = new RadialGradient(0, 0, 1f,
            new int[] { sc.base, sc.base, sc.base6, sc.base & 0x00FFFFFF },
            new float[] { 0f, 0.25f, 0.6f, 1f }, Shader.TileMode.CLAMP);
        Matrix m = new Matrix();
        m.setScale(1.2f * W, 1.1f * H);
        m.postTranslate(W, H);
        rg.setLocalMatrix(m);
        scrim.setShader(rg);
        c.drawRect(0, 0, W, H, scrim);

        // 4. decorative dot grid (W >= 176dp): right -24dp, top -28dp, 170×140dp, 12dp grid, 1.2dp radius, closest-side mask
        if (s.w >= 170) {
            drawDots(c, W, k, sc.dot);
        }

        // 5. decorative ring (W >= 320dp && H >= 128dp): left -120dp, bottom -150dp, 300×300dp, 1.5dp inset stroke
        if (s.w >= 320 && s.h >= 128) {
            Paint ringP = new Paint(Paint.ANTI_ALIAS_FLAG);
            ringP.setStyle(Paint.Style.STROKE);
            ringP.setStrokeWidth(1.5f * k);
            ringP.setColor(sc.ringLine);
            float cx = (-120f + 150f) * k;
            float cy = H + (150f - 150f) * k;
            c.drawCircle(cx, cy, (150f - 0.75f) * k, ringP);
        }

        // 6. cover glow (0 14dp 26dp -12dp s.glow)
        if (s.gs > 0) {
            Paint g = new Paint(Paint.ANTI_ALIAS_FLAG);
            g.setColor(sc.glow);
            g.setMaskFilter(new BlurMaskFilter(blurRadius(13 * k), BlurMaskFilter.Blur.NORMAL));
            RectF r = new RectF((s.gx + 12) * k, (s.gy + 26) * k, (s.gx + s.gs - 12) * k, (s.gy + s.gs + 2) * k);
            c.drawRoundRect(r, s.gr * k, s.gr * k, g);
        }

        // 7. full-bleed cover (1×1 mTiny)
        if (s.full != null) {
            p.setAlpha(Math.round(255 * s.fullAlpha));
            c.drawBitmap(s.full, coverCrop(s.full, W, H), new RectF(0, 0, W, H), p);
            p.setAlpha(255);
        }

        // 8. "Up next" card surface (4×3 / 4×4): left 8dp, right 8dp, top 176dp, bottom 8dp, radius 20dp
        if (s.hasUp && H > 184 * k) {
            drawSurfaceCard(c, new RectF(8 * k, 176 * k, W - 8 * k, H - 8 * k), 20 * k, sc.high, sc.rim2, k);
        }

        // 9. iDual cards (Resume + DJ)
        if (s.dualMode == 1) {
            // column (2×2+): two stacked cards, 8dp padding and 8dp gap
            float ch = (H - 24 * k) / 2f;
            drawSurfaceCard(c, new RectF(8 * k, 8 * k, W - 8 * k, 8 * k + ch), 20 * k, sc.high, sc.rim2, k);
            drawSurfaceCard(c, new RectF(8 * k, 16 * k + ch, W - 8 * k, H - 8 * k), 20 * k, DJ_CARD_BG, DJ_CARD_RIM, k);
        } else if (s.dualMode == 2) {
            // row (3×1 / 4×1): two side-by-side cards, 8dp padding and 8dp gap
            float cw = (W - 24 * k) / 2f;
            drawSurfaceCard(c, new RectF(8 * k, 8 * k, 8 * k + cw, H - 8 * k), 20 * k, sc.high, sc.rim2, k);
            drawSurfaceCard(c, new RectF(16 * k + cw, 8 * k, W - 8 * k, H - 8 * k), 20 * k, DJ_CARD_BG, DJ_CARD_RIM, k);
        }

        // 10. outer rim: inset 0 0 0 1.5dp s.rim
        float r = s.radius * k;
        Paint rim = new Paint(Paint.ANTI_ALIAS_FLAG);
        rim.setStyle(Paint.Style.STROKE);
        rim.setStrokeWidth(1.5f * k);
        rim.setColor(sc.rim);
        float inset = 0.75f * k;
        c.drawRoundRect(new RectF(inset, inset, W - inset, H - inset), r - inset, r - inset, rim);

        Bitmap out = rounded(full, r);
        full.recycle();
        out.setDensity(densityOf(k));
        return out;
    }

    private static void drawSurfaceCard(Canvas c, RectF rect, float r, int fill, int strokeColor, float k) {
        Paint fp = new Paint(Paint.ANTI_ALIAS_FLAG);
        fp.setColor(fill);
        c.drawRoundRect(rect, r, r, fp);
        Paint sp = new Paint(Paint.ANTI_ALIAS_FLAG);
        sp.setStyle(Paint.Style.STROKE);
        sp.setStrokeWidth(k);
        sp.setColor(strokeColor);
        float half = k / 2f;
        c.drawRoundRect(new RectF(rect.left + half, rect.top + half, rect.right - half, rect.bottom - half), r - half, r - half, sp);
    }

    private static void drawDots(Canvas c, int W, float k, int dotColor) {
        float boxW = 170f * k, boxH = 140f * k;
        float left = W + 24f * k - boxW, top = -28f * k;
        float cx = left + boxW * 0.5f, cy = top + boxH * 0.5f;
        float rx = boxW * 0.5f, ry = boxH * 0.5f;
        float step = 12f * k;
        float dotR = 1.25f * k;
        int baseAlpha = Color.alpha(dotColor);
        int rgb = dotColor & 0x00FFFFFF;
        Paint dp = new Paint(Paint.ANTI_ALIAS_FLAG);
        for (float y = top + step * 0.5f; y < top + boxH; y += step) {
            if (y + dotR < 0) continue;
            for (float x = left + step * 0.5f; x < left + boxW; x += step) {
                if (x - dotR > W) continue;
                float dx = (x - cx) / rx, dy = (y - cy) / ry;
                float dist = (float) Math.hypot(dx, dy);
                if (dist >= 1f) continue;
                float mask = dist <= 0.4f ? 1f : (1f - dist) / 0.6f;
                int a = Math.round(baseAlpha * mask);
                if (a <= 2) continue;
                dp.setColor((a << 24) | rgb);
                c.drawCircle(x, y, dotR, dp);
            }
        }
    }

    /** CSS blur(48px) ≈ a gaussian σ 48: blur a small copy (with a transparent margin so the edges fade), then scale it up. */
    private static void drawLight(Canvas c, Bitmap src, int W, int H, float k, float alpha) {
        float L = -0.3f * W, T = -0.6f * H, RW = 1.1f * W, RH = 1.6f * H;
        float f = 48 * k / 6f;
        int sw = Math.max(2, Math.round(RW / f)), sh = Math.max(2, Math.round(RH / f)), mg = 18;
        Bitmap small = Bitmap.createBitmap(sw + 2 * mg, sh + 2 * mg, Bitmap.Config.ARGB_8888);
        Canvas sc = new Canvas(small);
        Paint fp = new Paint(Paint.FILTER_BITMAP_FLAG);
        sc.drawBitmap(src, coverCrop(src, sw, sh), new RectF(mg, mg, mg + sw, mg + sh), fp);
        blur(small, 5, 3);
        Paint p = new Paint(Paint.FILTER_BITMAP_FLAG | Paint.ANTI_ALIAS_FLAG);
        ColorMatrix cm = new ColorMatrix();
        cm.setSaturation(1.3f);
        p.setColorFilter(new ColorMatrixColorFilter(cm));
        p.setAlpha(Math.round(alpha * 255));
        c.drawBitmap(small, null, new RectF(L - mg * f, T - mg * f, L + RW + mg * f, T + RH + mg * f), p);
        small.recycle();
    }

    /** Box blur, `passes` times (≈ gaussian), on premultiplied values so transparent edges stay clean. */
    private static void blur(Bitmap bm, int radius, int passes) {
        int w = bm.getWidth(), h = bm.getHeight(), n = w * h;
        int[] px = new int[n];
        bm.getPixels(px, 0, w, 0, 0, w, h);
        float[][] ch = new float[4][n];
        for (int i = 0; i < n; i++) {
            int c = px[i];
            float a = (c >>> 24) / 255f;
            ch[0][i] = a;
            ch[1][i] = ((c >> 16) & 0xFF) * a;
            ch[2][i] = ((c >> 8) & 0xFF) * a;
            ch[3][i] = (c & 0xFF) * a;
        }
        float[] tmp = new float[Math.max(w, h)];
        for (float[] v : ch) {
            for (int pass = 0; pass < passes; pass++) {
                for (int y = 0; y < h; y++) boxLine(v, y * w, 1, w, radius, tmp);
                for (int x = 0; x < w; x++) boxLine(v, x, w, h, radius, tmp);
            }
        }
        for (int i = 0; i < n; i++) {
            float a = ch[0][i];
            if (a <= 0.002f) {
                px[i] = 0;
                continue;
            }
            int r = clamp255(ch[1][i] / a), g = clamp255(ch[2][i] / a), b = clamp255(ch[3][i] / a);
            px[i] = (clamp255(a * 255) << 24) | (r << 16) | (g << 8) | b;
        }
        bm.setPixels(px, 0, w, 0, 0, w, h);
    }

    private static void boxLine(float[] v, int start, int stride, int len, int r, float[] tmp) {
        float sum = 0;
        float inv = 1f / (2 * r + 1);
        for (int i = 0; i <= r && i < len; i++) sum += v[start + i * stride];
        for (int i = 0; i < len; i++) {
            tmp[i] = sum * inv;
            int add = i + r + 1, sub = i - r;
            if (add < len) sum += v[start + add * stride];
            if (sub >= 0) sum -= v[start + sub * stride];
        }
        for (int i = 0; i < len; i++) v[start + i * stride] = tmp[i];
    }

    private static int clamp255(float x) {
        return Math.max(0, Math.min(255, Math.round(x)));
    }

    /* ── Covers, buttons, progress bar, picks, DJ knob ─ */

    /** A cover: size dp, corner radius dp, 1dp subtle ring (0.10), opacity; a warm dark square when there's no art. */
    static Bitmap cover(@Nullable Bitmap src, float sizeDp, float radiusDp, float alpha, float k) {
        int S = Math.max(1, Math.round(sizeDp * k));
        Bitmap out = Bitmap.createBitmap(S, S, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(out);
        float r = radiusDp * k;
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        RectF all = new RectF(0, 0, S, S);
        if (src != null) {
            Bitmap sq = Bitmap.createBitmap(S, S, Bitmap.Config.ARGB_8888);
            new Canvas(sq).drawBitmap(src, coverCrop(src, S, S), all, new Paint(Paint.FILTER_BITMAP_FLAG));
            p.setShader(new BitmapShader(sq, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP));
            p.setAlpha(Math.round(alpha * 255));
            c.drawRoundRect(all, r, r, p);
            p.setShader(null);
            p.setAlpha(255);
            sq.recycle();
        } else {
            p.setColor(oklch(0.22, 0.015, BRAND_HUE, 1.0));
            c.drawRoundRect(all, r, r, p);
        }
        Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        ring.setStyle(Paint.Style.STROKE);
        ring.setStrokeWidth(k);
        ring.setColor(0x1AFFFFFF);
        c.drawRoundRect(new RectF(k / 2, k / 2, S - k / 2, S - k / 2), r - k / 2, r - k / 2, ring);
        out.setDensity(densityOf(k));
        return out;
    }

    /** 2×1 idle pill art (iPill): 56dp cover (radius 16dp) with a 28dp circular coral play badge at bottom-right. */
    static Bitmap resumePillArt(@Nullable Bitmap src, Scheme s, float k) {
        int W = Math.max(1, Math.round(60 * k)), S = Math.max(1, Math.round(56 * k));
        Bitmap out = Bitmap.createBitmap(W, W, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(out);
        Bitmap cov = cover(src, 56, 16, 1f, k);
        c.drawBitmap(cov, 0, 0, null);
        cov.recycle();

        float cx = 46 * k, cy = 46 * k;
        Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        ring.setColor(s.bg);
        c.drawCircle(cx, cy, 17 * k, ring);

        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(s.primary);
        c.drawCircle(cx, cy, 14 * k, bg);

        drawPlayPauseGlyph(c, cx, cy, 18 * k, s.onPrimary, false);
        out.setDensity(densityOf(k));
        return out;
    }

    /** Play / pause button bitmap: rounded rect (radiusDp) in `bg` with centered play/pause glyph in `fg`. */
    static Bitmap playButton(float wDp, float hDp, float radiusDp, float iconDp, int bg, int fg, boolean playing, float k) {
        int W = Math.max(1, Math.round(wDp * k)), H = Math.max(1, Math.round(hDp * k));
        Bitmap out = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(out);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(bg);
        float r = radiusDp * k;
        c.drawRoundRect(new RectF(0, 0, W, H), r, r, p);
        drawPlayPauseGlyph(c, W * 0.5f, H * 0.5f, iconDp * k, fg, playing);
        out.setDensity(densityOf(k));
        return out;
    }

    private static void drawPlayPauseGlyph(Canvas c, float cx, float cy, float sizePx, int color, boolean pause) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(color);
        p.setStyle(Paint.Style.FILL);
        float u = sizePx / 24f;
        if (pause) {
            float bw = 4f * u, bh = 14f * u, br = 2f * u;
            c.drawRoundRect(new RectF(cx - 4f * u - bw * 0.5f, cy - bh * 0.5f, cx - 4f * u + bw * 0.5f, cy + bh * 0.5f), br, br, p);
            c.drawRoundRect(new RectF(cx + 4f * u - bw * 0.5f, cy - bh * 0.5f, cx + 4f * u + bw * 0.5f, cy + bh * 0.5f), br, br, p);
        } else {
            // Material Symbols Rounded play_arrow (filled, 24×24 viewport)
            Path path = new Path();
            float ox = cx - 12f * u, oy = cy - 12f * u;
            path.moveTo(ox + 8f * u, oy + 6.82f * u);
            path.lineTo(ox + 8f * u, oy + 17.18f * u);
            path.cubicTo(ox + 8f * u, oy + 17.97f * u, ox + 8.87f * u, oy + 18.45f * u, ox + 9.54f * u, oy + 18.02f * u);
            path.lineTo(ox + 17.68f * u, oy + 12.84f * u);
            path.cubicTo(ox + 18.30f * u, oy + 12.45f * u, ox + 18.30f * u, oy + 11.55f * u, ox + 17.68f * u, oy + 11.15f * u);
            path.lineTo(ox + 9.54f * u, oy + 5.98f * u);
            path.cubicTo(ox + 8.87f * u, oy + 5.55f * u, ox + 8f * u, oy + 6.03f * u, ox + 8f * u, oy + 6.82f * u);
            path.close();
            c.drawPath(path, p);
        }
    }

    /** Shuffle toggle (40×40dp): when active, radius 12dp in `s.sec` + `s.primary` icon; when off, transparent + `s.on` icon. */
    static Bitmap shuffleButton(boolean active, boolean enabled, Scheme s, float k) {
        int S = Math.max(1, Math.round(40 * k));
        Bitmap out = Bitmap.createBitmap(S, S, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(out);
        if (active && enabled) {
            Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
            bg.setColor(s.sec);
            float r = 12 * k;
            c.drawRoundRect(new RectF(0, 0, S, S), r, r, bg);
        }
        int fg = !enabled ? (s.onVar & 0x66FFFFFF) : active ? s.primary : s.on;
        drawShuffleGlyph(c, S * 0.5f, S * 0.5f, 20 * k, fg);
        out.setDensity(densityOf(k));
        return out;
    }

    private static void drawShuffleGlyph(Canvas c, float cx, float cy, float sizePx, int color) {
        float u = sizePx / 24f;
        float ox = cx - 12f * u, oy = cy - 12f * u;
        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setColor(color);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(2f * u);
        stroke.setStrokeCap(Paint.Cap.ROUND);
        stroke.setStrokeJoin(Paint.Join.ROUND);

        // main diagonal bottom-left to top-right
        c.drawLine(ox + 5.4f * u, oy + 18.6f * u, ox + 18.5f * u, oy + 5.5f * u, stroke);
        // top-left to center-left
        c.drawLine(ox + 5.4f * u, oy + 5.4f * u, ox + 9.8f * u, oy + 9.8f * u, stroke);
        // center-right to bottom-right
        c.drawLine(ox + 14.2f * u, oy + 14.2f * u, ox + 18.5f * u, oy + 18.5f * u, stroke);
        // top-right arrowhead
        Path p1 = new Path();
        p1.moveTo(ox + 15.2f * u, oy + 5f * u);
        p1.lineTo(ox + 19f * u, oy + 5f * u);
        p1.lineTo(ox + 19f * u, oy + 8.8f * u);
        c.drawPath(p1, stroke);
        // bottom-right arrowhead
        Path p2 = new Path();
        p2.moveTo(ox + 15.2f * u, oy + 19f * u);
        p2.lineTo(ox + 19f * u, oy + 19f * u);
        p2.lineTo(ox + 19f * u, oy + 15.2f * u);
        c.drawPath(p2, stroke);
    }

    /** 4dp M3 progress bar: 2dp rounded track in `trackColor`, 2dp rounded fill in `fillColor`. */
    static Bitmap progressBar(float widthDp, float frac, int trackColor, int fillColor, float k) {
        int W = Math.max(1, Math.round(widthDp * k)), H = Math.max(1, Math.round(4 * k));
        Bitmap out = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(out);
        float r = H * 0.5f;
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(trackColor);
        c.drawRoundRect(new RectF(0, 0, W, H), r, r, p);
        float fw = W * Math.max(0f, Math.min(1f, frac));
        if (fw > 0.5f) {
            p.setColor(fillColor);
            c.drawRoundRect(new RectF(0, 0, Math.max(H, fw), H), r, r, p);
        }
        out.setDensity(densityOf(k));
        return out;
    }

    /** Full-width pill background (e.g. "Shuffle library" 56dp button on iGrid). */
    static Bitmap pillButton(float wDp, float hDp, int bg, float k) {
        int W = Math.max(1, Math.round(wDp * k)), H = Math.max(1, Math.round(hDp * k));
        Bitmap out = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(out);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(bg);
        float r = H * 0.5f;
        c.drawRoundRect(new RectF(0, 0, W, H), r, r, p);
        out.setDensity(densityOf(k));
        return out;
    }

    /** Scalloped 8-lobe DJ knob bitmap (16dp in mPlayer, 40dp in iDual). */
    static Bitmap knobBitmap(float sizeDp, int color, float k) {
        int S = Math.max(1, Math.round(sizeDp * k));
        Bitmap out = Bitmap.createBitmap(S, S, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(out);
        drawKnob(c, S * 0.5f, S * 0.5f, S, color);
        out.setDensity(densityOf(k));
        return out;
    }

    /** Draw the 8-lobe scalloped DJ knob (`knobPath(8, 0.08, 48)` rotated -55° with indicator cutout). */
    private static void drawKnob(Canvas c, float cx, float cy, float sizePx, int color) {
        Path p = new Path();
        p.setFillType(Path.FillType.EVEN_ODD);
        int steps = 120;
        for (int i = 0; i <= steps; i++) {
            double t = (i / (double) steps) * Math.PI * 2.0;
            double r = 48.0 * (1.0 - 0.08 + 0.08 * Math.cos(8.0 * t));
            float x = (float) (50.0 + Math.sin(t) * r);
            float y = (float) (50.0 - Math.cos(t) * r);
            if (i == 0) p.moveTo(x, y);
            else p.lineTo(x, y);
        }
        p.close();
        p.addRoundRect(new RectF(43f, 12f, 57f, 42f), 7f, 7f, Path.Direction.CW);

        Matrix m = new Matrix();
        m.postTranslate(-50f, -50f);
        m.postRotate(-55f);
        float scale = sizePx / 100f;
        m.postScale(scale, scale);
        m.postTranslate(cx, cy);
        p.transform(m);

        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(color);
        paint.setStyle(Paint.Style.FILL);
        c.drawPath(p, paint);
    }

    /**
     * Quick-start card of the "nothing playing" grid (iGrid, WidgetMaterial.dc.html):
     * 20dp rounded card with 1dp inner rim, 8dp padding, top art (radius 12dp) or centered 64dp DJ knob.
     */
    static Bitmap pick(@Nullable Bitmap src, boolean dj, float cardWDp, float cardHDp, float artHDp, Scheme s, float k) {
        int W = Math.max(1, Math.round(cardWDp * k)), H = Math.max(1, Math.round(cardHDp * k));
        Bitmap out = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(out);
        RectF cardRect = new RectF(0, 0, W, H);
        drawSurfaceCard(c, cardRect, 20 * k, dj ? DJ_CARD_BG : s.high, dj ? DJ_CARD_RIM : s.rim2, k);

        float pad = 8 * k;
        float artW = Math.max(1, W - 2 * pad);
        float artH = Math.max(1, artHDp * k);
        RectF artRect = new RectF(pad, pad, pad + artW, pad + artH);

        if (dj) {
            float knobPx = Math.min(64 * k, Math.min(artW, artH));
            drawKnob(c, artRect.centerX(), artRect.centerY(), knobPx, DJ_KNOB);
        } else if (src != null) {
            int aw = Math.max(1, Math.round(artW)), ah = Math.max(1, Math.round(artH));
            Bitmap crop = Bitmap.createBitmap(aw, ah, Bitmap.Config.ARGB_8888);
            new Canvas(crop).drawBitmap(src, coverCrop(src, aw, ah), new RectF(0, 0, aw, ah), new Paint(Paint.FILTER_BITMAP_FLAG));
            Paint ap = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
            BitmapShader sh = new BitmapShader(crop, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP);
            Matrix m = new Matrix();
            m.postTranslate(pad, pad);
            sh.setLocalMatrix(m);
            ap.setShader(sh);
            c.drawRoundRect(artRect, 12 * k, 12 * k, ap);
            crop.recycle();
        } else {
            Paint ap = new Paint(Paint.ANTI_ALIAS_FLAG);
            ap.setColor(oklch(0.20, 0.015, BRAND_HUE, 1.0));
            c.drawRoundRect(artRect, 12 * k, 12 * k, ap);
        }

        out.setDensity(densityOf(k));
        return out;
    }

    /* ── Helpers ─────────────────────────────────────── */

    /** object-fit: cover — the centred part of src with the target's aspect ratio. */
    private static Rect coverCrop(Bitmap src, float tw, float th) {
        int sw = src.getWidth(), sh = src.getHeight();
        float ta = tw / th, sa = sw / (float) sh;
        if (sa > ta) {
            int w = Math.round(sh * ta);
            int x = (sw - w) / 2;
            return new Rect(x, 0, x + w, sh);
        }
        int h = Math.round(sw / ta);
        int y = (sh - h) / 2;
        return new Rect(0, y, sw, y + h);
    }

    /** Anti-aliased rounded corners. */
    private static Bitmap rounded(Bitmap src, float r) {
        Bitmap out = Bitmap.createBitmap(src.getWidth(), src.getHeight(), Bitmap.Config.ARGB_8888);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setShader(new BitmapShader(src, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP));
        new Canvas(out).drawRoundRect(new RectF(0, 0, src.getWidth(), src.getHeight()), r, r, p);
        return out;
    }

    /** Skia: σ = 0.57735 · radius + 0.5 */
    private static float blurRadius(float sigma) {
        return Math.max(0.5f, (sigma - 0.5f) / 0.57735f);
    }

    /** Bitmap density so a bitmap drawn at k px per dp shows at its dp size in wrap_content views. */
    static int densityOf(float k) {
        return Math.max(1, Math.round(k * 160));
    }
}
