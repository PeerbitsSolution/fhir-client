// Search-parameter builders. Field names are grounded in the FHIR R4 search-parameter
// registry (https://hl7.org/fhir/R4/searchparameter-registry.html), not inferred from
// general REST convention.

export type SearchParamValue = string | number | boolean | string[];
export type SearchParams = Record<string, SearchParamValue | undefined>;

// Generic escape hatch (FR3) — any resource type, any search parameter, including
// chained (e.g. "subject.name") and composite (e.g. "code-value-quantity") params,
// which are just passed through as raw keys.
export function buildSearchQuery(params: SearchParams): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, String(item));
    } else {
      query.set(key, String(value));
    }
  }
  return query;
}

// https://hl7.org/fhir/R4/patient.html#search
export interface PatientSearchParams {
  _id?: string;
  identifier?: string;
  name?: string;
  family?: string;
  given?: string;
  birthdate?: string;
  gender?: "male" | "female" | "other" | "unknown";
  address?: string;
  "address-city"?: string;
  "address-state"?: string;
  "address-postalcode"?: string;
  "address-country"?: string;
  telecom?: string;
  email?: string;
  phone?: string;
  active?: boolean;
  deceased?: boolean;
  "general-practitioner"?: string;
  organization?: string;
  _count?: number;
  _sort?: string;
}

// https://hl7.org/fhir/R4/observation.html#search
export interface ObservationSearchParams {
  _id?: string;
  identifier?: string;
  status?: "registered" | "preliminary" | "final" | "amended" | "corrected" | "cancelled" | "entered-in-error" | "unknown";
  category?: string;
  code?: string;
  subject?: string;
  patient?: string;
  encounter?: string;
  date?: string | string[];
  "value-quantity"?: string;
  "value-string"?: string;
  "value-concept"?: string;
  performer?: string;
  "based-on"?: string;
  _count?: number;
  _sort?: string;
}

// https://hl7.org/fhir/R4/encounter.html#search
export interface EncounterSearchParams {
  _id?: string;
  identifier?: string;
  status?: "planned" | "arrived" | "triaged" | "in-progress" | "onleave" | "finished" | "cancelled" | "entered-in-error" | "unknown";
  class?: string;
  type?: string;
  subject?: string;
  patient?: string;
  participant?: string;
  practitioner?: string;
  date?: string | string[];
  location?: string;
  "reason-code"?: string;
  "service-provider"?: string;
  _count?: number;
  _sort?: string;
}

// https://hl7.org/fhir/R4/condition.html#search
export interface ConditionSearchParams {
  _id?: string;
  identifier?: string;
  "clinical-status"?: string;
  "verification-status"?: string;
  category?: string;
  severity?: string;
  code?: string;
  subject?: string;
  patient?: string;
  encounter?: string;
  "onset-date"?: string | string[];
  "recorded-date"?: string | string[];
  "abatement-date"?: string | string[];
  _count?: number;
  _sort?: string;
}

export function buildPatientSearchQuery(params: PatientSearchParams): URLSearchParams {
  return buildSearchQuery(params as SearchParams);
}

export function buildObservationSearchQuery(params: ObservationSearchParams): URLSearchParams {
  return buildSearchQuery(params as SearchParams);
}

export function buildEncounterSearchQuery(params: EncounterSearchParams): URLSearchParams {
  return buildSearchQuery(params as SearchParams);
}

export function buildConditionSearchQuery(params: ConditionSearchParams): URLSearchParams {
  return buildSearchQuery(params as SearchParams);
}
