import { describe, expect, it } from "vitest";
import { BundleBuilder, type Bundle, type FhirResource, parseBatchResponse, parseSearchBundle } from "../src/bundle";

const syntheticPatient: FhirResource = { resourceType: "Patient", id: "example" };

describe("parseSearchBundle", () => {
  it("extracts resources, total, and the next link", () => {
    const bundle: Bundle = {
      resourceType: "Bundle",
      type: "searchset",
      total: 2,
      link: [
        { relation: "self", url: "https://hapi.fhir.org/baseR4/Patient?_count=1" },
        { relation: "next", url: "https://hapi.fhir.org/baseR4/Patient?_count=1&_getpagesoffset=1" },
      ],
      entry: [{ fullUrl: "https://hapi.fhir.org/baseR4/Patient/example", resource: syntheticPatient, search: { mode: "match" } }],
    };

    const result = parseSearchBundle(bundle);

    expect(result.resources).toEqual([syntheticPatient]);
    expect(result.total).toBe(2);
    expect(result.next).toBe("https://hapi.fhir.org/baseR4/Patient?_count=1&_getpagesoffset=1");
  });

  it("omits entries without a resource, and entries whose search.mode is 'outcome'", () => {
    const bundle: Bundle = {
      resourceType: "Bundle",
      type: "searchset",
      entry: [
        { resource: syntheticPatient, search: { mode: "match" } },
        { search: { mode: "outcome" }, resource: { resourceType: "OperationOutcome", id: "warn" } },
        { request: { method: "GET", url: "Patient/missing" } },
      ],
    };

    const result = parseSearchBundle(bundle);

    expect(result.resources).toEqual([syntheticPatient]);
  });

  it("returns an empty result and no next link when the bundle has no entries", () => {
    const bundle: Bundle = { resourceType: "Bundle", type: "searchset", total: 0 };
    const result = parseSearchBundle(bundle);
    expect(result.resources).toEqual([]);
    expect(result.next).toBeUndefined();
  });
});

describe("BundleBuilder", () => {
  it("builds a batch Bundle with correctly mapped request entries", () => {
    const bundle = new BundleBuilder()
      .create({ resourceType: "Patient", name: [{ family: "Smith" }] })
      .update({ resourceType: "Patient", id: "example", name: [{ family: "Smith" }] })
      .delete("Patient", "stale")
      .read("Patient", "example")
      .build("batch");

    expect(bundle.type).toBe("batch");
    expect(bundle.entry).toHaveLength(4);
    expect(bundle.entry?.[0]?.request).toEqual({ method: "POST", url: "Patient" });
    expect(bundle.entry?.[1]?.request).toEqual({ method: "PUT", url: "Patient/example" });
    expect(bundle.entry?.[2]?.request).toEqual({ method: "DELETE", url: "Patient/stale" });
    expect(bundle.entry?.[3]?.request).toEqual({ method: "GET", url: "Patient/example" });
  });

  it("throws when update() is called without resource.id", () => {
    expect(() => new BundleBuilder().update({ resourceType: "Patient" })).toThrow(/resource\.id/);
  });
});

describe("parseBatchResponse", () => {
  it("maps a batch-response Bundle back to per-entry results, positionally", () => {
    const responseBundle: Bundle = {
      resourceType: "Bundle",
      type: "batch-response",
      entry: [
        { resource: syntheticPatient, response: { status: "201 Created", location: "Patient/example/_history/1" } },
        { response: { status: "404 Not Found", outcome: { resourceType: "OperationOutcome", issue: [{ severity: "error", code: "not-found" }] } } },
      ],
    };

    const results = parseBatchResponse(responseBundle);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ status: 201, resource: syntheticPatient, location: "Patient/example/_history/1" });
    expect(results[1]).toMatchObject({ status: 404 });
    expect(results[1]?.outcome?.issue[0]?.code).toBe("not-found");
  });
});
