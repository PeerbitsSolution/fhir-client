# Vendor Compatibility

fhir-client is built against the FHIR R4 spec itself, not any one vendor's
implementation — but real EHR vendors deviate from the reference server (HAPI) in
ways that matter (auth enforcement, capability advertisement, response shape). This
page tracks which real-world FHIR R4 servers have actually been checked against this
client, beyond HAPI.

## What "verified" means here

For each server below, verified means, using **only its public base URL — no
`client_id`, secret, or token**:

1. `fetchCapabilityStatement()` succeeds and returns a valid R4 `CapabilityStatement`
2. `supportsOperation("Patient", "read")` correctly reports `true` against that
   statement
3. An unauthenticated `searchPatients(...)` call correctly throws a typed
   `FhirClientError` with `status: 401`, not a crash or a swallowed error

This confirms **connectivity, spec compliance, and error-path correctness** against
each vendor's real server. It does **not** confirm a full authenticated CRUD/search
round-trip — that requires a real access token obtained through that vendor's SMART
on FHIR authorization flow, which is an interactive, human-in-the-browser process
(pick a test patient, log in, approve consent) that can't be scripted headlessly. See
[PRODUCTION_GUIDE.md §4 Authentication](./PRODUCTION_GUIDE.md#4-authentication) and
the [with-smart-launch example](./examples/with-smart-launch/index.ts) for that path.

## Verified servers

| Vendor | Base URL | FHIR version reported | Last checked |
|---|---|---|---|
| HAPI FHIR (reference server) | `https://hapi.fhir.org/baseR4/` | R4 | Full CRUD/search/pagination/batch — see [tests/e2e.sandbox.test.ts](../tests/e2e.sandbox.test.ts), run on every release |
| Epic (non-production sandbox) | `https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4/` | 4.0.1 | 2026-08-03 |
| Cerner / Oracle Health (public sandbox tenant) | `https://fhir-myrecord.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d/` | 4.0.1 | 2026-08-03 |
| SMART Health IT (public sandbox) | `https://launch.smarthealthit.org/v/r4/fhir/` | 4.0.0 | 2026-08-03 |

Epic, Cerner, and SMART Health IT sandbox endpoints are run by their respective
vendors and can change independently of this repo — re-verify before relying on this
table for a release, the same way `test:sandbox` is re-run manually before every
tagged version (see [README §8](../README.md#8-contributing--testing)).

## How to re-verify yourself

No credentials needed for the checks above — only the base URL:

```ts
import { FhirClient } from "fhir-client";

const client = new FhirClient({ baseUrl: "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4/" });
const statement = await client.fetchCapabilityStatement();
console.log(statement.fhirVersion, await client.supportsOperation("Patient", "read"));
```

To go further and verify an authenticated round-trip against one of these vendors,
you need a real access token from that vendor's own sandbox login flow (each vendor's
developer portal documents how to launch it):

- Epic: [fhir.epic.com](https://fhir.epic.com) → App Orchard / open sandbox launch
- Cerner: [code.cerner.com](https://code.cerner.com) sandbox launch
- SMART Health IT: [launch.smarthealthit.org](https://launch.smarthealthit.org) standalone launch

Once you have a token, wire it into a `tokenProvider` (see
[PRODUCTION_GUIDE.md §4](./PRODUCTION_GUIDE.md#4-authentication)) and exercise
`read`/`search` against that vendor directly. Don't commit the token anywhere, and
treat it as expired/compromised the moment it's no longer needed.
