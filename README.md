# fhir-client

> Lightweight, dependency-free FHIR R4 client SDK for Node.js/TypeScript

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.12-brightgreen.svg)](#3-installation)
[![FHIR](https://img.shields.io/badge/FHIR-R4-orange.svg)](https://hl7.org/fhir/R4/)
[![CI](https://github.com/PeerbitsSolution/fhir-client/actions/workflows/ci.yml/badge.svg)](https://github.com/PeerbitsSolution/fhir-client/actions/workflows/ci.yml)

**Category:** FHIR & SMART — Interoperability Libraries · **License:** Apache-2.0 · **Status:** alpha

---

## Table of contents

1. [What problem does this solve?](#1-what-problem-does-this-solve)
2. [Features](#2-features)
3. [Installation](#3-installation)
4. [Quick Start](#4-quick-start)
5. [Architecture](#5-architecture)
6. [Example Usage](#6-example-usage)
7. [Roadmap](#7-roadmap)
8. [Contributing & Testing](#8-contributing--testing)
9. [License](#9-license)
10. [About Peerbits](#10-about-peerbits)

---

## 1. What problem does this solve?

Every FHIR integration project ends up hand-rolling the same client layer: building
search URLs, following `Bundle` pagination links, constructing batch/transaction
bundles, and turning `OperationOutcome` error responses into something a caller can
actually branch on. The existing public FHIR clients for TypeScript are either
unmaintained or tied to a larger platform SDK you didn't ask for. fhir-client
is that thin client layer on its own: strongly typed against the FHIR R4 spec, zero
required runtime dependencies, and usable in Node or edge/serverless runtimes since
it's built on native `fetch`.

## 2. Features

- CRUD on any FHIR R4 resource type: `read`, `vread`, `create`, `update`, `delete`
- Typed search builders for `Patient`, `Observation`, `Encounter`, `Condition`, plus a
  generic `search(resourceType, params)` escape hatch for anything else — including
  chained and composite search parameters
- `Bundle` handling: typed parsing of `searchset` results, automatic pagination via
  `nextPage()`, and a `BundleBuilder` for batch/transaction requests
- `CapabilityStatement` discovery with in-memory TTL caching, and a
  `supportsOperation()` helper to check server support before calling an operation
- Typed error handling — non-2xx responses are parsed into a `FhirClientError` with
  `.issues`, `.severity`, and the original HTTP status, not just a raw HTTP error
- A `TokenProvider` type (not an implementation) so this client composes with
  [peerbits-smart-launch](https://github.com/peerbits/peerbits-smart-launch)'s token
  storage, or any other auth mechanism, without a hard dependency on either
- Opt-in retry/backoff for transient failures (network errors, 5xx) — off by default
- TLS enforced by default; `http://` requires an explicit, clearly-unsafe opt-out flag
  for local sandbox testing only

## 3. Installation

```bash
npm install @peerbits/fhir-client
```

Requires **Node.js 20.12+** (global `fetch`, and the `node:util` APIs this package's
tooling depends on) or any modern runtime that provides a spec-compliant `fetch`.
This package ships **ESM only** (`"type": "module"`) — consume it with `import`.
From CommonJS: **Node.js 22.12+** can `require()` it directly (Node's native
`require(esm)` support); on older Node, use `await import("@peerbits/fhir-client")`
instead — `require()` fails there with a clear `ERR_REQUIRE_ESM` error.

> **Working from a local clone instead of npm?** See
> [Local development](#local-development) under Contributing & Testing for how to
> build and link it locally.

## 4. Quick Start

Runs as-is against the public [HAPI FHIR test server](https://hapi.fhir.org/baseR4) —
no auth, no setup beyond `npm install`.

```ts
import { FhirClient, type Patient } from "@peerbits/fhir-client";

const client = new FhirClient({ baseUrl: "https://hapi.fhir.org/baseR4/" });

const { resources: patients } = await client.searchPatients({ family: "Smith", _count: 5 });
console.log(`Found ${patients.length} patient(s) named Smith`);

if (patients[0]?.id) {
  const patient = await client.read<Patient>("Patient", patients[0].id);
  console.log(patient.name?.[0]?.given?.join(" "), patient.name?.[0]?.family);
}
```

## 5. Architecture

```
src/
  client.ts       FhirClient — config, request(), auth header injection, retry/backoff
  auth.ts         TokenProvider type only — no implementation, no dependency on any token source
  search.ts       Typed search-parameter builders + the generic search escape hatch
  bundle.ts       Bundle parsing, pagination, batch/transaction construction
  capability.ts   CapabilityStatement fetch + TTL cache + supportsOperation()
  errors.ts       OperationOutcome parsing into FhirClientError
  resources/      Typed interfaces: Patient, Observation, Encounter, Condition, + shared datatypes
  index.ts        Public API surface — everything else is an internal implementation detail
```

**Request flow:** a client method builds the request URL → if a `tokenProvider` is
configured, it's called and the result becomes the `Authorization` header → the
request is sent via `fetch`, with retry/backoff applied only when explicitly
configured → on success the body is parsed into the typed return shape (a resource, or
a parsed `Bundle` for search/batch) → on failure the response is checked for an
`OperationOutcome` and thrown as a typed `FhirClientError`, otherwise a generic typed
HTTP error is thrown.

Built against **FHIR R4** (not R5 — see [Roadmap](#7-roadmap)). Resource and
search-parameter field names are grounded in the
[FHIR R4 specification](https://hl7.org/fhir/R4/), not inferred from general REST
convention.

### Configuration reference

Everything `FhirClient` accepts, via `new FhirClient(config)`:

| Option | Type | Default | Notes |
|---|---|---|---|
| `baseUrl` | `string` | *(required)* | No default is provided on purpose — never accidentally points at a real vendor endpoint. Must include a trailing slash or the client normalizes it internally. |
| `tokenProvider` | `() => string \| Promise<string>` | none | Called before every request; return value becomes `Authorization: Bearer <token>`. See [auth.ts](./src/auth.ts) — **needs human security review** wherever it's implemented (token storage/refresh isn't this repo's job). |
| `headers` | `Record<string, string>` | none | Merged into every request; use for server-specific headers. Can't override `Authorization` (set from `tokenProvider`) or `Content-Type`/`Accept` (set internally). |
| `retry` | `{ attempts, backoffMs?, retryOnStatus? }` | `undefined` (off) | Opt-in only. `backoffMs` (default 250) doubles per attempt: `backoffMs * 2^attemptNumber`. `retryOnStatus` defaults to any 5xx; network errors always count as retryable once `retry` is set. |
| `allowInsecureHttp` | `boolean` | `false` | Unsafe. Only set `true` for local sandbox testing against `http://`. The constructor throws immediately if `baseUrl` isn't `https://` and this isn't set. |
| `capabilityCacheTtlMs` | `number` | `300000` (5 min) | How long `fetchCapabilityStatement()` caches `/metadata` before re-fetching. |
| `fetchFn` | `typeof fetch` | global `fetch` | Inject a custom `fetch` — for test doubles, runtimes without a global `fetch`, or wrapping with your own metrics/tracing/timeout logic. |
| `debug` | `boolean` | `false` | Logs `METHOD url -> status` via `console.debug`. Patient-identifying search-parameter values are redacted to `[REDACTED]`; the `Authorization` header is never logged, period. |

## 6. Example Usage

Full runnable examples live in [docs/examples](./docs/examples):

- [basic-crud](./docs/examples/basic-crud/index.ts) — CRUD lifecycle
- [search-and-paginate](./docs/examples/search-and-paginate/index.ts) — typed search + pagination
- [batch-transaction](./docs/examples/batch-transaction/index.ts) — one batch request creating multiple resources
- [with-smart-launch](./docs/examples/with-smart-launch/index.ts) — wiring a token from peerbits-smart-launch

Batch/transaction, inline:

```ts
import { BundleBuilder, FhirClient } from "@peerbits/fhir-client";

const client = new FhirClient({ baseUrl: "https://hapi.fhir.org/baseR4/" });

const builder = new BundleBuilder()
  .create({ resourceType: "Patient", name: [{ family: "Doe", given: ["Jane"] }] })
  .create({ resourceType: "Patient", name: [{ family: "Doe", given: ["John"] }] });

const results = await client.executeBundle(builder, "batch");
results.forEach((r) => console.log(r.status, r.location));
```

Composing with `peerbits-smart-launch`'s token output (illustrative — swap
`getTokenFromSmartLaunch` for the real import once that repo is available):

```ts
import { FhirClient, type TokenProvider } from "@peerbits/fhir-client";
// import { getStoredToken as getTokenFromSmartLaunch } from "@peerbits/peerbits-smart-launch";

declare function getTokenFromSmartLaunch(): Promise<string>;

const tokenProvider: TokenProvider = () => getTokenFromSmartLaunch();
const client = new FhirClient({ baseUrl: process.env.FHIR_BASE_URL!, tokenProvider });
```

Handling errors (FR6 — every non-2xx response becomes a typed `FhirClientError`):

```ts
import { FhirClientError } from "@peerbits/fhir-client";

try {
  await client.read("Patient", "does-not-exist");
} catch (error) {
  if (error instanceof FhirClientError) {
    console.error(`FHIR error ${error.status} (${error.severity ?? "unknown"}):`, error.issues);
  } else {
    throw error; // network error, programmer error, etc. — not a FHIR-shaped failure
  }
}
```

For production deployment guidance — auth handling, retry/timeout tuning, logging,
TLS, and a pre-go-live checklist — see
**[docs/PRODUCTION_GUIDE.md](./docs/PRODUCTION_GUIDE.md)**. For which real EHR
vendors (Epic, Cerner, SMART Health IT) this client has actually been checked
against, see **[docs/VENDOR_COMPATIBILITY.md](./docs/VENDOR_COMPATIBILITY.md)**.

## 7. Roadmap

- [ ] Additional typed resource helpers beyond Patient/Observation/Encounter/Condition
      (the generic `search`/`read`/`create` escape hatch covers any resource type today)
- [ ] R5 support (tracked separately — this client targets R4 only for v1)
- [ ] FHIR Subscriptions / websocket / webhook support

Explicitly out of scope for this repo: any client-engagement-specific resource mapping
or business logic, and full code-generation for all 150+ R4 resource types (see
[CONTRIBUTING.md](./CONTRIBUTING.md) for what's in/out of scope for contributions).

## 8. Contributing & Testing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full contribution workflow. Issues
tagged `good first issue` are a good place to start.

### Local development

Check your Node version first — this needs **20.12+** (see
[§3 Installation](#3-installation)):

```bash
node -v
# too old? if you use nvm:
nvm install 20 && nvm use 20
```

Then clone and run the full check:

```bash
git clone https://github.com/PeerbitsSolution/fhir-client.git
cd fhir-client
npm install
npm run lint && npm run typecheck && npm test && npm run build
```

**Running the examples in [docs/examples](./docs/examples) locally** — they import
`from "@peerbits/fhir-client"`, same as a real consumer would, but you don't
need `npm link` or to edit the import to try them from inside this repo: once
`npm run build` has produced `dist/`, Node's package self-referencing resolves that
import to this repo's own `dist/` automatically, because `docs/examples/*` lives
inside the package whose own `package.json` declares that exact name:

```bash
npm run build
npx tsx docs/examples/basic-crud/index.ts
npx tsx docs/examples/search-and-paginate/index.ts
npx tsx docs/examples/batch-transaction/index.ts
```

To try an unreleased local change from a **separate** project (i.e. before it's
published to npm — testing the way an external consumer eventually will, from
outside this repo), use `npm link` instead:

```bash
npm run build
npm link
cd /path/to/some-other-project
npm link @peerbits/fhir-client
```

### Testing

| Command | What it runs | Network? |
|---|---|---|
| `npm test` | Unit tests (`tests/*.test.ts`) — client, search, bundle, errors, capability, all against a mocked `fetch` | No |
| `npm run test:sandbox` | Integration tests (`tests/e2e.sandbox.test.ts`) against the real HAPI FHIR public test server — CRUD, search/pagination, batch/transaction, capability discovery | Yes |
| `npm run lint` | ESLint over `src/` and `tests/` | No |
| `npm run typecheck` | `tsc --noEmit` (strict mode) | No |
| `npm run build` | Compiles `src/` → `dist/` | No |

Sandbox tests are excluded from `npm test` / CI on purpose (a public sandbox can be
temporarily down) but must be run manually and pass before any tagged release.

## 9. License

Apache License 2.0 — see [LICENSE](./LICENSE).

## 10. About Peerbits

fhir-client is part of the [PeerbitsSolution HealthTech Open Source](https://github.com/PeerbitsSolution)
initiative — reusable engineering components extracted from our healthcare
technology work, published so other teams don't have to solve the same
problems from scratch. This repository contains generalized, reusable logic
only; it is not tied to any specific client engagement or commercial product.
