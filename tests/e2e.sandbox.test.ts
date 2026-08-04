// Integration tests against the HAPI FHIR public test server (hapi.fhir.org/baseR4).
// No auth required. Hits the real network — run manually (`npm run test:sandbox`)
// before a tagged release; skipped from `npm test` / CI since a public sandbox can be
// temporarily down or slow. All resources used here are synthetic and cleaned up after.
//
// Search/pagination seeds its own data rather than relying on the shared server's
// existing content — a plain Patient search against the public server can come back
// with zero entries depending on its current load/indexing state, which isn't this
// client's bug to chase.
import { describe, expect, it } from "vitest";
import { FhirClient } from "../src/client";
import { BundleBuilder, type FhirResource } from "../src/bundle";
import { FhirClientError } from "../src/errors";
import type { Patient } from "../src/resources/patient";

const client = new FhirClient({ baseUrl: "https://hapi.fhir.org/baseR4/" });
const NETWORK_TIMEOUT = 20_000;

// Unique per run so concurrent test runs against the shared public server don't collide.
const runTag = `peerbits-fhir-client-test-${Date.now()}`;

function syntheticPatient(suffix: string, groupTag?: string): Patient {
  const identifier = [{ system: "urn:peerbits:test", value: `${runTag}-${suffix}` }];
  if (groupTag) identifier.push({ system: "urn:peerbits:test-group", value: groupTag });
  return {
    resourceType: "Patient",
    identifier,
    name: [{ family: "Testperson", given: ["Synthea"] }],
    gender: "unknown",
    birthDate: "2000-01-01",
  };
}

// The public sandbox's search index can lag a moment behind a just-completed create —
// that's the sandbox's eventual consistency, not this client's bug, so the test polls
// briefly instead of asserting on the first attempt.
async function waitForSearchResult(search: () => Promise<{ resources: unknown[] }>, attempts = 5, delayMs = 800) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const result = await search();
    if (result.resources.length > 0) return result;
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return search();
}

describe("e2e (sandbox): HAPI public test server — CRUD", () => {
  it(
    "creates, reads, updates, and deletes a synthetic Patient",
    async () => {
      const created = await client.create<Patient>(syntheticPatient("crud"));
      expect(created.id).toBeTruthy();

      const read = await client.read<Patient>("Patient", created.id as string);
      expect(read.identifier?.[0]?.value).toBe(`${runTag}-crud`);

      const updated = await client.update<Patient>({ ...read, gender: "other" });
      expect(updated.gender).toBe("other");

      await client.delete("Patient", created.id as string);

      await expect(client.read("Patient", created.id as string)).rejects.toBeInstanceOf(FhirClientError);
    },
    NETWORK_TIMEOUT,
  );
});

describe("e2e (sandbox): HAPI public test server — search & pagination", () => {
  it(
    "searches Patients by a shared identifier and follows the Bundle's next link (FR3, FR4)",
    async () => {
      const groupTag = `${runTag}-group`;
      const seeded = await Promise.all(
        ["page-1", "page-2", "page-3"].map((suffix) => client.create<Patient>(syntheticPatient(suffix, groupTag))),
      );

      try {
        const firstPage = await waitForSearchResult(() =>
          client.searchPatients({ identifier: `urn:peerbits:test-group|${groupTag}`, _count: 1 }),
        );
        expect(firstPage.resources.length).toBe(1);
        expect(firstPage.next).toBeTruthy();

        const secondPage = await client.nextPage(firstPage);
        expect(secondPage?.resources.length).toBe(1);
        expect(secondPage?.resources[0]?.id).not.toBe(firstPage.resources[0]?.id);
      } finally {
        await Promise.all(seeded.map((patient) => client.delete("Patient", patient.id as string)));
      }
    },
    NETWORK_TIMEOUT,
  );
});

describe("e2e (sandbox): HAPI public test server — batch/transaction", () => {
  it(
    "executes a batch Bundle creating two synthetic Patients and cleans them up",
    async () => {
      const builder = new BundleBuilder().create(syntheticPatient("batch-1")).create(syntheticPatient("batch-2"));

      const results = await client.executeBundle<FhirResource>(builder, "batch");

      expect(results).toHaveLength(2);
      for (const result of results) {
        expect(result.status).toBeGreaterThanOrEqual(200);
        expect(result.status).toBeLessThan(300);
      }

      // A plain batch response (no "Prefer: return=representation") only carries
      // response.location, not the created resource body — extract the id from that.
      const createdIds = results
        .map((result) => result.location?.split("/")[1])
        .filter((id): id is string => Boolean(id));
      expect(createdIds).toHaveLength(2);
      await Promise.all(createdIds.map((id) => client.delete("Patient", id)));
    },
    NETWORK_TIMEOUT,
  );
});

describe("e2e (sandbox): HAPI public test server — capability discovery", () => {
  it(
    "fetches the CapabilityStatement and confirms Patient read/search-type support (FR5)",
    async () => {
      const statement = await client.fetchCapabilityStatement();
      expect(statement.resourceType).toBe("CapabilityStatement");

      expect(await client.supportsOperation("Patient", "read")).toBe(true);
      expect(await client.supportsOperation("Patient", "search-type")).toBe(true);
    },
    NETWORK_TIMEOUT,
  );
});
