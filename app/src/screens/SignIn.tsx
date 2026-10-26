/**
 * Sign-in and its "Session expired" variant (Material 3 Expressive redesign, FirstRunMaterial.dc.html).
 */
import { useEffect } from 'react'
import { AppMark } from '../components/Logo'
import { Icon } from '../design/icons'
import { preloadGoogle, sessionStore, useSession } from '../state/session'
import { useIsPhone } from '../state/viewport'
import './screens.css'

export function SignIn({ expired = false }: { expired?: boolean }) {
  const s = useSession()
  const phone = useIsPhone()
  useEffect(preloadGoogle, [])

  return (
    <main className={`scr ${phone ? 'is-phone' : ''}`}>
      <div className="scr-panel">
        <div className="scr-glow" aria-hidden />
        <div className="shell-deco" aria-hidden>
          <i className="sd-dots" />
          <i className="sd-ring sd-r1" />
          <i className="sd-ring sd-r2" />
          <i className="sd-ring sd-r3" />
        </div>

        {expired && (
          <div className="scr-top">
            {!phone ? (
              <div className="scr-brand">
                <AppMark size={32} />
                <span>Material Music</span>
              </div>
            ) : (
              <span />
            )}
            <div className="scr-top-r">
              <span className="scr-pill">Session expired</span>
            </div>
          </div>
        )}

        <div className={`scr-center ${expired ? 'is-expired' : 'signin'}`}>
          {expired ? (
            <>
              <div className="expired-tile" aria-hidden>
                <Icon name="lockClock" size={36} />
              </div>
              <div className="scr-copy">
                <h1 className="scr-title">Your session expired</h1>
                <p className="scr-body">Sign in with Google again to pick up where you left off. Downloaded music still plays.</p>
              </div>
            </>
          ) : (
            <div className="signin-lockup">
              <AppMark size={96} />
              <div className="signin-titles">
                <h1 className="signin-word">Material Music</h1>
                <p className="signin-tagline">Your own library, from far below the surface.</p>
              </div>
            </div>
          )}

          <div className="signin-actions">
            <button type="button" className="gbtn" onClick={() => sessionStore.signIn()} disabled={s.pending}>
              <span className="gbtn-g" aria-hidden>
                G
              </span>
              {s.pending ? 'Signing in…' : expired ? 'Sign in again' : 'Continue with Google'}
            </button>
            {expired ? (
              <>
                <button type="button" className="scr-link" onClick={() => sessionStore.signIn({ switchAccount: true })} disabled={s.pending}>
                  Use another account
                </button>
                {s.account?.email && <div className="signin-sub">{s.account.email}</div>}
              </>
            ) : (
              <div className="signin-sub">One listener. Nothing to set up on a server.</div>
            )}
            <p className={`signin-error ${s.error ? 'is-shown' : ''}`} role="alert">
              {s.error ?? ''}
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
