/**
 * GSAP set-up, in one place: plugins are registered once, and the app's own curves are available as
 * named eases so GSAP motion matches the CSS transitions around it.
 *
 * GSAP doesn't follow the in-app Motion setting by itself (CSS does, through .pg-anim): callers
 * check useMotion() and use gsap.set() instead of a tween when motion is off.
 */
import { gsap } from 'gsap'
import { CustomEase } from 'gsap/CustomEase'
import { InertiaPlugin } from 'gsap/InertiaPlugin'

gsap.registerPlugin(CustomEase, InertiaPlugin)

/** --ease in tokens.css: cubic-bezier(.31, .94, .34, 1) */
export const EASE = CustomEase.create('pg-ease', 'M0,0 C0.31,0.94 0.34,1 1,1')
/** shared-element move (cover flight): gentle start, long soft landing */
export const EASE_MOVE = CustomEase.create('pg-move', 'M0,0 C0.3,0 0.1,1 1,1')

export { gsap }
