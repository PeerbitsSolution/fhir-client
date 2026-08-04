// Run: npx tsx docs/examples/basic-crud/index.ts
// Demonstrates FR2 (Resource CRUD) against the public HAPI FHIR test server — no auth needed.
import { FhirClient, type Patient } from "@peerbits/peerbits-fhir-client";

const client = new FhirClient({ baseUrl: "https://hapi.fhir.org/baseR4/" });

async function main() {
  // Unique per run — a shared public sandbox can reject an exact-duplicate create.
  const created = await client.create<Patient>({
    resourceType: "Patient",
    identifier: [{ system: "urn:peerbits:example", value: `basic-crud-${Date.now()}` }],
    name: [{ family: "Example", given: ["Basic-Crud-Demo"] }],
    gender: "unknown",
    birthDate: "2000-01-01",
  });
  console.log("Created:", created.id);

  const fetched = await client.read<Patient>("Patient", created.id as string);
  console.log("Read back:", fetched.name?.[0]?.family);

  const updated = await client.update<Patient>({ ...fetched, gender: "other" });
  console.log("Updated gender:", updated.gender);

  await client.delete("Patient", created.id as string);
  console.log("Deleted:", created.id);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
