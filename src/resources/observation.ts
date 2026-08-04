// FHIR R4 Observation — https://hl7.org/fhir/R4/observation.html
import type { Annotation, CodeableConcept, Identifier, Meta, Period, Quantity, Reference } from "./common.js";

export type ObservationStatus =
  | "registered"
  | "preliminary"
  | "final"
  | "amended"
  | "corrected"
  | "cancelled"
  | "entered-in-error"
  | "unknown";

export interface ObservationComponent {
  code: CodeableConcept;
  valueQuantity?: Quantity;
  valueCodeableConcept?: CodeableConcept;
  valueString?: string;
  valueBoolean?: boolean;
  dataAbsentReason?: CodeableConcept;
}

export interface Observation {
  resourceType: "Observation";
  id?: string;
  meta?: Meta;
  identifier?: Identifier[];
  status: ObservationStatus;
  category?: CodeableConcept[];
  code: CodeableConcept;
  subject?: Reference;
  encounter?: Reference;
  effectiveDateTime?: string;
  effectivePeriod?: Period;
  issued?: string;
  performer?: Reference[];
  valueQuantity?: Quantity;
  valueCodeableConcept?: CodeableConcept;
  valueString?: string;
  valueBoolean?: boolean;
  dataAbsentReason?: CodeableConcept;
  interpretation?: CodeableConcept[];
  note?: Annotation[];
  component?: ObservationComponent[];
}
