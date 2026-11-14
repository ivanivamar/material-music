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
import android.graphics.LinearGradient;
import android.graphics.Matrix;
import android.graphics.Paint;
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
 * Pictures for the home screen widget. RemoteViews can't blur, mask or draw gradients over images,
 * so everything that isn't text or an icon button is drawn here into bitmaps (handoff "Background —
 * tinted" + the cover / tile / scrubber details):
 *
 *  - background(): transparent (the glass base is the layout's wg_shape, ~80% #1E1E22, so the
 *    wallpaper shows through a little — Oct 20, 2026, was solid #0B0B0C), the blurred "album light" top-left, the dark radial scrim from
 *    the bottom-right, the app's STONE / CONTOUR / GRAIN textures (res/drawable-nodpi/wg_tex_*,
 *    rendered from pelagic-kit.js), the cover glow of the player sizes, full-bleed covers of the
 *    1×1 / 2×2 sizes, the progress hairline and the 1dp inner ring, clipped to the widget radius.
 *  - cover(), pick(), scrubber(): the cover with its radius / ring / paused opacity, the squares of
 *    the "nothing playing" grid, the seek line with its glowing dot.
 *
 * Covers are Drive files: a downloaded copy (Offline) first, then a small disk cache, then Drive with
 * the account's token (DriveAuth). Runs on PelagicWidget.BG only.
 */
final class WidgetArt {
    static final int BASE = 0xFF0B0B0C;
    /** glass base under the bitmap (drawable/wg_shape, color/wg_glass): #1E1E22 at 80% */
    static final int GLASS = 0xCC1E1E22;
    static final int SURFACE = 0xFF141416;
    static final int LILAC = 0xFFC6B4F2;

    private static final int MAX_DISK = 60;
    private static final LruCache<String, Bitmap> art = new LruCache<>(10);
    private static final LruCache<String, Bitmap> bases = new LruCache<>(6);
    /** covers that couldn't be fetched lately (offline…): not retried on every redraw */
    private static final LruCache<String, Long> failed = new LruCache<>(32);
    private static final long RETRY_MS = 60_000;
    private static Bitmap stone, contour, grain;

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

    /* ── Colour ──────────────────────────────────────── */

    /** OKLCH hue (degrees) of a cover's average colour. */
    static float hueOf(@Nullable Bitmap bm) {
        if (bm == null) return 235f;
        Bitmap s = Bitmap.createScaledBitmap(bm, 8, 8, true);
        double a = 0, b = 0;
        for (int y = 0; y < 8; y++) {
            for (int x = 0; x < 8; x++) {
                double[] lab = oklab(s.getPixel(x, y));
                // weight by chroma so grey pixels don't decide the hue
                double c = Math.hypot(lab[1], lab[2]);
                a += lab[1] * c;
                b += lab[2] * c;
            }
        }
        if (s != bm) s.recycle();
        if (Math.abs(a) + Math.abs(b) < 1e-9) return 235f;
        double h = Math.toDegrees(Math.atan2(b, a));
        return (float) (h < 0 ? h + 360 : h);
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

    /** oklch(L C h / alpha) → ARGB (the handoff's cover glow: oklch(0.34 0.06 hue / 0.9)). */
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

    /** What the background shows under the content. */
    static final class Bg {
        /** dp */
        float w, h;
        /** px per dp for this bitmap */
        float scale;
        /** corner radius, dp */
        float radius = 24;
        /** album light (tinted surface): the cover, its opacity (0 = none) */
        @Nullable Bitmap light;
        float lightAlpha;
        /** full-bleed cover (1×1 and 2×2+ sizes) and its scrim: 1 = tile, 2 = cover */
        @Nullable Bitmap full;
        float fullAlpha = 1;
        int fullScrim;
        /** cover glow under a cover at (gx, gy) of size gs (dp), colour glow (0 = none) */
        float gx, gy, gs;
        int glow;
        /** contour texture offset, dp */
        float cx, cy;
        /** progress hairline: fraction (< 0 = none) and accent colours */
        float hairline = -1;
        int accent = Color.WHITE;
        int accentGlow = 0x80FFFFFF;

        String key() {
            return w + "x" + h + "@" + scale + "/" + radius + "/" + System.identityHashCode(light) + ":" + lightAlpha + "/"
                + System.identityHashCode(full) + ":" + fullAlpha + ":" + fullScrim + "/" + gx + "," + gy + "," + gs + ":" + glow + "/" + cx + "," + cy;
        }
    }

    static Bitmap background(Context ctx, Bg s) {
        int W = Math.max(1, Math.round(s.w * s.scale)), H = Math.max(1, Math.round(s.h * s.scale));
        String key = s.key();
        Bitmap base = bases.get(key);
        if (base == null) {
            base = drawBase(ctx, s, W, H);
            bases.put(key, base);
        }
        if (s.hairline < 0) return base;
        // the hairline changes with the position: on a copy of the cached layers
        Bitmap out = base.copy(Bitmap.Config.ARGB_8888, true);
        Canvas c = new Canvas(out);
        float k = s.scale;
        float top = H - 1.5f * k;
        // clipped to the widget's rounded shape (the base is see-through now, so SRC_ATOP would fade it)
        android.graphics.Path clip = new android.graphics.Path();
        clip.addRoundRect(new RectF(0, 0, W, H), s.radius * k, s.radius * k, android.graphics.Path.Direction.CW);
        c.clipPath(clip);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(0x1FFFFFFF);
        c.drawRect(0, top, W, H, p);
        float fw = W * Math.max(0, Math.min(1, s.hairline));
        if (fw > 0) {
            Paint g = new Paint(Paint.ANTI_ALIAS_FLAG);
            g.setColor(s.accentGlow);
            g.setMaskFilter(new BlurMaskFilter(blurRadius(3 * k), BlurMaskFilter.Blur.NORMAL));
            c.drawRect(0, top, fw, H, g);
            p.setColor(s.accent);
            c.drawRect(0, top, fw, H, p);
        }
        out.setDensity(densityOf(k));
        return out;
    }

    private static Bitmap drawBase(Context ctx, Bg s, int W, int H) {
        float k = s.scale;
        Bitmap full = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(full);
        // 1. base: none here — wg_shape (GLASS) sits under this bitmap, so it stays see-through
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);

        // 2. album light: the cover, blurred 48, saturation ×1.3, at (−30%, −60%) 110% × 160%
        if (s.light != null && s.lightAlpha > 0) drawLight(c, s.light, W, H, k, s.lightAlpha);

        // 3. scrim: radial from the bottom-right (120% × 110%), 55% app-dark there (keeps the controls
        //    readable on light wallpapers), fading out towards the top-left light
        Paint scrim = new Paint(Paint.ANTI_ALIAS_FLAG);
        RadialGradient rg = new RadialGradient(0, 0, 1f,
            new int[] { 0x8C0B0B0C, 0x8C0B0B0C, 0x4D0B0B0C, 0x000B0B0C }, new float[] { 0f, 0.25f, 0.6f, 1f }, Shader.TileMode.CLAMP);
        Matrix m = new Matrix();
        m.setScale(1.2f * W, 1.1f * H);
        m.postTranslate(W, H);
        rg.setLocalMatrix(m);
        scrim.setShader(rg);
        c.drawRect(0, 0, W, H, scrim);

        // 4. textures, as on the app's screens
        loadTextures(ctx);
        texture(c, stone, 900f * k / stone.getWidth(), 0, 0, 0.09f, W, H);
        texture(c, contour, 1600f * k / contour.getWidth(), -s.cx * k, -s.cy * k, 0.075f, W, H);
        texture(c, grain, 220f * k / grain.getWidth(), 0, 0, 0.035f, W, H);

        // cover glow (player sizes): box-shadow 0 20 40 -20 glow
        if (s.glow != 0 && s.gs > 0) {
            Paint g = new Paint(Paint.ANTI_ALIAS_FLAG);
            g.setColor(s.glow);
            g.setMaskFilter(new BlurMaskFilter(blurRadius(20 * k), BlurMaskFilter.Blur.NORMAL));
            RectF r = new RectF((s.gx + 20) * k, (s.gy + 40) * k, (s.gx + s.gs - 20) * k, (s.gy + s.gs) * k);
            c.drawRoundRect(r, 14 * k, 14 * k, g);
        }

        // full-bleed cover (1×1, 2×2+) with its scrim
        if (s.fullScrim != 0) {
            if (s.full != null) {
                p.setAlpha(Math.round(255 * s.fullAlpha));
                c.drawBitmap(s.full, coverCrop(s.full, W, H), new RectF(0, 0, W, H), p);
                p.setAlpha(255);
            }
            Paint lg = new Paint();
            lg.setShader(s.fullScrim == 1
                ? new LinearGradient(0, 0, 0, H, new int[] { 0x00050505, 0x00050505, 0x8C050505 }, new float[] { 0f, 0.4f, 1f }, Shader.TileMode.CLAMP)
                : new LinearGradient(0, 0, 0, H, new int[] { 0x59050505, 0x00050505, 0x0008080A, 0xEB08080A }, new float[] { 0f, 0.3f, 0.42f, 1f }, Shader.TileMode.CLAMP));
            c.drawRect(0, 0, W, H, lg);
        }

        // inner hairline ring (1dp, 0.08)
        Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        ring.setStyle(Paint.Style.STROKE);
        ring.setStrokeWidth(k);
        ring.setColor(0x14FFFFFF);
        float r = s.radius * k;
        c.drawRoundRect(new RectF(k / 2, k / 2, W - k / 2, H - k / 2), r - k / 2, r - k / 2, ring);

        Bitmap out = rounded(full, r);
        full.recycle();
        out.setDensity(densityOf(k));
        return out;
    }

    /** CSS blur(48px) ≈ a gaussian σ 48: blur a small copy (with a transparent margin so the edges fade), then scale it up. */
    private static void drawLight(Canvas c, Bitmap src, int W, int H, float k, float alpha) {
        float L = -0.3f * W, T = -0.6f * H, RW = 1.1f * W, RH = 1.6f * H;
        float f = 48 * k / 6f; // down-scale factor: σ becomes ~6px
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

    /** One line of a box blur (edges treated as transparent / zero). */
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

    private static void loadTextures(Context ctx) {
        if (stone != null) return;
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inScaled = false;
        stone = BitmapFactory.decodeResource(ctx.getResources(), R.drawable.wg_tex_stone, o);
        contour = BitmapFactory.decodeResource(ctx.getResources(), R.drawable.wg_tex_contour, o);
        grain = BitmapFactory.decodeResource(ctx.getResources(), R.drawable.wg_tex_grain, o);
    }

    private static void texture(Canvas c, Bitmap tile, float scale, float dx, float dy, float alpha, int W, int H) {
        BitmapShader sh = new BitmapShader(tile, Shader.TileMode.REPEAT, Shader.TileMode.REPEAT);
        Matrix m = new Matrix();
        m.setScale(scale, scale);
        m.postTranslate(dx, dy);
        sh.setLocalMatrix(m);
        Paint p = new Paint(Paint.FILTER_BITMAP_FLAG);
        p.setShader(sh);
        p.setAlpha(Math.round(alpha * 255));
        c.drawRect(0, 0, W, H, p);
    }

    /* ── Covers, picks, scrubber ─────────────────────── */

    /** A cover: size dp, corner radius dp, 1dp ring (0.08), opacity; a dark square when there's no art. */
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
        } else {
            p.setColor(0xFF1A1A1D);
            c.drawRoundRect(all, r, r, p);
        }
        Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        ring.setStyle(Paint.Style.STROKE);
        ring.setStrokeWidth(k);
        ring.setColor(0x14FFFFFF);
        c.drawRoundRect(new RectF(k / 2, k / 2, S - k / 2, S - k / 2), r - k / 2, r - k / 2, ring);
        out.setDensity(densityOf(k));
        return out;
    }

    /** A square of the "nothing playing" grid: cover + scrim + ring, or the DJ tile (lilac light, ring mark). */
    static Bitmap pick(@Nullable Bitmap src, boolean dj, float sizeDp, float k) {
        int S = Math.max(1, Math.round(sizeDp * k));
        Bitmap out = Bitmap.createBitmap(S, S, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(out);
        float r = 14 * k;
        RectF all = new RectF(0, 0, S, S);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        if (dj) {
            RadialGradient g = new RadialGradient(S * 0.5f, S * 0.3f, S, new int[] { 0x2EC6B4F2, 0x0AC6B4F2 }, new float[] { 0f, 0.7f }, Shader.TileMode.CLAMP);
            p.setShader(g);
            c.drawRoundRect(all, r, r, p);
            p.setShader(null);
            float cx = S * 0.5f, cy = S * 0.38f, rr = 14 * k;
            Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
            glow.setColor(0x73C6B4F2);
            glow.setStyle(Paint.Style.STROKE);
            glow.setStrokeWidth(2 * k);
            glow.setMaskFilter(new BlurMaskFilter(blurRadius(9 * k), BlurMaskFilter.Blur.NORMAL));
            c.drawCircle(cx, cy, rr, glow);
            Paint ringP = new Paint(Paint.ANTI_ALIAS_FLAG);
            ringP.setStyle(Paint.Style.STROKE);
            ringP.setStrokeWidth(k);
            ringP.setColor(0x99C6B4F2);
            c.drawCircle(cx, cy, rr - k / 2, ringP);
            Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
            dot.setColor(LILAC);
            c.drawCircle(cx, cy, 3 * k, dot);
        } else {
            p.setColor(SURFACE);
            c.drawRoundRect(all, r, r, p);
            if (src != null) {
                Bitmap sq = Bitmap.createBitmap(S, S, Bitmap.Config.ARGB_8888);
                Canvas q = new Canvas(sq);
                q.drawBitmap(src, coverCrop(src, S, S), all, new Paint(Paint.FILTER_BITMAP_FLAG));
                Paint lg = new Paint();
                lg.setShader(new LinearGradient(0, 0, 0, S, new int[] { 0x0008080A, 0x0008080A, 0xE608080A }, new float[] { 0f, 0.35f, 1f }, Shader.TileMode.CLAMP));
                q.drawRect(all, lg);
                p.setShader(new BitmapShader(sq, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP));
                c.drawRoundRect(all, r, r, p);
                p.setShader(null);
            }
        }
        Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        ring.setStyle(Paint.Style.STROKE);
        ring.setStrokeWidth(k);
        ring.setColor(dj ? 0x59C6B4F2 : 0x14FFFFFF);
        c.drawRoundRect(new RectF(k / 2, k / 2, S - k / 2, S - k / 2), r - k / 2, r - k / 2, ring);
        out.setDensity(densityOf(k));
        return out;
    }

    /**
     * The seek line of the player sizes: 1dp track (0.18), accent fill, 5dp dot with a glow. Width
     * dp of the line; the bitmap adds 10dp each side and 6dp above / below for the glow (the layouts
     * take that back with negative margins).
     */
    static Bitmap scrubber(float widthDp, float frac, int accent, int accentGlow, float k) {
        int W = Math.max(1, Math.round((widthDp + 20) * k)), H = Math.round(21 * k);
        Bitmap out = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(out);
        float x0 = 10 * k, x1 = W - 10 * k, y = 10.5f * k;
        float x = x0 + (x1 - x0) * Math.max(0, Math.min(1, frac));
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(0x2EFFFFFF);
        c.drawRect(x0, y - k / 2, x1, y + k / 2, p);
        p.setColor(accent);
        c.drawRect(x0, y - k / 2, x, y + k / 2, p);
        Paint g = new Paint(Paint.ANTI_ALIAS_FLAG);
        g.setColor(accentGlow);
        g.setMaskFilter(new BlurMaskFilter(blurRadius(4 * k), BlurMaskFilter.Blur.NORMAL));
        c.drawCircle(x, y, 4.5f * k, g);
        p.setColor(accent);
        c.drawCircle(x, y, 2.5f * k, p);
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
