/**
 * Material ripple on press (port of the handoff's ripple.js): one capture-phase pointerdown listener.
 * It finds the nearest clickable "box" (cursor:pointer + a background, border, shadow or shape),
 * follows its shape (border-radius or clip-path) and expands a currentColor circle from the press point.
 * Off when motion is reduced (in-app Motion setting or the OS setting).
 */
const shaped = (cs: CSSStyleDeclaration) =>
  cs.clipPath !== 'none' || parseFloat(cs.borderTopLeftRadius) > 0 || parseFloat(cs.borderBottomRightRadius) > 0

function isBox(el: Element, cs: CSSStyleDeclaration) {
  if (cs.display === 'inline') return false
  const bg = cs.backgroundColor
  const hasBg = !!bg && bg !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(bg)
  if (!(hasBg || cs.backgroundImage !== 'none' || cs.boxShadow !== 'none' || parseFloat(cs.borderTopWidth) > 0 || shaped(cs))) return false
  if (!el.textContent?.trim() && el.querySelector('img,canvas,video')) return false
  return true
}

function shapeSource(el: HTMLElement, r: DOMRect): HTMLElement {
  if (shaped(getComputedStyle(el))) return el
  let q = Array.from(el.children) as HTMLElement[]
  for (let depth = 0; q.length && depth < 3; depth++) {
    const next: HTMLElement[] = []
    for (const c of q) {
      const cr = c.getBoundingClientRect()
      if (Math.abs(cr.width - r.width) < 3 && Math.abs(cr.height - r.height) < 3 && shaped(getComputedStyle(c))) return c
      next.push(...(Array.from(c.children) as HTMLElement[]))
    }
    q = next
  }
  return el
}

function reduced() {
  const m = document.documentElement.dataset.motion
  if (m === 'reduced') return true
  if (m === 'full') return false
  return matchMedia('(prefers-reduced-motion: reduce)').matches
}

let installed = false
export function installRipple() {
  if (installed || typeof document === 'undefined') return
  installed = true
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button > 0 || reduced()) return
      let el = e.target as HTMLElement | null
      while (el && el !== document.body) {
        if (el.nodeType === 1 && !/^(SPAN|I|IMG|SVG|PATH|B|STRONG|EM|INPUT|TEXTAREA|SELECT)$/i.test(el.tagName)) {
          const cs = getComputedStyle(el)
          if (cs.cursor === 'pointer' && !el.hasAttribute('data-no-ripple') && isBox(el, cs)) break
        }
        el = el.parentElement
      }
      if (!el || el === document.body) return
      const r = el.getBoundingClientRect()
      if (r.width * r.height > 150000 || r.width < 8) return
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative'
      const src = shapeSource(el, r)
      const sc = getComputedStyle(src)
      const w = document.createElement('span')
      w.className = 'mm-ripple'
      w.style.borderRadius = sc.borderRadius
      if (sc.clipPath !== 'none') {
        w.style.clipPath = sc.clipPath
        if (src !== el && sc.transform !== 'none') w.style.transform = sc.transform
      }
      const d = Math.max(Math.hypot(Math.max(e.clientX - r.left, r.right - e.clientX), Math.max(e.clientY - r.top, r.bottom - e.clientY)), 20) * 2
      const c = document.createElement('span')
      c.style.cssText = `left:${e.clientX - r.left}px;top:${e.clientY - r.top}px;width:${d}px;height:${d}px`
      w.appendChild(c)
      el.appendChild(w)
      setTimeout(() => w.remove(), 620)
    },
    true,
  )
}
