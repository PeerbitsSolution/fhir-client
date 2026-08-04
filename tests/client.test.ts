import { afterEach, describe, expect, it, vi } from "vitest";
import { FhirClient } from "../src/client";
import { BundleBuilder, type Bundle, type FhirResource } from "../src/bundle";
import type { CapabilityStatement } from "../src/capability";

const baseUrl = "https://hapi.fhir.org/baseR4/";
const syntheticPatient: FhirResource = { resourceType: "Patient", id: "example" };

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/fhir+json" },
  });
}

function getRequestInit(fetchFn: ReturnType<typeof vi.fn>, callIndex = 0): RequestInit {
  return fetchFn.mock.calls[callIndex]?.[1] as RequestInit;
}

describe("FhirClient construction (NFR 6.1 — TLS enforced by default)", () => {
  it("throws when baseUrl is not https and allowInsecureHttp isn't set", () => {
    expect(() => new FhirClient({ baseUrl: "http://localhost:8080/fhir" })).toThrow(/https/);
  });

  it("allows http only when allowInsecureHttp is explicitly set", () => {
    expect(() => new FhirClient({ baseUrl: "http://localhost:8080/fhir", allowInsecureHttp: true })).not.toThrow();
  });
});

describe("FhirClient CRUD (FR2)", () => {
  it("read() sends GET resourceType/id and returns the parsed resource", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, syntheticPatient));
    const client = new FhirClient({ baseUrl, fetchFn });

    const result = await client.read<FhirResource>("Patient", "example");

    expect(result).toEqual(syntheticPatient);
    expect(fetchFn.mock.calls[0]?.[0]).toBe("https://hapi.fhir.org/baseR4/Patient/example");
    expect(getRequestInit(fetchFn).method).toBe("GET");
  });

  it("vread() sends GET resourceType/id/_history/versionId", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, syntheticPatient));
    const client = new FhirClient({ baseUrl, fetchFn });

    await client.vread("Patient", "example", "2");

    expect(fetchFn.mock.calls[0]?.[0]).toBe("https://hapi.fhir.org/baseR4/Patient/example/_history/2");
  });

  it("create() posts to the resource type endpoint with a JSON body", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(201, syntheticPatient));
    const client = new FhirClient({ baseUrl, fetchFn });

    await client.create({ resourceType: "Patient", name: [{ family: "Smith" }] });

    expect(fetchFn.mock.calls[0]?.[0]).toBe("https://hapi.fhir.org/baseR4/Patient");
    const init = getRequestInit(fetchFn);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ resourceType: "Patient" });
  });

  it("update() requires resource.id and PUTs to resourceType/id", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, syntheticPatient));
    const client = new FhirClient({ baseUrl, fetchFn });

    await client.update({ resourceType: "Patient", id: "example" });

    expect(fetchFn.mock.calls[0]?.[0]).toBe("https://hapi.fhir.org/baseR4/Patient/example");
    expect(getRequestInit(fetchFn).method).toBe("PUT");
  });

  it("update() rejects a resource with no id", async () => {
    const client = new FhirClient({ baseUrl, fetchFn: vi.fn() });
    await expect(client.update({ resourceType: "Patient" })).rejects.toThrow(/resource\.id/);
  });

  it("delete() sends DELETE with no body", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(204));
    const client = new FhirClient({ baseUrl, fetchFn });

    await client.delete("Patient", "example");

    expect(fetchFn.mock.calls[0]?.[0]).toBe("https://hapi.fhir.org/baseR4/Patient/example");
    const init = getRequestInit(fetchFn);
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });
});

describe("FhirClient auth integration (FR7)", () => {
  it("calls tokenProvider before each request and sets the Authorization header", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, syntheticPatient));
    const tokenProvider = vi.fn().mockResolvedValue("test-token-abc");
    const client = new FhirClient({ baseUrl, tokenProvider, fetchFn });

    await client.read("Patient", "example");

    expect(tokenProvider).toHaveBeenCalledTimes(1);
    const headers = getRequestInit(fetchFn).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-token-abc");
  });

  it("does not set an Authorization header when no tokenProvider is configured", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, syntheticPatient));
    const client = new FhirClient({ baseUrl, fetchFn });

    await client.read("Patient", "example");

    const headers = getRequestInit(fetchFn).headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });
});

describe("FhirClient error handling (FR6)", () => {
  it("throws a typed FhirClientError with parsed issues for an OperationOutcome response", async () => {
    const operationOutcome = {
      resourceType: "OperationOutcome",
      issue: [{ severity: "error", code: "not-found", diagnostics: "Patient/missing not found" }],
    };
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(404, operationOutcome));
    const client = new FhirClient({ baseUrl, fetchFn });

    await expect(client.read("Patient", "missing")).rejects.toMatchObject({ status: 404, severity: "error" });
  });

  it("falls back to a generic typed error when no OperationOutcome is present", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(500, { message: "boom" }));
    const client = new FhirClient({ baseUrl, fetchFn });

    await expect(client.read("Patient", "x")).rejects.toMatchObject({ status: 500, issues: [] });
  });
});

describe("FhirClient search & pagination (FR3, FR4)", () => {
  it("search() builds the query string and parses the response Bundle", async () => {
    const bundle: Bundle = { resourceType: "Bundle", type: "searchset", total: 1, entry: [{ resource: syntheticPatient }] };
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, bundle));
    const client = new FhirClient({ baseUrl, fetchFn });

    const result = await client.search("Patient", { family: "Smith" });

    expect(result.resources).toEqual([syntheticPatient]);
    expect(result.total).toBe(1);
    expect(fetchFn.mock.calls[0]?.[0]).toBe("https://hapi.fhir.org/baseR4/Patient?family=Smith");
  });

  it("searchPatients() hits the Patient endpoint with typed params", async () => {
    const bundle: Bundle = { resourceType: "Bundle", type: "searchset", entry: [{ resource: syntheticPatient }] };
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, bundle));
    const client = new FhirClient({ baseUrl, fetchFn });

    await client.searchPatients({ family: "Smith" });

    expect(fetchFn.mock.calls[0]?.[0]).toBe("https://hapi.fhir.org/baseR4/Patient?family=Smith");
  });

  it("nextPage() follows the Bundle's next link verbatim", async () => {
    const bundle: Bundle = { resourceType: "Bundle", type: "searchset", entry: [{ resource: syntheticPatient }] };
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, bundle));
    const client = new FhirClient({ baseUrl, fetchFn });
    const nextUrl = "https://hapi.fhir.org/baseR4/Patient?_getpagesoffset=10";

    const page = await client.nextPage({ resources: [], next: nextUrl });

    expect(page?.resources).toEqual([syntheticPatient]);
    expect(fetchFn.mock.calls[0]?.[0]).toBe(nextUrl);
  });

  it("nextPage() returns undefined when there is no next link", async () => {
    const client = new FhirClient({ baseUrl, fetchFn: vi.fn() });
    const page = await client.nextPage({ resources: [] });
    expect(page).toBeUndefined();
  });
});

describe("FhirClient batch/transaction (FR4)", () => {
  it("executeBundle() posts the built Bundle to the base URL and maps per-entry results", async () => {
    const responseBundle: Bundle = {
      resourceType: "Bundle",
      type: "batch-response",
      entry: [{ resource: syntheticPatient, response: { status: "201 Created" } }],
    };
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, responseBundle));
    const client = new FhirClient({ baseUrl, fetchFn });
    const builder = new BundleBuilder().create({ resourceType: "Patient" });

    const results = await client.executeBundle(builder, "batch");

    expect(results[0]).toMatchObject({ status: 201, resource: syntheticPatient });
    expect(fetchFn.mock.calls[0]?.[0]).toBe(baseUrl);
    const init = getRequestInit(fetchFn);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ resourceType: "Bundle", type: "batch" });
  });
});

describe("FhirClient capability discovery (FR5)", () => {
  const statement: CapabilityStatement = {
    resourceType: "CapabilityStatement",
    rest: [{ mode: "server", resource: [{ type: "Patient", interaction: [{ code: "read" }] }] }],
  };

  it("fetchCapabilityStatement() caches across repeated calls", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, statement));
    const client = new FhirClient({ baseUrl, fetchFn });

    await client.fetchCapabilityStatement();
    await client.fetchCapabilityStatement();

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0]?.[0]).toBe("https://hapi.fhir.org/baseR4/metadata");
  });

  it("supportsOperation() reflects the cached CapabilityStatement", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, statement));
    const client = new FhirClient({ baseUrl, fetchFn });

    expect(await client.supportsOperation("Patient", "read")).toBe(true);
    expect(await client.supportsOperation("Patient", "delete")).toBe(false);
  });
});

describe("FhirClient retry/backoff (opt-in, off by default)", () => {
  it("does not retry when retry isn't configured", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(503, {}));
    const client = new FhirClient({ baseUrl, fetchFn });

    await expect(client.read("Patient", "example")).rejects.toMatchObject({ status: 503 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("retries transient 5xx failures up to the configured attempts, then succeeds", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, {}))
      .mockResolvedValueOnce(jsonResponse(503, {}))
      .mockResolvedValueOnce(jsonResponse(200, syntheticPatient));
    const client = new FhirClient({ baseUrl, fetchFn, retry: { attempts: 2, backoffMs: 1 } });

    const result = await client.read("Patient", "example");

    expect(result).toEqual(syntheticPatient);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("throws once retry attempts are exhausted", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(503, {}));
    const client = new FhirClient({ baseUrl, fetchFn, retry: { attempts: 1, backoffMs: 1 } });

    await expect(client.read("Patient", "example")).rejects.toMatchObject({ status: 503 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-transient client errors (4xx)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(404, {}));
    const client = new FhirClient({ baseUrl, fetchFn, retry: { attempts: 3, backoffMs: 1 } });

    await expect(client.read("Patient", "missing")).rejects.toMatchObject({ status: 404 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("FhirClient debug logging redaction (NFR 6.1)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("redacts patient-identifying search params and never logs the Authorization header", async () => {
    const bundle: Bundle = { resourceType: "Bundle", type: "searchset", entry: [] };
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, bundle));
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const client = new FhirClient({ baseUrl, fetchFn, tokenProvider: () => "super-secret-token", debug: true });

    await client.search("Patient", { family: "Smith" });

    expect(debugSpy).toHaveBeenCalledTimes(1);
    const loggedLine = debugSpy.mock.calls[0]?.[0] as string;
    expect(loggedLine).not.toContain("super-secret-token");
    expect(loggedLine).not.toContain("Smith");
    expect(decodeURIComponent(loggedLine)).toContain("[REDACTED]");
  });

  it("logs nothing when debug is off (the default)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, syntheticPatient));
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const client = new FhirClient({ baseUrl, fetchFn });

    await client.read("Patient", "example");

    expect(debugSpy).not.toHaveBeenCalled();
  });
});
