// FHIR R4 Patient — https://hl7.org/fhir/R4/patient.html
import type { Address, CodeableConcept, ContactPoint, HumanName, Identifier, Meta, Reference } from "./common.js";

export interface Patient {
  resourceType: "Patient";
  id?: string;
  meta?: Meta;
  identifier?: Identifier[];
  active?: boolean;
  name?: HumanName[];
  telecom?: ContactPoint[];
  gender?: "male" | "female" | "other" | "unknown";
  birthDate?: string;
  deceasedBoolean?: boolean;
  deceasedDateTime?: string;
  address?: Address[];
  maritalStatus?: CodeableConcept;
  multipleBirthBoolean?: boolean;
  multipleBirthInteger?: number;
  communication?: Array<{ language: CodeableConcept; preferred?: boolean }>;
  generalPractitioner?: Reference[];
  managingOrganization?: Reference;
}
