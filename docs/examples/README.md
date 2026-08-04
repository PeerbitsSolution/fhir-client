# Examples

Each example is self-contained and runs against the [HAPI FHIR public test
server](https://hapi.fhir.org/baseR4) — no auth, no local setup beyond
`npm install`. Run any of them with [tsx](https://github.com/privatenumber/tsx)
(`npx tsx docs/examples/basic-crud/index.ts`) or compile with `tsc` first.

| Example | Demonstrates |
|---|---|
| [basic-crud](./basic-crud/index.ts) | `create`, `read`, `update`, `delete` (FR2) |
| [search-and-paginate](./search-and-paginate/index.ts) | Typed search + following `Bundle.next` (FR3, FR4) |
| [batch-transaction](./batch-transaction/index.ts) | `BundleBuilder` + one batch request (FR4) |
| [with-smart-launch](./with-smart-launch/index.ts) | Wiring a `tokenProvider` from `peerbits-smart-launch` (FR7) |
