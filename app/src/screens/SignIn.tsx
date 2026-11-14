/**
 * Sign-in and its "Session expired" variant.
 */
import { useEffect } from 'react'
import { AppMark } from '../components/Logo'
import { Atmosphere } from '../components/Atmosphere'
import { Icon } from '../design/icons'
import { preloadGoogle, sessionStore, useSession } from '../state/session'
import { useIsPhone } from '../state/viewport'
import { Button } from '../components/ui'

export function SignIn({ expired = false }: { expired?: boolean }) {
  const s = useSession()
  const phone = useIsPhone()
  useEffect(preloadGoogle, [])

  return (
    <main className={`scr scr-deep ${phone ? 'is-phone' : ''}`}>
      <Atmosphere fixed seed={5} />
      <div className="scr-panel">
        {expired && (
          <div className="scr-top">
            <span className="scr-tag">SESSION EXPIRED</span>
            <div className="scr-top-r">
              {s.account?.email && <span className="scr-meta">{s.account.email}</span>}
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
              <AppMark size={112} />
              <div className="signin-titles">
                <h1 className="signin-word">PELAGIC</h1>
                <p className="signin-tagline">Your own library, from far below the surface.</p>
              </div>
            </div>
          )}

          <div className="signin-actions">
            <Button variant="brand" size="xl" className="gbtn" onClick={() => sessionStore.signIn()} disabled={s.pending}>
              <span className="gbtn-g" aria-hidden>
                G
              </span>
              {s.pending ? 'Signing in…' : expired ? 'Sign in again' : 'Continue with Google'}
            </Button>
            {expired ? (
              <>
                <Button variant="ghost" size="sm" className="scr-link" onClick={() => sessionStore.signIn({ switchAccount: true })} disabled={s.pending}>
                  Use another account
                </Button>
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
