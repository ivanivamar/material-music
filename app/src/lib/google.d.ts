/** The slice of Google Identity Services (accounts.google.com/gsi/client) that Pelagic uses. */
declare namespace google.accounts.oauth2 {
  interface TokenResponse {
    access_token: string
    expires_in: number | string
    scope: string
    token_type: string
    error?: string
    error_description?: string
  }
  interface ClientConfigError {
    type: 'popup_failed_to_open' | 'popup_closed' | 'unknown'
    message?: string
  }
  interface TokenClientConfig {
    client_id: string
    scope: string
    callback: (resp: TokenResponse) => void
    error_callback?: (err: ClientConfigError) => void
    include_granted_scopes?: boolean
    prompt?: string
    login_hint?: string
  }
  interface OverridableTokenClientConfig {
    prompt?: '' | 'none' | 'consent' | 'select_account'
    login_hint?: string
  }
  interface TokenClient {
    requestAccessToken(override?: OverridableTokenClientConfig): void
  }
  function initTokenClient(config: TokenClientConfig): TokenClient
  /** Authorization-code flow (popup): the code goes to the site's token helper (functions/api/auth). */
  interface CodeResponse {
    code?: string
    scope?: string
    error?: string
    error_description?: string
  }
  interface CodeClientConfig {
    client_id: string
    scope: string
    ux_mode?: 'popup' | 'redirect'
    include_granted_scopes?: boolean
    select_account?: boolean
    login_hint?: string
    callback: (resp: CodeResponse) => void
    error_callback?: (err: ClientConfigError) => void
  }
  interface CodeClient {
    requestCode(): void
  }
  function initCodeClient(config: CodeClientConfig): CodeClient
  function hasGrantedAllScopes(resp: TokenResponse, ...scopes: string[]): boolean
  function revoke(token: string, done?: () => void): void
}
