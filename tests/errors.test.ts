import { describe, expect, it } from "vitest";
import { FhirClientError, parseErrorResponse } from "../src/errors";

describe("parseErrorResponse", () => {
  it("parses an OperationOutcome into a typed FhirClientError", () => {
    const operationOutcome = {
      resourceType: "OperationOutcome" as const,
      issue: [
        { severity: "error" as const, code: "not-found" as const, diagnostics: "Patient/does-not-exist not found" },
      ],
    };

    const error = parseErrorResponse(404, operationOutcome);

    expect(error).toBeInstanceOf(FhirClientError);
    expect(error.status).toBe(404);
    expect(error.severity).toBe("error");
    expect(error.issues).toHaveLength(1);
    expect(error.operationOutcome).toBe(operationOutcome);
    expect(error.message).toBe("Patient/does-not-exist not found");
  });

  it("picks the worst severity across multiple issues", () => {
    const operationOutcome = {
      resourceType: "OperationOutcome" as const,
      issue: [
        { severity: "warning" as const, code: "informational" as const },
        { severity: "fatal" as const, code: "security" as const },
        { severity: "error" as const, code: "invalid" as const },
      ],
    };

    const error = parseErrorResponse(400, operationOutcome);

    expect(error.severity).toBe("fatal");
    expect(error.issues).toHaveLength(3);
  });

  it("falls back to a generic typed error when no OperationOutcome is present", () => {
    const error = parseErrorResponse(500, { message: "internal server error" });

    expect(error).toBeInstanceOf(FhirClientError);
    expect(error.status).toBe(500);
    expect(error.issues).toEqual([]);
    expect(error.severity).toBeUndefined();
    expect(error.operationOutcome).toBeUndefined();
    expect(error.message).toContain("500");
  });

  it("falls back to a generic typed error when the body is not JSON at all", () => {
    const error = parseErrorResponse(502, undefined);

    expect(error.status).toBe(502);
    expect(error.issues).toEqual([]);
  });
});
