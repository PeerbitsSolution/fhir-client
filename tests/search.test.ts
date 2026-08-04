import { describe, expect, it } from "vitest";
import {
  buildConditionSearchQuery,
  buildEncounterSearchQuery,
  buildObservationSearchQuery,
  buildPatientSearchQuery,
  buildSearchQuery,
} from "../src/search";

describe("buildSearchQuery (generic escape hatch)", () => {
  it("builds a query string from simple params", () => {
    const query = buildSearchQuery({ name: "Smith", active: true, _count: 10 });
    expect(query.get("name")).toBe("Smith");
    expect(query.get("active")).toBe("true");
    expect(query.get("_count")).toBe("10");
  });

  it("skips undefined values", () => {
    const query = buildSearchQuery({ name: "Smith", family: undefined });
    expect(query.has("family")).toBe(false);
  });

  it("appends array values as repeated params", () => {
    const query = buildSearchQuery({ date: ["ge2024-01-01", "le2024-12-31"] });
    expect(query.getAll("date")).toEqual(["ge2024-01-01", "le2024-12-31"]);
  });

  it("supports chained search parameters via the generic path (FR3)", () => {
    const query = buildSearchQuery({ "subject.name": "Smith", "patient.identifier": "mrn|12345" });
    expect(query.get("subject.name")).toBe("Smith");
    expect(query.get("patient.identifier")).toBe("mrn|12345");
  });

  it("supports composite search parameters via the generic path (FR3)", () => {
    const query = buildSearchQuery({ "code-value-quantity": "http://loinc.org|8480-6$gt140" });
    expect(query.get("code-value-quantity")).toBe("http://loinc.org|8480-6$gt140");
  });
});

describe("buildPatientSearchQuery", () => {
  it("maps typed Patient search params to correct FHIR R4 param names", () => {
    const query = buildPatientSearchQuery({ family: "Smith", given: "Jane", birthdate: "1990-01-01", gender: "female" });
    expect(query.get("family")).toBe("Smith");
    expect(query.get("given")).toBe("Jane");
    expect(query.get("birthdate")).toBe("1990-01-01");
    expect(query.get("gender")).toBe("female");
  });
});

describe("buildObservationSearchQuery", () => {
  it("maps typed Observation search params, including patient/code chaining", () => {
    const query = buildObservationSearchQuery({ patient: "Patient/example", code: "http://loinc.org|8480-6", status: "final" });
    expect(query.get("patient")).toBe("Patient/example");
    expect(query.get("code")).toBe("http://loinc.org|8480-6");
    expect(query.get("status")).toBe("final");
  });
});

describe("buildEncounterSearchQuery", () => {
  it("maps typed Encounter search params", () => {
    const query = buildEncounterSearchQuery({ patient: "Patient/example", status: "in-progress", class: "AMB" });
    expect(query.get("patient")).toBe("Patient/example");
    expect(query.get("status")).toBe("in-progress");
    expect(query.get("class")).toBe("AMB");
  });
});

describe("buildConditionSearchQuery", () => {
  it("maps typed Condition search params, including hyphenated FHIR param names", () => {
    const query = buildConditionSearchQuery({ patient: "Patient/example", "clinical-status": "active" });
    expect(query.get("patient")).toBe("Patient/example");
    expect(query.get("clinical-status")).toBe("active");
  });
});
