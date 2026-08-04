// Run: npx tsx docs/examples/batch-transaction/index.ts
// Demonstrates FR4 (batch/transaction Bundle construction + execution) against the
// public HAPI FHIR test server.
import { BundleBuilder, FhirClient, type FhirResource } from "@peerbits/peerbits-fhir-client";

const client = new FhirClient({ baseUrl: "https://hapi.fhir.org/baseR4/" });

async function main() {
  // Unique per run — a shared public sandbox can reject an exact-duplicate create.
  const runTag = Date.now();
  const builder = new BundleBuilder()
    .create({
      resourceType: "Patient",
      identifier: [{ system: "urn:peerbits:example", value: `batch-demo-${runTag}-1` }],
      name: [{ family: "Example", given: ["Batch-Demo-One"] }],
    })
    .create({
      resourceType: "Patient",
      identifier: [{ system: "urn:peerbits:example", value: `batch-demo-${runTag}-2` }],
      name: [{ family: "Example", given: ["Batch-Demo-Two"] }],
    });

  const results = await client.executeBundle<FhirResource>(builder, "batch");

  for (const result of results) {
    console.log(`Status ${result.status} — location: ${result.location ?? "n/a"}`);
  }

  // Clean up so the shared public sandbox doesn't accumulate demo data.
  const createdIds = results.map((r) => r.location?.split("/")[1]).filter((id): id is string => Boolean(id));
  await Promise.all(createdIds.map((id) => client.delete("Patient", id)));
  console.log(`Cleaned up ${createdIds.length} demo patient(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
