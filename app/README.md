# Pelagic app

Vite + React + TypeScript. One codebase for the PC browser/PWA and Android (Capacitor, later).

```
npm install
npm run dev      # http://localhost:5173
npm run build
```

## Design system (from `design_handoff_pelagic/`)

| File | What |
|---|---|
| `src/styles/tokens.css` | All design tokens as CSS variables: colour, glow, type, radii, spacing, layout, motion, atmosphere |
| `src/design/tokens.ts` | JS mirror for values used from code (eases, quality colours, tint clamps, particle counts) |
| `src/styles/fonts.css` | General Sans (self-hosted as "Pelagic Sans"); Plex Mono + Noto Sans JP come from `@fontsource` |
| `src/styles/base.css` | Reset, type helpers (`.t-hero`, `.t-page`, `.t-mono`…), shared keyframes, reduced-motion rules |
| `src/design/icons.tsx` | `<Icon name="…" />`: the 24-grid, 1.25-stroke icon set |
| `src/design/textures.ts` | `STONE`, `GRAIN`, `CONTOUR_SMOOTH`, `CONTOUR_LIVE` texture data URIs |
| `src/components/Logo.tsx` | Aperture mark, wordmark, lockup |
| `src/dev/Foundations.tsx` | Reference page with every token, icon and texture, to check against the handoff |

Motion: `<html data-motion="full|reduced">` overrides the OS reduced-motion setting. Leave it unset to follow the system. Animated elements use the class `pg-anim`, and particles use `pg-snow`.

### General Sans (to do once)
Download the free web kit from https://www.fontshare.com/fonts/general-sans and copy
`GeneralSans-Variable.woff2` and `GeneralSans-VariableItalic.woff2` into `public/fonts/`.
Until then, the Fontshare CDN link in `index.html` loads the font online. On Android the font must be self-hosted to work offline.
