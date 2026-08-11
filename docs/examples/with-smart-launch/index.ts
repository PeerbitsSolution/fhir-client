// Run: SMART_ACCESS_TOKEN=... npx tsx docs/examples/with-smart-launch/index.ts
// Demonstrates FR7 (auth integration) — wiring a token from peerbits-smart-launch's
// token storage (or any other source) into this client's TokenProvider. This repo has
// no code dependency on peerbits-smart-launch; the two compose through the TokenProvider
// shape alone (src/auth.ts).
//
// NEEDS HUMAN SECURITY REVIEW: this example only *consumes* a token — the token
// acquisition, storage, and refresh logic below is a placeholder standing in for
// peerbits-smart-launch's real token store, not production-grade auth code itself.
import { FhirClient, type TokenProvider } from "@peerbits/fhir-client";

// In a real app this would be, e.g.:
//   import { getStoredToken } from "@peerbits/peerbits-smart-launch";
//   const tokenProvider: TokenProvider = () => getStoredToken();
const getTokenFromSmartLaunch: TokenProvider = () => {
  const token = process.env.SMART_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Set SMART_ACCESS_TOKEN to a token issued by the SMART Health IT sandbox launch flow.");
  }
  return token;
};

const client = new FhirClient({
  baseUrl: "https://launch.smarthealthit.org/v/r4/fhir/",
  tokenProvider: getTokenFromSmartLaunch,
});

async function main() {
  const page = await client.searchPatients({ _count: 3 });
  console.log(`Authenticated search returned ${page.resources.length} patient(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
