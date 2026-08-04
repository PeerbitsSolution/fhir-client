// Public API surface — everything a consumer should import lives here.
export { FhirClient } from "./client.js";
export type { FhirClientConfig, RetryConfig } from "./client.js";

export type { TokenProvider } from "./auth.js";

export { BundleBuilder, parseSearchBundle, parseBatchResponse } from "./bundle.js";
export type {
  Bundle,
  BundleEntry,
  BundleEntryRequest,
  BundleEntryResponse,
  BundleEntrySearch,
  BundleLink,
  BundleType,
  BatchEntryResult,
  FhirResource,
  Resource,
  SearchResult,
} from "./bundle.js";

export { FhirClientError, parseErrorResponse } from "./errors.js";
export type { IssueSeverity, IssueType, OperationOutcome, OperationOutcomeIssue } from "./errors.js";

export { supportsOperation, CapabilityCache } from "./capability.js";
export type {
  CapabilityStatement,
  CapabilityStatementRest,
  CapabilityStatementRestResource,
  TypeRestfulInteraction,
} from "./capability.js";

export {
  buildSearchQuery,
  buildPatientSearchQuery,
  buildObservationSearchQuery,
  buildEncounterSearchQuery,
  buildConditionSearchQuery,
} from "./search.js";
export type {
  SearchParams,
  SearchParamValue,
  PatientSearchParams,
  ObservationSearchParams,
  EncounterSearchParams,
  ConditionSearchParams,
} from "./search.js";

export type {
  Address,
  Annotation,
  CodeableConcept,
  Coding,
  ContactPoint,
  HumanName,
  Identifier,
  Meta,
  Period,
  Quantity,
  Reference,
} from "./resources/common.js";
export type { Patient } from "./resources/patient.js";
export type { Observation, ObservationComponent, ObservationStatus } from "./resources/observation.js";
export type {
  Encounter,
  EncounterHospitalization,
  EncounterLocation,
  EncounterParticipant,
  EncounterStatus,
} from "./resources/encounter.js";
export type { Condition } from "./resources/condition.js";

export const VERSION = "1.0.0";
