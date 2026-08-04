// Run: npx tsx docs/examples/search-and-paginate/index.ts
// Demonstrates FR3 (typed search) and FR4 (pagination) against the public HAPI FHIR test server.
import { FhirClient } from "fhir-client";

const client = new FhirClient({ baseUrl: "https://hapi.fhir.org/baseR4/" });

async function main() {
  let page = await client.searchPatients({ family: "Smith", _count: 5 });
  console.log(`Page 1: ${page.resources.length} patient(s), total=${page.total ?? "unknown"}`);

  let pageNumber = 1;
  while (page.next && pageNumber < 3) {
    page = (await client.nextPage(page)) ?? page;
    pageNumber += 1;
    console.log(`Page ${pageNumber}: ${page.resources.length} patient(s)`);
  }

  // Generic escape hatch (FR3) — any resource type/param, including chained search.
  const observations = await client.search("Observation", { code: "http://loinc.org|8480-6", _count: 3 });
  console.log(`Observations by LOINC code: ${observations.resources.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
