// FHIR R4 Condition — https://hl7.org/fhir/R4/condition.html
import type { Annotation, CodeableConcept, Identifier, Meta, Period, Reference } from "./common.js";

export interface Condition {
  resourceType: "Condition";
  id?: string;
  meta?: Meta;
  identifier?: Identifier[];
  clinicalStatus?: CodeableConcept;
  verificationStatus?: CodeableConcept;
  category?: CodeableConcept[];
  severity?: CodeableConcept;
  code?: CodeableConcept;
  subject: Reference;
  encounter?: Reference;
  onsetDateTime?: string;
  onsetPeriod?: Period;
  recordedDate?: string;
  note?: Annotation[];
}
