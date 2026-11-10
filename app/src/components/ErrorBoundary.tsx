/**
 * Error boundaries: a component that throws while rendering no longer blanks the whole app.
 *
 *   <ErrorBoundary>          the React mechanism: catches the error, logs it, shows `fallback`
 *   <PageError>              fallback for one page inside the shell (the player and sidebar stay up)
 *   <AppError>               last resort, full screen (the shell itself failed)
 *
 * Playback lives outside React (state/player.ts + the engine), so music keeps playing either way.
 * `resetKey` clears the error when it changes (the route): going to another page recovers by itself.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button, EmptyState } from './ui'

interface Props {
  fallback: (error: Error, reset: () => void) => ReactNode
  /** when this changes, a shown error is dropped and the children are tried again */
  resetKey?: string
  children: ReactNode
}

interface State {
  error: Error | null
  /** the resetKey the current error (if any) belongs to */
  key: string | undefined
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey === state.key ? null : { error: null, key: props.resetKey }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[material-music] render error', error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    return this.state.error ? this.props.fallback(this.state.error, this.reset) : this.props.children
  }
}

const reload = () => window.location.reload()

/** A page failed: shown in its place, inside the shell. */
export function PageError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert">
      <EmptyState
        icon="alert"
        title="This page ran into a problem"
        body={
          <>
            The rest of the app still works. Try the page again, or reload if it keeps happening.
            <br />
            <code>{error.message || 'Unknown error'}</code>
          </>
        }
        actions={
          <>
            <Button variant="brand" onClick={reset}>
              Try again
            </Button>
            <Button variant="outlined" onClick={reload}>
              Reload
            </Button>
          </>
        }
      />
    </div>
  )
}

/** The whole app failed to render: plain full-screen message (uses nothing that could fail again). */
export function AppError({ error }: { error: Error }) {
  return (
    <div className="scr" role="alert">
      <div className="scr-center">
        <div className="scr-copy">
          <h1 className="scr-title">Something went wrong</h1>
          <p className="scr-body">Material Music hit an error it couldn’t recover from. Reloading usually fixes it; your library and queue are saved.</p>
        </div>
        <div className="scr-btns">
          <Button variant="brand" size="lg" onClick={reload}>
            Reload
          </Button>
        </div>
        <div className="scr-meta scr-error">{error.message || 'Unknown error'}</div>
      </div>
    </div>
  )
}
