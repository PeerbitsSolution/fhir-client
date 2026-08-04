// Type-only: no implementation, so this repo has no code dependency on any specific token source.
// NEEDS HUMAN SECURITY REVIEW if you wire a real tokenProvider (storage/refresh/PKCE) — this client only consumes a token.
export type TokenProvider = () => string | Promise<string>;
