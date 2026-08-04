import { describe, expect, it } from "vitest";
import { FhirClient, FhirClientError, VERSION, buildSearchQuery, parseSearchBundle } from "../src/index";

describe("public API surface", () => {
  it("exports a version", () => {
    expect(VERSION).toBeTruthy();
  });

  it("exports the core client, error type, and key helpers", () => {
    expect(FhirClient).toBeTypeOf("function");
    expect(FhirClientError).toBeTypeOf("function");
    expect(buildSearchQuery).toBeTypeOf("function");
    expect(parseSearchBundle).toBeTypeOf("function");
  });
});
