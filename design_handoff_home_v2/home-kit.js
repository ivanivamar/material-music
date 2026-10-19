// Pelagic Home v2 — generated art (mix covers, radio art, DJ mark, avatars) + sample data.
window.HomeKit = function (h, PK) {
const F = { tsunami: 'spiritbox-tsunami-sea', zanmu: 'ado-zanmu', under: 'eve-under-blue', roto: 'spiritbox-rotoscope', periphery: 'periphery-v', fear: 'spiritbox-fear-of-fear', evan: 'evanescence-sanctuary', bvb: 'bvb-vindicate', bfmv: 'bfmv-social-apocalypse', wing: 'wing-dopamine' };
const ART = k => './art/' + F[k] + '.jpg';
// mean luminance per cover (0–1), measured once on import; drives the normalisation below
const LUM = { tsunami: 0.10, zanmu: 0.34, under: 0.36, roto: 0.08, periphery: 0.07, fear: 0.12, evan: 0.30, bvb: 0.26, bfmv: 0.20, wing: 0.18 };
const AL = { tsunami: ['Tsunami Sea', 'Spiritbox'], zanmu: ['Zanmu', 'Ado'], under: ['Under Blue', 'Eve'], roto: ['Rotoscope', 'Spiritbox'], periphery: ['Periphery V', 'Periphery'], fear: ['The Fear of Fear', 'Spiritbox'], evan: ['Sanctuary', 'Evanescence'], bvb: ['Vindicate', 'Black Veil Brides'], bfmv: ['Social Apocalypse', 'Bullet for My Valentine'], wing: ['Dopamine', 'Wing'] };
const LIL = 'rgb(198,180,242)', LILL = 'rgb(226,216,250)', LA = a => `rgba(198,180,242,${a})`;
const MONO = "'IBM Plex Mono',monospace";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let uid = 0; const nid = p => p + (++uid);

const MIXES = [
  { id: 'd1', kind: 'daily', n: 1, title: 'Darkwave · Post-punk', sub: 'Molchat Doma, Interpol and more', hue: 205, covers: ['wing', 'roto', 'fear', 'periphery'] },
  { id: 'd2', kind: 'daily', n: 2, title: 'Metalcore · Post-hardcore', sub: 'Spiritbox, Bullet for My Valentine and more', hue: 25, covers: ['tsunami', 'bfmv', 'bvb', 'fear'] },
  { id: 'd3', kind: 'daily', n: 3, title: 'J-rock · J-pop', sub: 'Ado, Eve and more', hue: 350, covers: ['zanmu', 'under', 'wing', 'evan'] },
  { id: 'd4', kind: 'daily', n: 4, title: 'Alt-metal · Nu metal', sub: 'Evanescence, Black Veil Brides and more', hue: 70, covers: ['evan', 'bvb', 'bfmv', 'periphery'] },
  { id: 'd5', kind: 'daily', n: 5, title: 'Progressive metal · Djent', sub: 'Periphery, Spiritbox and more', hue: 150, covers: ['periphery', 'roto', 'tsunami', 'fear'] },
  { id: 'd6', kind: 'daily', n: 6, title: 'Symphonic metal · Gothic rock', sub: 'Evanescence, Within Temptation and more', hue: 255, covers: ['evan', 'fear', 'wing', 'zanmu'] },
  { id: 'deep', kind: 'deep', title: 'Deep cuts', sub: 'Never played, from Spiritbox, Ado, Interpol…', hue: 230, covers: ['roto', 'zanmu', 'periphery', 'bfmv'] },
  { id: 'redis', kind: 'redis', title: 'Rediscover', sub: 'Songs you loved in spring 2024', hue: 45, covers: ['under', 'bvb', 'evan', 'wing'] },
];
const RADIOS = [
  { id: 'r1', seed: 'artist', title: 'Interpol Radio', sub: 'With Editors, The National…', img: 'wing', hue: 220, name: 'Interpol' },
  { id: 'r2', seed: 'song', title: 'Radio from ‘Evil’', sub: 'With Editors, The National…', img: 'bfmv', hue: 60, name: 'Evil' },
  { id: 'r3', seed: 'artist', title: 'Ado Radio', sub: 'With Eve, Yorushika, Reol…', img: 'zanmu', hue: 355, name: 'Ado' },
  { id: 'r4', seed: 'artist', title: 'Molchat Doma Radio', sub: 'With Lebanon Hanover, Boy Harsher…', img: null, initials: 'MD', hue: 200, name: 'Molchat Doma' },
  { id: 'r5', seed: 'song', title: 'Radio from ‘Soft Spine’', sub: 'With Periphery, Loathe, Sleep Token…', img: 'tsunami', hue: 250, name: 'Soft Spine' },
  { id: 'r6', seed: 'artist', title: 'Evanescence Radio', sub: 'With Within Temptation, Lacuna Coil…', img: 'evan', hue: 25, name: 'Evanescence' },
  { id: 'r7', seed: 'song', title: 'Radio from ‘Under Blue’', sub: 'With Ado, Yorushika, Zutomayo…', img: 'under', hue: 230, name: 'Under Blue' },
];
const RADIOS_EARLY = [
  { id: 'e1', seed: 'artist', title: 'Spiritbox Radio', sub: 'With Periphery, Loathe, Sleep Token…', img: 'fear', hue: 305, name: 'Spiritbox' },
  { id: 'e2', seed: 'artist', title: 'Periphery Radio', sub: 'With Animals as Leaders, Tesseract…', img: null, initials: 'P', hue: 290, name: 'Periphery' },
  { id: 'e3', seed: 'artist', title: 'Ado Radio', sub: 'With Eve, Yorushika, Reol…', img: 'zanmu', hue: 355, name: 'Ado' },
];
const ARTISTS = [
  { name: 'Interpol', img: 'wing', sub: '48 PLAYS · 90 DAYS' },
  { name: 'Spiritbox', img: 'fear', sub: '41 PLAYS · 90 DAYS' },
  { name: 'Ado', img: 'zanmu', sub: '36 PLAYS · 90 DAYS' },
  { name: 'Molchat Doma', img: null, initials: 'MD', hue: 200, sub: '29 PLAYS · 90 DAYS' },
  { name: 'Eve', img: 'under', sub: '22 PLAYS · 90 DAYS' },
  { name: 'Evanescence', img: 'evan', sub: '17 PLAYS · 90 DAYS' },
  { name: 'Periphery', img: null, initials: 'P', hue: 290, sub: '14 PLAYS · 90 DAYS' },
  { name: 'Black Veil Brides', img: 'bvb', sub: '9 PLAYS · 90 DAYS' },
];
const ARTISTS_EARLY = [
  { name: 'Spiritbox', img: 'fear', sub: '3 ALBUMS' }, { name: 'Periphery', img: null, initials: 'P', hue: 290, sub: '2 ALBUMS' },
  { name: 'Ado', img: 'zanmu', sub: '1 ALBUM' }, { name: 'Eve', img: 'under', sub: '1 ALBUM' }, { name: 'Evanescence', img: 'evan', sub: '1 ALBUM' },
];
const SMART = [
  { title: 'Added this month', n: 46, covers: ['tsunami', 'zanmu', 'under', 'wing'] },
  { title: 'Never played, 24-bit', n: 212, covers: ['periphery', 'evan', 'bvb', 'roto'] },
  { title: 'Over 6 minutes', n: 88, covers: ['periphery', 'fear', 'evan', 'tsunami'] },
  { title: 'Top 50 · last 90 days', n: 50, covers: ['wing', 'tsunami', 'zanmu', 'fear'] },
  { title: 'Japanese, never skipped', n: 73, covers: ['zanmu', 'under', 'wing', 'roto'] },
];
const RECENT = ['evan', 'wing', 'fear', 'bfmv', 'under', 'zanmu', 'tsunami'];
const REDIS_AL = [['bfmv', 'Mar 2025'], ['wing', 'Jan 2025'], ['fear', 'Nov 2024'], ['bvb', 'Aug 2025'], ['evan', 'Jun 2025'], ['under', 'May 2025'], ['roto', 'Feb 2025']];
const PLAYLISTS = [['Heavy water', '42 TRACKS', 'periphery'], ['Late train, Tokyo', '28 TRACKS', 'zanmu'], ['Breakdowns only', '63 TRACKS', 'roto'], ['Low volume', '19 TRACKS', 'under'], ['Gym, unfortunately', '51 TRACKS', 'bvb']];
const JBI = [
  { id: 'j-tsunami', kind: 'album', label: 'ALBUM', name: 'Tsunami Sea', k: 'tsunami', now: 'Soft Spine', by: 'Spiritbox' },
  { id: 'j-d1', kind: 'daily', label: 'DAILY MIX', name: 'Darkwave · Post-punk', mix: 'd1', now: 'Sudno', by: 'Molchat Doma' },
  { id: 'j-r1', kind: 'radio', label: 'RADIO', name: 'Interpol Radio', radio: 'r1', now: 'Evil', by: 'Interpol' },
  { id: 'j-heavy', kind: 'playlist', label: 'PLAYLIST', name: 'Heavy water', covers: ['periphery', 'tsunami', 'roto', 'fear'], now: 'Wildfire', by: 'Periphery' },
  { id: 'j-ado', kind: 'artist', label: 'ARTIST', name: 'Ado', artist: 2, now: 'Show', by: 'Ado' },
  { id: 'j-added', kind: 'smart', label: 'SMART', name: 'Added this month', smart: 0, now: 'Black Rainbow', by: 'Spiritbox' },
  { id: 'j-zanmu', kind: 'album', label: 'ALBUM', name: 'Zanmu', k: 'zanmu', now: 'Show', by: 'Ado' },
];
const JBI_EARLY = [
  { id: 'j-tsunami', kind: 'album', label: 'ALBUM', name: 'Tsunami Sea', k: 'tsunami', now: 'Soft Spine', by: 'Spiritbox' },
  { id: 'j-zanmu', kind: 'album', label: 'ALBUM', name: 'Zanmu', k: 'zanmu', now: 'Show', by: 'Ado' },
  { id: 'j-spirit', kind: 'artist', label: 'ARTIST', name: 'Spiritbox', artist: 1, now: 'Jaded', by: 'Spiritbox' },
];
const TRACKS = [
  ['Sudno (Boris Ryzhy)', 'Molchat Doma', 'Etazhi', 'wing', 'f16', '2 DAYS AGO', '02:58', 1],
  ['Evil', 'Interpol', 'Antics', 'bfmv', 'f24', 'YESTERDAY', '03:36', 1],
  ['Gallowdance', 'Lebanon Hanover', 'Tomb for Two', 'fear', 'f16', null, '04:11', 0],
  ['Munich', 'Editors', 'The Back Room', 'roto', 'f16', '5 DAYS AGO', '03:45', 1],
  ['Pain', 'Boy Harsher', 'Yr Body Is Nothing', 'periphery', 'f24', null, '04:02', 0],
  ['Kletka', 'Molchat Doma', 'Monument', 'wing', 'f16', '1 WEEK AGO', '03:17', 1],
  ['Disorder', 'Joy Division', 'Unknown Pleasures', 'evan', 'f16', '3 WEEKS AGO', '03:32', 1],
  ['Durdu Dünya', 'She Past Away', 'Belirdi Gece', 'tsunami', 'f24', null, '04:24', 0],
  ['Slow Hands', 'Interpol', 'Antics', 'bfmv', 'f16', '4 DAYS AGO', '03:04', 1],
  ['Papillon', 'Editors', 'In This Light and on This Evening', 'roto', 'f16', '2 WEEKS AGO', '05:23', 1],
];
const Q = { f16: ['FLAC 16/44.1', '143,199,230'], f24: ['FLAC 24/48', '198,180,242'], op: ['OPUS 160', '230,196,141'] };

const tex = (size, o) => {
  if (!PK) return [];
  const out = [];
  if (o.stone) out.push(h('div', { key: 'st', style: { position: 'absolute', inset: 0, backgroundImage: PK.STONE, backgroundSize: '900px 900px', opacity: o.stone } }));
  if (o.contour) out.push(h('div', { key: 'ct', style: { position: 'absolute', inset: 0, backgroundImage: PK.CONTOUR_SMOOTH, backgroundSize: `${size * 3.2}px ${size * 2}px`, backgroundPosition: '70% 30%', opacity: o.contour } }));
  if (o.grain) out.push(h('div', { key: 'gr', style: { position: 'absolute', inset: 0, backgroundImage: PK.GRAIN, backgroundSize: '220px 220px', opacity: o.grain, mixBlendMode: 'screen' } }));
  return out;
};
const radiusFor = size => size >= 100 ? 10 : size >= 40 ? 8 : 6;
const lbl = (size, text, extra) => h('div', { key: 'lb', style: Object.assign({ position: 'absolute', left: Math.round(size * 0.075), top: Math.round(size * 0.075), fontFamily: MONO, fontSize: Math.max(9, Math.round(size * 0.055)), letterSpacing: '0.18em', color: 'rgba(255,255,255,0.88)', whiteSpace: 'nowrap' }, extra || {}) }, text);

// ── Mix cover: 2×2 mosaic → luminance-normalised greyscale → genre tint (colour blend) → kind overlay → grain → marks
function mixCover(size, mix, o) {
  o = o || {};
  const r = o.r != null ? o.r : radiusFor(size), H = mix.hue, kind = mix.kind, big = size >= 100, stg = o.stage || 5;
  if (stg === 1) o = Object.assign({}, o, { raw: true });
  const target = kind === 'redis' ? 0.36 : kind === 'deep' ? 0.22 : 0.27;
  const tiles = mix.covers.slice(0, 4).map((k, i) => {
    let lum = LUM[k], f = '';
    if (o.sim === 'bright') { f += 'invert(1) '; lum = 1 - lum; }
    if (!o.raw) f += `grayscale(1) brightness(${clamp(target / lum, 0.4, 2.4).toFixed(2)}) contrast(${kind === 'redis' ? 0.82 : 1.08})`;
    return h('img', { key: i, src: ART(k), alt: '', style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: f || 'none' } });
  });
  const kids = [h('div', { key: 'm', style: { position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: size >= 100 ? 1 : 0, background: `oklch(0.12 0.03 ${H})` } }, tiles)];
  if (!o.raw && stg >= 3) {
    kids.push(h('div', { key: 'c', style: { position: 'absolute', inset: 0, background: `oklch(0.62 ${kind === 'redis' ? 0.045 : 0.07} ${H})`, mixBlendMode: 'color' } }));
    const ov = kind === 'deep'
      ? `linear-gradient(180deg, oklch(0.07 0.02 ${H} / 0.97) 0%, oklch(0.09 0.025 ${H} / 0.84) 50%, oklch(0.13 0.035 ${H} / 0.42) 100%)`
      : kind === 'redis'
        ? `radial-gradient(85% 62% at 84% -6%, oklch(0.93 0.035 ${H} / 0.48), oklch(0.93 0.035 ${H} / 0) 64%), linear-gradient(180deg, oklch(0.5 0.03 ${H} / 0.12) 0%, oklch(0.14 0.03 ${H} / 0.86) 100%)`
        : `linear-gradient(170deg, oklch(0.15 0.035 ${H} / 0.72) 0%, oklch(0.18 0.04 ${H} / 0.12) 40%, oklch(0.10 0.03 ${H} / 0.92) 100%)`;
    if (stg >= 4) { kids.push(h('div', { key: 'o', style: { position: 'absolute', inset: 0, background: ov } })); kids.push(...tex(size, { contour: kind === 'deep' ? 0.16 : 0, grain: 0.09 })); }
  }
  const pad = Math.max(5, Math.round(size * 0.075));
  if (stg < 5) {} else if (kind === 'daily') {
    if (big) kids.push(lbl(size, 'DAILY MIX'));
    kids.push(h('div', { key: 'n', style: { position: 'absolute', left: big ? pad - Math.round(size * 0.01) : pad, bottom: big ? pad - Math.round(size * 0.02) : pad - 2, fontSize: Math.round(size * (big ? 0.40 : 0.44)), fontWeight: 300, letterSpacing: '-0.04em', lineHeight: 0.8, color: '#FFFFFF', textShadow: '0 2px 18px rgba(0,0,0,0.35)' } }, String(mix.n)));
  } else if (kind === 'deep') {
    if (big) kids.push(lbl(size, 'DEEP CUTS'));
    const lx = pad + 2, top = big ? size * 0.3 : size * 0.18, bot = size - pad - (big ? 4 : 3);
    kids.push(h('div', { key: 'dl', style: { position: 'absolute', left: lx, top, height: bot - top, width: 1, background: 'linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,0.7))' } }));
    kids.push(h('div', { key: 'dd', style: { position: 'absolute', left: lx - (big ? 2.5 : 2), top: bot - (big ? 2.5 : 2), width: big ? 6 : 5, height: big ? 6 : 5, borderRadius: '50%', background: '#FFFFFF', boxShadow: '0 0 10px 2px rgba(255,255,255,0.5)' } }));
    if (big) kids.push(h('div', { key: 'dt', style: { position: 'absolute', left: lx + 12, bottom: pad - 2, fontFamily: MONO, fontSize: Math.max(9, Math.round(size * 0.05)), letterSpacing: '0.16em', color: 'rgba(255,255,255,0.72)' } }, 'NEVER PLAYED'));
  } else if (kind === 'redis') {
    if (big) kids.push(lbl(size, 'REDISCOVER'));
    kids.push(h('div', { key: 'sl', style: { position: 'absolute', left: pad, right: pad, bottom: big ? pad + Math.round(size * 0.1) : pad + 2, height: 1, background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.8) 35%, rgba(255,255,255,0))' } }));
    if (big) kids.push(h('div', { key: 'st', style: { position: 'absolute', left: pad, bottom: pad - 2, fontFamily: MONO, fontSize: Math.max(9, Math.round(size * 0.05)), letterSpacing: '0.16em', color: 'rgba(255,255,255,0.78)' } }, 'LOVED · NOT LATELY'));
  }
  return h('div', { style: { position: 'relative', width: size, height: size, borderRadius: r, overflow: 'hidden', flex: 'none', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)', isolation: 'isolate' } }, kids, h('div', { key: 'edge', style: { position: 'absolute', inset: 0, borderRadius: r, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.07)', pointerEvents: 'none' } }));
}

function initialsDisc(size, a) {
  const H = a.hue != null ? a.hue : 220;
  return h('div', { style: { position: 'relative', width: size, height: size, borderRadius: '50%', overflow: 'hidden', flex: 'none', background: `radial-gradient(80% 80% at 35% 25%, oklch(0.30 0.035 ${H}), oklch(0.16 0.02 ${H}) 75%)`, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
    ...tex(size, { contour: 0.12, grain: 0.08 }),
    h('span', { key: 'i', style: { position: 'relative', fontSize: Math.round(size * (a.initials && a.initials.length > 1 ? 0.3 : 0.38)), fontWeight: 300, letterSpacing: '-0.01em', color: `oklch(0.90 0.03 ${H})` } }, a.initials));
}
function avatar(size, a) {
  if (!a.img) return initialsDisc(size, a);
  return h('div', { style: { position: 'relative', width: size, height: size, borderRadius: '50%', overflow: 'hidden', flex: 'none' } },
    h('img', { src: ART(a.img), alt: '', style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' } }),
    h('div', { style: { position: 'absolute', inset: 0, borderRadius: '50%', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' } }));
}

// ── Radio art: tinted stone ground, seed in the centre (round = artist, square = song), three fixed sonar rings and one satellite dot orbiting the first ring
function radioArt(size, rd, o) {
  o = o || {};
  const m = o.m !== false, r = o.r != null ? o.r : radiusFor(size), H = rd.hue, c = size / 2, big = size >= 100, tiny = size < 70;
  const D = size * (rd.seed === 'artist' ? (tiny ? 0.6 : 0.54) : (tiny ? 0.52 : 0.46));
  const id = nid('ro');
  const rings = (tiny ? [D / 2 + size * 0.11] : [D / 2 + size * 0.085, D / 2 + size * 0.17, D / 2 + size * 0.255]);
  const ops = [0.3, 0.14, 0.07];
  const g = [h('defs', { key: 'd' }, h('filter', { id: id + 'b', x: '-200%', y: '-200%', width: '500%', height: '500%' }, h('feGaussianBlur', { stdDeviation: big ? 2.2 : 1.2 })))];
  rings.forEach((rr, i) => g.push(h('circle', { key: 'r' + i, cx: c, cy: c, r: rr, fill: 'none', stroke: '#FFFFFF', strokeOpacity: ops[i], strokeWidth: 1 })));
  const R = rings[0], a0 = -52 * Math.PI / 180, dx = c + R * Math.cos(a0), dy = c + R * Math.sin(a0), dr = big ? 2.4 : 1.7;
  const sat = [h('circle', { key: 'h', cx: dx, cy: dy, r: dr * 2.6, fill: '#FFFFFF', opacity: 0.45, filter: `url(#${id}b)` }), h('circle', { key: 's', cx: dx, cy: dy, r: dr, fill: '#FFFFFF' })];
  if (m) sat.push(h('animateTransform', { key: 'a', attributeName: 'transform', type: 'rotate', from: `0 ${c} ${c}`, to: `360 ${c} ${c}`, dur: '36s', repeatCount: 'indefinite' }));
  g.push(h('g', { key: 'sat' }, sat));
  const seedEl = rd.seed === 'artist'
    ? (rd.img ? h('img', { src: ART(rd.img), alt: '', style: { width: D, height: D, borderRadius: '50%', objectFit: 'cover', display: 'block' } }) : initialsDisc(D, rd))
    : h('img', { src: ART(rd.img), alt: '', style: { width: D, height: D, borderRadius: Math.max(4, Math.round(D * 0.06)), objectFit: 'cover', display: 'block' } });
  const kids = [...tex(size, { stone: 0.1, grain: 0.08 }),
    h('svg', { key: 'svg', width: size, height: size, viewBox: `0 0 ${size} ${size}`, style: { position: 'absolute', inset: 0 } }, g),
    h('div', { key: 'seed', style: { position: 'absolute', left: c - D / 2, top: c - D / 2, width: D, height: D, borderRadius: rd.seed === 'artist' ? '50%' : Math.round(D * 0.06), boxShadow: '0 0 0 1px rgba(255,255,255,0.1), 0 12px 30px -10px rgba(0,0,0,0.9)' } }, seedEl)];
  if (big) kids.push(lbl(size, 'RADIO'));
  return h('div', { style: { position: 'relative', width: size, height: size, borderRadius: o.round ? '50%' : r, overflow: 'hidden', flex: 'none', background: `radial-gradient(75% 75% at 50% 50%, oklch(0.27 0.035 ${H}) 0%, oklch(0.14 0.02 ${H}) 55%, #0A0A0B 100%)`, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.07)' } }, kids);
}

function mosaic(size, covers, r) {
  return h('div', { style: { width: size, height: size, flex: 'none', borderRadius: r != null ? r : radiusFor(size), overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: size >= 100 ? 2 : 1, background: '#0B0B0C', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)' } },
    covers.slice(0, 4).map((k, i) => h('img', { key: i, src: ART(k), alt: '', style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' } })));
}
function cover(size, k, r) {
  return h('img', { src: ART(k), alt: '', style: { width: size, height: size, borderRadius: r != null ? r : radiusFor(size), objectFit: 'cover', display: 'block', flex: 'none', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)' } });
}

// ── DJ mark (from the DJ handoff), now in the badge lilac. o: { speak, onair, idle, lvl, m }
function djMark(size, o) {
  o = o || {};
  const m = o.m !== false, sp = !!o.speak, air = !!o.onair && !sp, lvl = o.lvl || 0, big = size >= 100, id = nid('dj');
  const r = o.r != null ? o.r : size >= 60 ? 10 : size >= 40 ? 8 : Math.max(4, Math.round(size * 0.24));
  const cx = big ? 50 : 12, cy = big ? 60 : 15.5;
  const radii = big ? [9, 18, 27, 36, 45] : [4.5, 8.5], ops = big ? [0.95, 0.6, 0.34, 0.17, 0.08] : [1, 0.5];
  const refl = big ? [[9, 0.16], [18, 0.08], [27, 0.04]] : [[4.5, 0.18]];
  const sw = big ? 1.5 : size >= 40 ? 1.4 : 1.25;
  const g = [h('defs', { key: 'd' }, h('linearGradient', { id: id + 'hz', x1: 0, x2: 1, y1: 0, y2: 0 }, h('stop', { offset: 0, stopColor: LIL, stopOpacity: 0 }), h('stop', { offset: 0.5, stopColor: LIL, stopOpacity: 0.75 }), h('stop', { offset: 1, stopColor: LIL, stopOpacity: 0 })), h('filter', { id: id + 'bl', x: '-100%', y: '-100%', width: '300%', height: '300%' }, h('feGaussianBlur', { stdDeviation: big ? 2.4 : 1.1 })))];
  g.push(h('line', { key: 'hz', x1: big ? 4 : 1, x2: big ? 96 : 23, y1: cy, y2: cy, stroke: `url(#${id}hz)`, strokeWidth: sw, vectorEffect: 'non-scaling-stroke' }));
  radii.forEach((rr, i) => {
    const base = ops[i], op = sp && i > 0 ? Math.min(1, base * (1 + lvl * 1.4)) : base;
    g.push(h('path', { key: 'a' + i, d: `M ${cx - rr} ${cy} A ${rr} ${rr} 0 0 1 ${cx + rr} ${cy}`, fill: 'none', stroke: LIL, strokeOpacity: op, strokeWidth: sw, strokeLinecap: 'round', vectorEffect: 'non-scaling-stroke' }));
  });
  refl.forEach(([rr, op], i) => g.push(h('path', { key: 'r' + i, d: `M ${cx - rr} ${cy} A ${rr} ${rr} 0 0 0 ${cx + rr} ${cy}`, fill: 'none', stroke: LIL, strokeOpacity: op, strokeWidth: sw, vectorEffect: 'non-scaling-stroke' })));
  const ring = (k, from, to, op0, dur, begin) => h('circle', { key: k, cx, cy, r: from, fill: 'none', stroke: LIL, strokeWidth: 1, vectorEffect: 'non-scaling-stroke', opacity: 0 },
    h('animate', { attributeName: 'r', values: `${from};${to}`, dur, begin, repeatCount: 'indefinite', calcMode: 'spline', keyTimes: '0;1', keySplines: '.15 .6 .35 1' }),
    h('animate', { attributeName: 'opacity', values: `${op0};0`, dur, begin, repeatCount: 'indefinite', calcMode: 'spline', keyTimes: '0;1', keySplines: '.15 .6 .35 1' }));
  if (sp && m) { g.push(ring('s0', big ? 9 : 4.5, big ? 62 : 12, 0.65, '3.2s', '0s')); g.push(ring('s1', big ? 9 : 4.5, big ? 62 : 12, 0.65, '3.2s', '1.6s')); }
  else if (air && m) g.push(ring('air', big ? 9 : 4.5, big ? 48 : 11, 0.42, '6s', '0s'));
  else if (sp) g.push(h('circle', { key: 'ss', cx, cy, r: big ? 15 : 6.5, fill: 'none', stroke: LIL, strokeOpacity: 0.32, strokeWidth: 1, vectorEffect: 'non-scaling-stroke' }));
  g.push(h('circle', { key: 'halo', cx, cy, r: big ? 6 + lvl * 3 : (air || sp ? 3.6 : 3.2), fill: LIL, opacity: 0.4 + lvl * 0.3 + (air ? 0.15 : 0), filter: `url(#${id}bl)` }));
  g.push(h('circle', { key: 'dot', cx, cy, r: big ? 2.2 : 1.7, fill: LILL }));
  const svgStyle = big ? { position: 'absolute', inset: 0, width: '100%', height: '100%' } : { position: 'absolute', left: '12%', top: '12%', width: '76%', height: '76%' };
  const kids = big ? tex(size, { stone: 0.1, contour: 0.08, grain: 0.07 }) : [];
  kids.push(h('svg', { key: 'svg', viewBox: big ? '0 0 100 100' : '0 0 24 24', style: svgStyle }, g));
  return h('div', { style: { position: 'relative', width: size, height: size, borderRadius: r, overflow: 'hidden', flex: 'none', background: 'radial-gradient(85% 75% at 50% 64%, #1E1B27 0%, #111013 55%, #070708 100%)', boxShadow: o.shadow || `0 0 0 1px ${LA(air || sp ? 0.28 : 0.14)}` } }, kids);
}

function eq(m, c) {
  c = c || '#FFFFFF';
  return h('span', { style: { display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 11 } }, [0, 1, 2].map(i =>
    h('span', { key: i, className: 'pg-anim', style: { width: 1.5, height: 11, background: c, boxShadow: '0 0 4px rgba(255,255,255,0.8)', transformOrigin: 'bottom', transform: m ? undefined : `scaleY(${[0.6, 1, 0.45][i]})`, animation: m ? `pg-eq ${0.9 + i * 0.25}s ease-in-out ${-i * 0.3}s infinite` : 'none' } })));
}
function skel(w, ht, r, m, round) {
  return h('div', { className: 'pg-anim', style: { width: w, height: ht, flex: 'none', borderRadius: round ? '50%' : r, background: 'linear-gradient(100deg, #121214 30%, #222226 50%, #121214 70%)', backgroundSize: '250% 100%', animation: m ? 'pg-shimmer 2.8s ease-in-out infinite' : 'none' } });
}
// mix skeleton: four shimmer cells, hinting at the mosaic to come
function skelMix(size, m) {
  return h('div', { style: { width: size, height: size, flex: 'none', borderRadius: radiusFor(size), overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 } }, [0, 1, 2, 3].map(i => h('div', { key: i, className: 'pg-anim', style: { background: 'linear-gradient(100deg, #121214 30%, #1E1E21 50%, #121214 70%)', backgroundSize: '250% 100%', animation: m ? `pg-shimmer 2.8s ease-in-out ${-i * 0.18}s infinite` : 'none' } })));
}
function skelRadio(size, m) {
  return h('div', { style: { position: 'relative', width: size, height: size, flex: 'none', borderRadius: radiusFor(size), background: '#101012', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
    h('div', { style: { position: 'absolute', width: size * 0.54 + size * 0.17, height: size * 0.54 + size * 0.17, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.08)' } }), skel(size * 0.54, size * 0.54, 0, m, true));
}

const svgI = (kids, o) => h('svg', Object.assign({ width: '1em', height: '1em', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.25, strokeLinecap: 'round', strokeLinejoin: 'round', style: { display: 'block', overflow: 'visible' } }, o || {}), kids);
const ICX = {
  radio: () => svgI([h('circle', { key: 1, cx: 12, cy: 12, r: 8, strokeOpacity: 0.5 }), h('circle', { key: 2, cx: 12, cy: 12, r: 3.2 }), h('circle', { key: 3, cx: 17.66, cy: 6.34, r: 1.6, fill: 'currentColor', stroke: 'none' })]),
  spark: () => svgI([h('path', { key: 1, d: 'M12 3.5c.6 4.6 3.9 7.9 8.5 8.5-4.6.6-7.9 3.9-8.5 8.5-.6-4.6-3.9-7.9-8.5-8.5 4.6-.6 7.9-3.9 8.5-8.5z' })]),
  save: () => svgI([h('path', { key: 1, d: 'M4 6h11' }), h('path', { key: 2, d: 'M4 11h11' }), h('path', { key: 3, d: 'M4 16h7' }), h('path', { key: 4, d: 'M17.5 13v7' }), h('path', { key: 5, d: 'M14 16.5h7' })]),
  dj: (on) => svgI([h('path', { key: 1, d: 'M2 16.5h20', strokeOpacity: 0.45 }), h('path', { key: 2, d: 'M7.5 16.5a4.5 4.5 0 0 1 9 0' }), h('path', { key: 3, d: 'M3.5 16.5a8.5 8.5 0 0 1 17 0', strokeOpacity: on ? 1 : 0.55 }), h('circle', { key: 4, cx: 12, cy: 16.5, r: 1.7, fill: 'currentColor', stroke: 'none', style: { filter: on ? 'drop-shadow(0 0 3px rgba(198,180,242,0.95))' : 'none' } })]),
};
// slow breathing glow for "alive" tiles (DJ on air, now playing)
function alive(r, color, m, dur) {
  if (!m) return null;
  return h('span', { className: 'pg-anim', style: { position: 'absolute', inset: -1, borderRadius: r, boxShadow: `0 0 26px -6px ${color}`, animation: `pg-breathe ${dur || 5.5}s ease-in-out infinite`, pointerEvents: 'none' } });
}

const mixById = id => MIXES.find(x => x.id === id);
const radioById = id => RADIOS.find(x => x.id === id) || RADIOS_EARLY.find(x => x.id === id);
// small art for a Jump back in tile
function tileArt(t, size, m) {
  if (t.kind === 'album') return cover(size, t.k, 8);
  if (t.kind === 'daily') return mixCover(size, mixById(t.mix), { r: 8 });
  if (t.kind === 'radio') return radioArt(size, radioById(t.radio), { r: 8, m });
  if (t.kind === 'artist') return avatar(size, ARTISTS[t.artist]);
  if (t.kind === 'smart') return h('div', { style: { position: 'relative', width: size, height: size, flex: 'none' } }, mosaic(size, SMART[t.smart].covers, 8), h('span', { style: { position: 'absolute', right: -3, bottom: -3, width: 18, height: 18, borderRadius: '50%', background: '#161618', boxShadow: '0 0 0 2px #0B0B0C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#EDEDED' } }, ICX.spark()));
  return mosaic(size, t.covers, 8);
}

return { ART, LUM, AL, LIL, LILL, LA, MONO, MIXES, RADIOS, RADIOS_EARLY, ARTISTS, ARTISTS_EARLY, SMART, RECENT, REDIS_AL, PLAYLISTS, JBI, JBI_EARLY, TRACKS, Q,
  mixCover, radioArt, avatar, mosaic, cover, djMark, eq, skel, skelMix, skelRadio, ICX, alive, tileArt, mixById, radioById };
};
