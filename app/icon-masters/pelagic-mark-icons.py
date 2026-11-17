import math, json
def oklch(L,C,h):
    a=C*math.cos(math.radians(h)); b=C*math.sin(math.radians(h))
    l_=L+0.3963377774*a+0.2158037573*b; m_=L-0.1055613458*a-0.0638541728*b; s_=L-0.0894841775*a-1.2914855480*b
    l,m,s=l_**3,m_**3,s_**3
    r=4.0767416621*l-3.3077115913*m+0.2309699292*s; g=-1.2684380046*l+2.6097574011*m-0.3413193965*s; bb=-0.0041960863*l-0.7034186147*m+1.7076147010*s
    f=lambda x: max(0,min(1,x)); enc=lambda x: 12.92*x if x<=0.0031308 else 1.055*x**(1/2.4)-0.055
    return '#%02x%02x%02x'%tuple(round(f(enc(f(v)))*255) for v in (r,g,bb))
H=215
C={'f0':oklch(.78,.1,H),'f1':oklch(.64,.12,H),'f2':oklch(.42,.11,H),'glow':oklch(.7,.13,H),'pt':oklch(.9,.12,H),'tile0':oklch(.3,.08,H),'tile1':'#050608','halo':oklch(.5,.12,H)}
print(json.dumps(C))
D=('M40 100 V46 C40 28 52 15 70 14 C88 13 98 23 96 37 C94 51 80 60 64 61.5 C60 62 56 61.5 53 61 V95 '
   'C59 95 66 92 70.5 86 C74 81 74.5 76 72.5 71.5 A3 3 0 0 1 77.5 69.5 C82 75 83 83 80 90 '
   'C76 100 63 108 48 108.5 Q40 108.5 40 100 Z')
# mark bbox approx x 40..96(+), y 13..108.5 → centre (68,61) ; use viewBox crop like the tile: '14 7 108 108'
def mark(scale_box, mono=False, glow=True, small=False):
    # returns <g> drawing the mark into a 0..1024 box occupying `scale_box` fraction, centred
    s=1024*scale_box/108; ox=512-(14+54)*s; oy=512-(7+54)*s
    r_hole=11 if small else 9.5; r_pt=5.5 if small else 4.2
    if mono:
        return f'''<g transform="translate({ox:.2f} {oy:.2f}) scale({s:.4f})"><path d="{D}" fill="#fff" mask="url(#hole)"/><circle cx="69" cy="37.5" r="{r_pt}" fill="#fff"/></g>''', r_hole
    g=f'filter="url(#glow)"' if glow else ''
    return f'''<g transform="translate({ox:.2f} {oy:.2f}) scale({s:.4f})"><g {g}><path d="{D}" fill="url(#fill)" mask="url(#hole)"/></g><circle cx="69" cy="37.5" r="{r_pt}" fill="#fff" filter="url(#pt)"/></g>''', r_hole
def svg(kind):
    bg=''; inner=''
    defs_tile=f'''<radialGradient id="tile" cx="512" cy="307" r="820" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="{C['tile0']}"/><stop offset=".8" stop-color="{C['tile1']}"/></radialGradient>
<linearGradient id="hi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset=".04" stop-color="#fff" stop-opacity="0"/></linearGradient>'''
    if kind=='rounded':   # any-purpose icon: tile with 30% corners, transparent outside
        bg=f'<rect width="1024" height="1024" rx="230" fill="url(#tile)"/><rect width="1024" height="1024" rx="230" fill="url(#hi)"/>'; m,rh=mark(.82)
    elif kind=='circle':
        bg=f'<circle cx="512" cy="512" r="512" fill="url(#tile)"/><circle cx="512" cy="512" r="512" fill="url(#hi)"/>'; m,rh=mark(.74)
    elif kind=='full':    # full-bleed (maskable, apple-touch): mark inside the 60% safe zone
        bg=f'<rect width="1024" height="1024" fill="url(#tile)"/>'; m,rh=mark(.62)
    elif kind=='fg':      # adaptive foreground: transparent, safe zone 66/108
        m,rh=mark(.6)
    elif kind=='mono':
        m,rh=mark(.6,mono=True)
    elif kind=='bare':    # widget mark: no tile
        m,rh=mark(.96)
    elif kind=='small':   # favicon at 16–32px: bigger hole + point, no glow
        bg=f'<rect width="1024" height="1024" rx="230" fill="url(#tile)"/>'; m,rh=mark(.86,glow=False,small=True)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
<defs>{defs_tile}
<linearGradient id="fill" gradientUnits="userSpaceOnUse" x1="30" y1="10" x2="70" y2="112"><stop offset="0" stop-color="{C['f0']}"/><stop offset=".5" stop-color="{C['f1']}"/><stop offset="1" stop-color="{C['f2']}"/></linearGradient>
<mask id="hole" maskUnits="userSpaceOnUse" x="-10" y="-10" width="140" height="140"><rect x="-10" y="-10" width="140" height="140" fill="#fff"/><circle cx="69" cy="37.5" r="{rh}" fill="#000"/></mask>
<filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="5" result="b"/><feFlood flood-color="{C['glow']}" flood-opacity=".55"/><feComposite in2="b" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="pt" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur in="SourceAlpha" stdDeviation="1.6" result="b"/><feFlood flood-color="{C['pt']}"/><feComposite in2="b" operator="in"/><feMerge><feMergeNode/><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
{bg}{m}
</svg>'''
for k in ['rounded','circle','full','fg','mono','bare','small']:
    open(f'{k}.svg','w').write(svg(k))
