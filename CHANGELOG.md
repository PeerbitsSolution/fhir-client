# Changelog

All notable changes to this project are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- `docs/PRODUCTION_GUIDE.md` — production deployment guidance: config reference,
  auth/TLS/retry/timeout/logging practices, a pre-go-live checklist, and a
  troubleshooting table.
- `docs/VENDOR_COMPATIBILITY.md` — confirms `fetchCapabilityStatement()` and the
  unauthenticated-request error path against real Epic, Cerner, and SMART Health IT
  sandbox base URLs (no credentials involved — public base URLs only).
- README: badges, table of contents, full `FhirClientConfig` reference table, and an
  inline error-handling example.

### Changed
- Raised the Node.js floor to `>=20.12` (was `>=18`) — vitest 4 requires
  `node:util`'s `styleText`, unavailable before Node 20.12; Node 18 has also been
  EOL since April 2025. Updated CI matrix and README accordingly.

### Fixed
- `BundleBuilder.create()`/`.update()` now take a generic `<T extends FhirResource>`
  parameter, matching `FhirClient.create()`/`.update()`. Previously they accepted a
  fixed `FhirResource` type with no index signature, so any real resource literal
  (e.g. `{ resourceType: "Patient", name: [...] }`) failed TypeScript's excess-property
  check — a break for any consumer using `BundleBuilder` under strict TypeScript.
- `docs/examples/basic-crud` and `docs/examples/batch-transaction` now create
  patients with a unique identifier per run. They previously used static, identical
  content every run, which the shared public HAPI sandbox would eventually reject as
  a duplicate-resource conflict (`412`) after repeated runs.
- README's local-testing instructions for `docs/examples/*` incorrectly claimed they
  need `npm link` or an edited import to run from inside this repo. They don't —
  Node's package self-referencing resolves `"@peerbits/fhir-client"` to this
  repo's own `dist/` automatically once `npm run build` has run, since the examples
  live inside the package whose own `package.json` declares that name. Corrected the
  README and clarified `npm link` is only needed to test from a separate project.
- `FhirClient`'s default `fetchFn` now binds `fetch` to `globalThis` before use.
  Browsers' native `fetch` throws `TypeError: Illegal invocation` when called as an
  unbound function reference (it requires `Window`/`WorkerGlobalScope` as the
  receiver); Node's `fetch` tolerates the unbound call, which is why this only
  surfaced when the client was actually run in a browser — found while building an
  in-browser demo, not by the Node-only unit/sandbox test suites.

## [1.0.0] - 2026-07-29

### Added
- `FhirClient` core: config, request pipeline, `Authorization` header injection via a
  pluggable `tokenProvider`, opt-in retry/backoff for transient failures, TLS enforced
  by default.
- Resource CRUD: `read`, `vread`, `create`, `update`, `delete`.
- Typed search builders for `Patient`, `Observation`, `Encounter`, and `Condition`,
  plus a generic `search(resourceType, params)` escape hatch supporting any resource
  type and chained/composite search parameters.
- Bundle handling: typed `searchset` parsing, `nextPage()` pagination, and
  `BundleBuilder` for batch/transaction requests with per-entry result mapping.
- `CapabilityStatement` discovery with in-memory TTL caching and `supportsOperation()`.
- Typed `FhirClientError` — `OperationOutcome` responses parsed into `.issues` and
  `.severity`; non-`OperationOutcome` errors fall back to a generic typed error.
- `TokenProvider` type (interface only) for composing with `peerbits-smart-launch` or
  any other auth source without a code dependency.
- Redacted debug logging (opt-in) — never logs the `Authorization` header or
  patient-identifying search parameter values.
- Unit test coverage for `client`, `search`, `bundle`, `errors`, and `capability`
  (mocked `fetch`); sandbox integration tests against the HAPI FHIR public test server
  covering CRUD, search/pagination, and batch/transaction end-to-end.
