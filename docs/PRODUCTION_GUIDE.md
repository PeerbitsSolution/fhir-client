# Production Guide

This is guidance for **applications that consume** `fhir-client`
in production, not for maintaining this repo itself (that's
[CONTRIBUTING.md](../CONTRIBUTING.md)). Everything below describes behavior that
actually exists in the client today — see [src/client.ts](../src/client.ts) if you
want to verify any of it against the source directly.

## Table of contents

1. [Prerequisites](#1-prerequisites)
2. [Installing for production](#2-installing-for-production)
3. [Configuration reference & recommended production values](#3-configuration-reference--recommended-production-values)
4. [Authentication](#4-authentication)
5. [TLS / transport security](#5-tls--transport-security)
6. [Retries, backoff, and timeouts](#6-retries-backoff-and-timeouts)
7. [Error handling](#7-error-handling)
8. [Logging & observability](#8-logging--observability)
9. [CapabilityStatement checks before go-live](#9-capabilitystatement-checks-before-go-live)
10. [Server etiquette & rate limiting](#10-server-etiquette--rate-limiting)
11. [Runtime & deployment compatibility](#11-runtime--deployment-compatibility)
12. [Pre-go-live checklist](#12-pre-go-live-checklist)
13. [Versioning & upgrades](#13-versioning--upgrades)
14. [Troubleshooting](#14-troubleshooting)
15. [Support](#15-support)

---

## 1. Prerequisites

- **Node.js 20.12+** (or another runtime with a spec-compliant global `fetch` —
  Deno, Bun, and most edge/serverless runtimes qualify). This package is **ESM
  only** (`"type": "module"` in `package.json`); a CommonJS host must use
  `await import("fhir-client")`, not `require(...)`.
- An FHIR R4-compliant server reachable over `https://`. This client does not talk to
  DSTU2/STU3/R5 servers — field names and search parameters are grounded in R4
  specifically (see [README §5](../README.md#5-architecture)).
- If the server requires auth: a source of access tokens (e.g.
  [peerbits-smart-launch](https://github.com/peerbits/peerbits-smart-launch), your
  own OAuth2/SMART client, or a static service-account token) — see
  [§4 Authentication](#4-authentication).

## 2. Installing for production

```bash
npm install fhir-client
```

- **Pin a version range you've actually tested** (`^1.0.0` is fine once published;
  avoid `*`/`latest`). Commit your lockfile (`package-lock.json` / `pnpm-lock.yaml` /
  `yarn.lock`) so CI and production install the exact same dependency tree.
- This package has **zero required runtime dependencies** — nothing transitive to
  audit beyond this package itself. Run `npm audit` as part of your own CI regardless;
  it's cheap insurance.
- Dependabot and CodeQL run on this repo itself (weekly / on every push) — watch the
  [CHANGELOG](../CHANGELOG.md) for security-relevant releases.

## 3. Configuration reference & recommended production values

```ts
import { FhirClient } from "fhir-client";

const client = new FhirClient({
  baseUrl: process.env.FHIR_BASE_URL!,       // required, https:// enforced
  tokenProvider: getAccessToken,              // see §4
  retry: { attempts: 2, backoffMs: 300 },     // opt-in — off unless you set this
  capabilityCacheTtlMs: 10 * 60 * 1000,       // 10 min; default is 5 min
  debug: process.env.NODE_ENV !== "production", // avoid noisy logs in prod
});
```

| Option | Production recommendation |
|---|---|
| `baseUrl` | Load from environment/secret config, never hardcode. Must be `https://` — see [§5](#5-tls--transport-security). |
| `tokenProvider` | Wire to your real token source. Keep the function itself thin — token acquisition/refresh/storage belongs in your auth layer, not inline here. |
| `headers` | Use for server-specific requirements only (e.g. a tenant header some FHIR servers need). Don't put secrets here — they'd be indistinguishable from any other header if `debug` logging or a proxy captured them. `Authorization`/`Content-Type`/`Accept` are managed internally and can't be overridden this way. |
| `retry` | Enable it. It's off by default. Start with `{ attempts: 2, backoffMs: 300 }` and tune from real latency/error data — see [§6](#6-retries-backoff-and-timeouts). |
| `allowInsecureHttp` | **Never set this in production.** It exists solely for `http://localhost` sandbox testing. |
| `capabilityCacheTtlMs` | Default (5 min) is reasonable for most servers. Raise it if `/metadata` is slow or rate-limited; lower it if the server's capabilities change dynamically (rare). |
| `fetchFn` | Inject a wrapped `fetch` if you need timeouts, metrics, or distributed tracing — see [§6](#6-retries-backoff-and-timeouts) and [§8](#8-logging--observability). |
| `debug` | Off in production by default is fine; the redaction behavior (see [§8](#8-logging--observability)) makes it safe to enable temporarily for incident debugging if needed. |

## 4. Authentication

`tokenProvider` is a single function: `() => string | Promise<string>`, called before
**every** request. This client does not implement token storage, refresh, PKCE, or
any OAuth2/SMART flow — see [src/auth.ts](../src/auth.ts), which is a type
definition only, by design (so this repo has no code dependency on any specific auth
implementation).

**This means, in production, you are responsible for:**
- Acquiring and refreshing tokens (e.g. via
  [peerbits-smart-launch](https://github.com/peerbits/peerbits-smart-launch), your
  OAuth2 client library, or your platform's credential manager)
- Storing tokens securely (never in source, never logged — see [§8](#8-logging--observability))
- Handling token expiry — if `tokenProvider` returns a stale token, the request will
  fail with a `401`/`403` `FhirClientError` (see [§7](#7-error-handling)); your
  `tokenProvider` implementation should refresh proactively or on-demand before that
  happens

> **This is a security-critical code path.** Per this project's AI/security
> guardrails, any `tokenProvider` implementation — token storage, refresh logic,
> PKCE/state/nonce handling — needs human security review before it ships,
> independent of how confident any tooling's output looks.

If the target server doesn't require auth (e.g. the public HAPI sandbox), omit
`tokenProvider` entirely — no `Authorization` header is sent.

## 5. TLS / transport security

TLS is enforced by default. The `FhirClient` constructor throws immediately if
`baseUrl` isn't `https://` and `allowInsecureHttp` isn't explicitly `true`:

```
FhirClient requires an https:// baseUrl. Pass allowInsecureHttp: true only for
local sandbox testing against http:// — never in production.
```

There is no way to silence this check other than the explicit opt-out flag, and that
flag's name is deliberately loud so it can't be set by accident. Certificate
validation itself is handled by the runtime's `fetch` implementation (Node's
`undici`) using the OS/runtime trust store — this client doesn't add or bypass any
certificate logic.

## 6. Retries, backoff, and timeouts

**Retry is opt-in and off by default.** Set `retry: { attempts, backoffMs?,
retryOnStatus? }` to enable it:

- `attempts` — max retries *after* the initial try (e.g. `attempts: 2` means up to 3
  total attempts).
- `backoffMs` (default `250`) — base delay; actual delay is `backoffMs * 2^attemptNumber`
  (exponential). With the default, that's ~250ms, ~500ms, ~1000ms, ...
- `retryOnStatus` (default: any `5xx`) — network errors (e.g. DNS failure, connection
  reset) are always treated as retryable once `retry` is configured, regardless of
  this list. `4xx` responses are **never** retried automatically, even if listed here
  by mistake, since `shouldRetry` only consults `retryOnStatus` for non-2xx
  responses your server actually returned — a `404`/`401` won't be retried into a
  different outcome.
- If your server rate-limits with `429`, add it explicitly:
  `retryOnStatus: [429, 502, 503, 504]`.

**There is no built-in request timeout.** `fetch` (and this client) will wait
indefinitely for a response unless you add one yourself. Do this via `fetchFn`:

```ts
const fetchWithTimeout: typeof fetch = (url, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
};

const client = new FhirClient({ baseUrl, fetchFn: fetchWithTimeout });
```

An aborted request surfaces as a network error to this client's retry logic (i.e. it
counts toward `retry.attempts` like any other network failure).

## 7. Error handling

Every non-2xx response is thrown as a typed `FhirClientError`
(`instanceof Error`), never a raw HTTP error:

```ts
import { FhirClientError } from "fhir-client";

try {
  await client.update(patient);
} catch (error) {
  if (error instanceof FhirClientError) {
    // error.status      — the original HTTP status (e.g. 404, 409, 422)
    // error.severity     — worst OperationOutcome.issue[].severity present, or undefined
    // error.issues       — OperationOutcomeIssue[] (empty array if the server sent no OperationOutcome)
    // error.operationOutcome — the raw OperationOutcome, if one was present
    logger.warn("FHIR request failed", { status: error.status, issues: error.issues });
  } else {
    throw error; // not a FHIR-shaped failure — network error, bug, etc.
  }
}
```

If the server's error response has no `OperationOutcome` body, `issues` is `[]` and
`severity` is `undefined` — check `error.status` in that case, same as you would for
any HTTP client. This client never swallows the original status/body either way.

## 8. Logging & observability

- **`debug: true`** logs one line per request via `console.debug`:
  `METHOD <url> -> <status>`. Values for known patient-identifying search parameters
  (`name`, `given`, `family`, `identifier`, `birthdate`, `address*`, `telecom`,
  `email`, `phone`) are replaced with `[REDACTED]` in the logged URL. The
  `Authorization` header is **never** logged, under any configuration — there is no
  flag that exposes it.
- This is a minimal built-in logger, not a full observability integration. For
  request/response metrics, tracing spans, or structured logging beyond the redacted
  one-liner, wrap `fetchFn` (same pattern as the timeout example in
  [§6](#6-retries-backoff-and-timeouts)) — you own what gets logged there, so apply
  the same redaction discipline (never log the `Authorization` header or raw
  patient-identifying values) if you add your own logging in that wrapper.
- No token, credential, or resource body is ever written to logs by this client
  itself, at any log level.

## 9. CapabilityStatement checks before go-live

Before depending on a specific interaction (e.g. `search-type` on `Observation`, or
`delete` on `Patient`), confirm the target server actually supports it:

```ts
if (!(await client.supportsOperation("Observation", "search-type"))) {
  throw new Error("Target FHIR server does not support Observation search — check deployment config");
}
```

`fetchCapabilityStatement()` is cached in-memory per `FhirClient` instance
(`capabilityCacheTtlMs`, default 5 minutes) — cheap to call on every startup health
check without hammering `/metadata`.

If your target is Epic, Cerner, or the SMART Health IT sandbox, see
[VENDOR_COMPATIBILITY.md](./VENDOR_COMPATIBILITY.md) for what's already been checked
against each — connectivity and `CapabilityStatement` shape are confirmed there;
authenticated behavior still needs verifying against your own registered app.

## 10. Server etiquette & rate limiting

Public and shared FHIR servers (including the HAPI test server used in this repo's
own examples) can rate-limit or throttle under load. In production against any
shared/third-party server:

- Enable `retry` with `retryOnStatus` including `429` (see [§6](#6-retries-backoff-and-timeouts))
- Prefer batch/transaction Bundles (`BundleBuilder` + `executeBundle`) over many
  individual requests when creating/updating multiple resources
- Use `_count` on searches to bound page size, and `nextPage()` to paginate rather
  than requesting unbounded result sets
- Cache `CapabilityStatement` lookups (already done for you — see [§9](#9-capabilitystatement-checks-before-go-live))
  rather than re-checking support on every request

## 11. Runtime & deployment compatibility

- **Node.js**: 20.12+ (see [§1](#1-prerequisites)). Tested in CI on the current
  Node 20.x and 22.x LTS lines.
- **Browser/edge/serverless**: built on native `fetch`, no Node-only APIs in the
  request path. Manually verified working in an actual browser (esbuild-bundled,
  loaded and run against live HAPI and Epic FHIR servers) — that run also caught and
  fixed a real bug: `fetch` must be bound to `globalThis` before use as the default
  `fetchFn`, since browsers' native `fetch` throws `Illegal invocation` when called
  unbound (Node's `fetch` tolerates it, which is why this didn't surface in the unit
  or sandbox test suites, both Node-only). Cloudflare Workers/Vercel Edge/Deno Deploy
  aren't individually verified — this isn't exercised in this repo's own CI; verify
  your specific target runtime as part of your own deploy pipeline.
- **Module format**: ESM only. If your production bundler/runtime is CommonJS-only,
  use dynamic `import()` rather than `require()`.
- **Bundling**: this package has zero required runtime dependencies, so bundling it
  (webpack/esbuild/rollup/etc. for a frontend or edge deployment) doesn't pull in a
  dependency tree — just this package's own compiled output.

## 12. Pre-go-live checklist

- [ ] `baseUrl` is `https://` and loaded from config/secrets, not hardcoded
- [ ] `allowInsecureHttp` is not set anywhere in production config
- [ ] `tokenProvider` (if any) has had the mandatory security review for
      auth/token-handling code
- [ ] `retry` is configured deliberately (on with tuned values, or intentionally off)
      — not left at the silent default
- [ ] A request timeout is wired via `fetchFn` (see [§6](#6-retries-backoff-and-timeouts)) — this client has no default
- [ ] `supportsOperation()` checked for every interaction your app depends on, against
      the actual target server (see [§9](#9-capabilitystatement-checks-before-go-live))
- [ ] `npm run test:sandbox`-equivalent tests run against **your actual target
      server** (not just the public HAPI sandbox) before first deploy
- [ ] Logging reviewed — `debug` output (if enabled) and any custom `fetchFn` logging
      contain no tokens, credentials, or unredacted patient-identifying data
- [ ] Dependency/security scanning (`npm audit`, Dependabot, or your org's equivalent)
      is wired into your own CI for this dependency, same as any other

## 13. Versioning & upgrades

This project follows [Semantic Versioning](https://semver.org/) — see
[CHANGELOG.md](../CHANGELOG.md) for what changed in each release. Since the public
API surface is everything exported from `src/index.ts`
([README §5](../README.md#5-architecture)), anything not exported (internal helpers)
can change without a major version bump.

## 14. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `FhirClient requires an https:// baseUrl` thrown at startup | `baseUrl` is `http://` (or malformed) without `allowInsecureHttp` | Use `https://`; only set `allowInsecureHttp: true` for local sandbox work, never in deployed config |
| `ERR_MODULE_NOT_FOUND` / `require() of ES Module not supported` | Consuming this ESM-only package via `require()` | Use `import` or `await import(...)` — see [§11](#11-runtime--deployment-compatibility) |
| `FhirClientError` with `status: 401` or `403` | `tokenProvider` returned an invalid/expired token, or none was configured for a server that requires auth | Check your token source's refresh logic; confirm `tokenProvider` is actually set in config |
| `FhirClientError` with `status: 404` and empty `issues` | Server returned a 404 without an `OperationOutcome` body | Expected fallback behavior — branch on `error.status`, not `error.issues`, for servers that don't send `OperationOutcome` on every error |
| Requests never retry after a `503` | `retry` wasn't configured — it's off by default | Set `retry: { attempts: ... }` explicitly |
| Request hangs indefinitely on a slow/unreachable server | No built-in timeout | Wrap `fetchFn` with an `AbortController`-based timeout — see [§6](#6-retries-backoff-and-timeouts) |
| `supportsOperation()` returns `false` unexpectedly | Target server's `CapabilityStatement` doesn't advertise that interaction, or a stale cached statement is being read | Confirm against the server's `/metadata` directly; reduce `capabilityCacheTtlMs` if capabilities change at runtime |

## 15. Support

- Bugs/feature requests: open a GitHub issue using the repo's issue templates
- Security vulnerabilities: **do not** open a public issue — see
  [SECURITY.md](../SECURITY.md) for private reporting
- General usage questions: open an issue with the `question` label (see
  [CONTRIBUTING.md](../CONTRIBUTING.md))
