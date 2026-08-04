// FHIR R4 Encounter — https://hl7.org/fhir/R4/encounter.html
// Note: in R4, Encounter.class is a single Coding, not CodeableConcept/array —
// that changed in R5. Do not "correct" this to match R5.
import type { CodeableConcept, Coding, Meta, Period, Reference, Identifier } from "./common.js";

export type EncounterStatus =
  | "planned"
  | "arrived"
  | "triaged"
  | "in-progress"
  | "onleave"
  | "finished"
  | "cancelled"
  | "entered-in-error"
  | "unknown";

export interface EncounterParticipant {
  type?: CodeableConcept[];
  period?: Period;
  individual?: Reference;
}

export interface EncounterLocation {
  location: Reference;
  status?: "planned" | "active" | "reserved" | "completed";
}

export interface EncounterHospitalization {
  admitSource?: CodeableConcept;
  dischargeDisposition?: CodeableConcept;
}

export interface Encounter {
  resourceType: "Encounter";
  id?: string;
  meta?: Meta;
  identifier?: Identifier[];
  status: EncounterStatus;
  class: Coding;
  type?: CodeableConcept[];
  subject?: Reference;
  participant?: EncounterParticipant[];
  period?: Period;
  reasonCode?: CodeableConcept[];
  hospitalization?: EncounterHospitalization;
  location?: EncounterLocation[];
  serviceProvider?: Reference;
}
