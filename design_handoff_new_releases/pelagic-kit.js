window.PelagicKit = function (h) {
const svgUri = s => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
const GRAIN = svgUri('<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>');
const STONE = svgUri('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><filter id="s" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves="5" seed="3" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 1.6 0 0 0 -0.62"/></filter><rect width="100%" height="100%" filter="url(#s)"/></svg>');
const CONTOUR = svgUri('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200"><filter id="c" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.0022" numOctaves="2" seed="8"/><feComponentTransfer><feFuncR type="discrete" tableValues="0 .1 .2 .3 .4 .5 .6 .7 .8 .9 1"/></feComponentTransfer><feConvolveMatrix order="3" kernelMatrix="0 -1 0 -1 4 -1 0 -1 0" preserveAlpha="true"/><feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 9 0 0 0 0"/></filter><rect width="100%" height="100%" filter="url(#c)"/></svg>');

function crPath(pts, closed) {
  const n = pts.length, g = i => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  let d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
  const end = closed ? n : n - 1;
  for (let i = 0; i < end; i++) {
    const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
    d += ' C' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + ' ' + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1) + ' ' + (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + ' ' + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1) + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
  }
  return d + (closed ? 'Z' : '');
}
function contourSvg(W, H, animated) {
  const out = [];
  const ring = (cx, cy, r, k, ph, sc) => {
    const pts = [];
    for (let a = 0; a < 36; a++) {
      const t = a / 36 * Math.PI * 2;
      const w = sc * (1 + 0.16 * Math.sin(t * 2 + ph + k * 0.12) + 0.08 * Math.sin(t * 3 - ph * 1.7 + k * 0.2) + 0.04 * Math.sin(t * 5 + k * 0.3));
      pts.push([cx + Math.cos(t) * r * w * 1.35, cy + Math.sin(t) * r * w]);
    }
    return crPath(pts, true);
  };
  const peak = (cx, cy, rings, r0, step, ph) => {
    for (let k = 0; k < rings; k++) {
      const r = r0 + k * step, A = ring(cx, cy, r, k, ph, 1);
      if (!animated) { out.push('<path d="' + A + '"/>'); continue; }
      const B = ring(cx, cy, r, k, ph + 0.55 + k * 0.03, 1.025);
      out.push('<path d="' + A + '"><animate attributeName="d" dur="26s" repeatCount="indefinite" values="' + A + ';' + B + ';' + A + '" keyTimes="0;0.5;1" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1"/></path>');
    }
  };
  peak(W * 0.78, H * 0.3, 11, 26, 30, 0.8);
  peak(W * 0.16, H * 0.82, 8, 20, 32, 2.4);
  peak(W * 0.3, H * 0.24, 5, 14, 24, 4.1);
  peak(W * 0.62, H * 0.86, 4, 12, 22, 5.6);
  return svgUri('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '"><g fill="none" stroke="#FFFFFF" stroke-width="1" stroke-linecap="round">' + out.join('') + '</g></svg>');
}
const CONTOUR_SMOOTH = contourSvg(1600, 1000, false);
const CONTOUR_LIVE = contourSvg(1600, 1000, true);
const P = {
  playF: [['path', { d: 'M8 5.8v12.4a.8.8 0 0 0 1.2.7l10-6.2a.8.8 0 0 0 0-1.4l-10-6.2A.8.8 0 0 0 8 5.8z', fill: 'currentColor', stroke: 'none' }]],
  pauseF: [['rect', { x: 7, y: 5, width: 3, height: 14, rx: 0.8, fill: 'currentColor', stroke: 'none' }], ['rect', { x: 14, y: 5, width: 3, height: 14, rx: 0.8, fill: 'currentColor', stroke: 'none' }]],
  prev: [['path', { d: 'M18 6.5v11a.6.6 0 0 1-.9.5L9 12.5a.6.6 0 0 1 0-1L17.1 6a.6.6 0 0 1 .9.5z', fill: 'currentColor', stroke: 'none' }], 'M6 6v12'],
  next: [['path', { d: 'M6 6.5v11a.6.6 0 0 0 .9.5L15 12.5a.6.6 0 0 0 0-1L6.9 6a.6.6 0 0 0-.9.5z', fill: 'currentColor', stroke: 'none' }], 'M18 6v12'],
  shuffle: ['M4 7h3c4.5 0 5.5 10 10 10h3', 'M4 17h3c1.6 0 2.7-1.3 3.6-3', 'M13.4 10c.9-1.7 2-3 3.6-3h3', 'M17.5 4.5 20 7l-2.5 2.5', 'M17.5 14.5 20 17l-2.5 2.5'],
  repeat: ['M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20', 'M17 3l3 3-3 3', 'M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4', 'M7 21l-3-3 3-3'],
  home: ['M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z'],
  library: ['M5 4v16', 'M9.5 4v16', 'M14 5l5 14.5'],
  search: [['circle', { cx: 11, cy: 11, r: 6.5 }], 'M20 20l-4.3-4.3'],
  newr: [['circle', { cx: 12, cy: 12, r: 2.5 }], ['circle', { cx: 12, cy: 12, r: 7 }], 'M12 2v2M12 20v2'],
  upload: ['M12 15V4', 'M7.5 8.5 12 4l4.5 4.5', 'M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15'],
  download: ['M12 4v11', 'M7.5 10.5 12 15l4.5-4.5', 'M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15'],
  check: [['circle', { cx: 12, cy: 12, r: 8.5 }], 'M8.5 12.3l2.4 2.4 4.6-5'],
  cloud: ['M7.5 18h9.5a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 6.9 9.6 4.2 4.2 0 0 0 7.5 18z'],
  queue: ['M4 6h16', 'M4 11h16', 'M4 16h8', ['path', { d: 'M15.5 14v6l5-3z', fill: 'currentColor', stroke: 'none' }]],
  lyrics: ['M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z', 'M8 9h8', 'M8 12h5'],
  volume: ['M4 9.5v5h3.5L12 18V6L7.5 9.5z', 'M15.5 9a4 4 0 0 1 0 6', 'M18 6.5a7.5 7.5 0 0 1 0 11'],
  heart: ['M12 19.5s-7-4.3-7-9.6A3.9 3.9 0 0 1 12 7.6a3.9 3.9 0 0 1 7 2.3c0 5.3-7 9.6-7 9.6z'],
  heartF: [['path', { d: 'M12 19.5s-7-4.3-7-9.6A3.9 3.9 0 0 1 12 7.6a3.9 3.9 0 0 1 7 2.3c0 5.3-7 9.6-7 9.6z', fill: 'currentColor' }]],
  more: [['circle', { cx: 5.5, cy: 12, r: 1.1, fill: 'currentColor', stroke: 'none' }], ['circle', { cx: 12, cy: 12, r: 1.1, fill: 'currentColor', stroke: 'none' }], ['circle', { cx: 18.5, cy: 12, r: 1.1, fill: 'currentColor', stroke: 'none' }]],
  chevD: ['M6 9.5l6 6 6-6'], chevL: ['M14.5 6l-6 6 6 6'], chevR: ['M9.5 6l6 6-6 6'], chevU: ['M6 14.5l6-6 6 6'],
  plus: ['M12 5v14', 'M5 12h14'],
  clock: [['circle', { cx: 12, cy: 12, r: 8.5 }], 'M12 7.5V12l3 2'],
  playlist: ['M4 6h11', 'M4 11h11', 'M4 16h6', ['circle', { cx: 16.5, cy: 17, r: 2.5 }], 'M19 17V7.5l2-1'],
  offline: ['M3 3l18 18', 'M8.5 8.6A9 9 0 0 0 3.5 10', 'M20.5 10a9 9 0 0 0-6-2.4', 'M6.5 13.5a6 6 0 0 1 5.5-1.6', 'M12 18.5h.01'],
  x: ['M6 6l12 12', 'M18 6 6 18'],
  drag: ['M5 9h14', 'M5 15h14'],
  grid: [['rect', { x: 4, y: 4, width: 7, height: 7, rx: 2 }], ['rect', { x: 13, y: 4, width: 7, height: 7, rx: 2 }], ['rect', { x: 4, y: 13, width: 7, height: 7, rx: 2 }], ['rect', { x: 13, y: 13, width: 7, height: 7, rx: 2 }]],
};
function icon(n) {
  return h('svg', { width: '1em', height: '1em', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.25, strokeLinecap: 'round', strokeLinejoin: 'round', style: { display: 'block' } },
    P[n].map((x, i) => typeof x === 'string' ? h('path', { key: i, d: x }) : h(x[0], { key: i, ...x[1] })));
}

Object.assign(P, {
  refresh: ['M19.5 12a7.5 7.5 0 1 1-2.2-5.3', 'M19.5 4.5v3.2h-3.2'],
  bell: ['M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5h-14z', 'M10 20.5a2 2 0 0 0 4 0'],
  bellF: [['path', { d: 'M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5h-14z', fill: 'currentColor' }], 'M10 20.5a2 2 0 0 0 4 0'],
  ext: ['M13.5 5.5h5v5', 'M18.5 5.5 11 13', 'M17 13.5v4a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4'],
  eye: ['M2.8 12S6.2 6 12 6s9.2 6 9.2 6-3.4 6-9.2 6-9.2-6-9.2-6z', ['circle', { cx: 12, cy: 12, r: 2.6 }]],
  gear: [['circle', { cx: 12, cy: 12, r: 2.8 }], 'M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6'],
  cog: [['circle', { cx: 12, cy: 12, r: 2.8 }], 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'],
  alert: [['circle', { cx: 12, cy: 12, r: 8.5 }], 'M12 7.8v5', 'M12 16.2h.01'],
  mute: ['M4 9.5v5h3.5L12 18V6L7.5 9.5z', 'M16 9.5l5 5', 'M21 9.5l-5 5'],
});
const IC = {}; Object.keys(P).forEach(k => IC[k] = icon(k));
return { IC, GRAIN, STONE, CONTOUR_SMOOTH, CONTOUR_LIVE, svgUri };
};
