// FHIR R4 OperationOutcome — https://hl7.org/fhir/R4/operationoutcome.html
import type { CodeableConcept } from "./resources/common.js";

export type IssueSeverity = "fatal" | "error" | "warning" | "information";

// IssueType value set — https://hl7.org/fhir/R4/valueset-issue-type.html
export type IssueType =
  | "invalid"
  | "structure"
  | "required"
  | "value"
  | "invariant"
  | "security"
  | "login"
  | "unknown"
  | "expired"
  | "forbidden"
  | "suppressed"
  | "processing"
  | "not-supported"
  | "duplicate"
  | "multiple-matches"
  | "not-found"
  | "deleted"
  | "too-long"
  | "code-invalid"
  | "extension"
  | "too-costly"
  | "business-rule"
  | "conflict"
  | "transient"
  | "lock-error"
  | "no-store"
  | "exception"
  | "timeout"
  | "incomplete"
  | "throttled"
  | "informational";

export interface OperationOutcomeIssue {
  severity: IssueSeverity;
  code: IssueType;
  details?: CodeableConcept;
  diagnostics?: string;
  expression?: string[];
}

export interface OperationOutcome {
  resourceType: "OperationOutcome";
  id?: string;
  issue: OperationOutcomeIssue[];
}

const SEVERITY_RANK: Record<IssueSeverity, number> = { fatal: 3, error: 2, warning: 1, information: 0 };

function isOperationOutcome(body: unknown): body is OperationOutcome {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as { resourceType?: unknown }).resourceType === "OperationOutcome" &&
    Array.isArray((body as { issue?: unknown }).issue)
  );
}

function worstSeverity(issues: OperationOutcomeIssue[]): IssueSeverity | undefined {
  return issues.reduce<IssueSeverity | undefined>((worst, issue) => {
    if (!worst || SEVERITY_RANK[issue.severity] > SEVERITY_RANK[worst]) return issue.severity;
    return worst;
  }, undefined);
}

export class FhirClientError extends Error {
  readonly status: number;
  readonly issues: OperationOutcomeIssue[];
  readonly severity: IssueSeverity | undefined;
  readonly operationOutcome: OperationOutcome | undefined;

  constructor(message: string, status: number, issues: OperationOutcomeIssue[] = [], operationOutcome?: OperationOutcome) {
    super(message);
    this.name = "FhirClientError";
    this.status = status;
    this.issues = issues;
    this.severity = worstSeverity(issues);
    this.operationOutcome = operationOutcome;
  }
}

// Never called from a logging path — body may carry patient-identifying data, so this only feeds error construction, never console/log output.
export function parseErrorResponse(status: number, body: unknown): FhirClientError {
  if (isOperationOutcome(body)) {
    const issues = body.issue;
    const first = issues[0];
    const message = first?.diagnostics ?? first?.details?.text ?? `FHIR server returned ${issues.length} issue(s) with status ${status}`;
    return new FhirClientError(message, status, issues, body);
  }
  return new FhirClientError(`FHIR request failed with status ${status}`, status);
}
