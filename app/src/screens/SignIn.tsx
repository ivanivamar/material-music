/**
 * Sign-in (handoff 06 Desktop Sign-in) and its "Session expired" variant (FirstRun 03).
 */
import { useEffect } from 'react'
import { Atmosphere } from '../components/Atmosphere'
import { PortholeMark } from '../components/Logo'
import { preloadGoogle, sessionStore, useSession } from '../state/session'
import './screens.css'

export function SignIn({ expired = false }: { expired?: boolean }) {
  const s = useSession()
  useEffect(preloadGoogle, [])

  return (
    <main className="scr scr-deep">
      <Atmosphere fixed seed={5} />
      {expired && <div className="scr-tag">SESSION EXPIRED</div>}
      <div className="scr-center signin">
        {expired ? (
          <>
            <div className="expired-mark" aria-hidden>
              <PortholeMark size={104} />
            </div>
            <div className="scr-copy">
              <h1 className="scr-title">You drifted out of range.</h1>
              <p className="scr-body">Your Google session expired. Sign in again to pick up where you left off.</p>
            </div>
          </>
        ) : (
          <div className="signin-lockup">
            <PortholeMark size={132} />
            <h1 className="signin-word">Pelagic</h1>
            <p className="signin-tagline">Your own library, from far below the surface.</p>
          </div>
        )}

        <div className="signin-actions">
          <button type="button" className="gbtn" onClick={() => sessionStore.signIn()} disabled={s.pending}>
            <span className="gbtn-g" aria-hidden>G</span>
            {s.pending ? 'Signing in…' : expired ? 'Sign in again' : 'Continue with Google'}
          </button>
          {expired && (
            <button type="button" className="scr-link" onClick={() => sessionStore.signIn({ switchAccount: true })} disabled={s.pending}>
              Use another account
            </button>
          )}
          <p className={`signin-error ${s.error ? 'is-shown' : ''}`} role="alert">
            {s.error ?? ''}
          </p>
        </div>
      </div>

      <div className="scr-foot">
        {expired ? (
          <span>{(s.account?.email ?? '').toUpperCase()}</span>
        ) : (
          <span>PERSONAL LIBRARY · 1 LISTENER</span>
        )}
        <span>FLAC · GOOGLE DRIVE</span>
      </div>
    </main>
  )
}
