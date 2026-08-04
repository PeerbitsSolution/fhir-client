// FHIR R4 Bundle — https://hl7.org/fhir/R4/bundle.html
import type { OperationOutcome } from "./errors.js";

// Generic typed escape hatch (handover §3.2 Resource<T>) — covers any resource type
// not (yet) given a dedicated interface under resources/. No index signature here
// deliberately: one would force every concrete resource interface (Patient, etc.) to
// also declare an index signature to stay structurally assignable to FhirResource.
export interface FhirResource {
  resourceType: string;
  id?: string;
  meta?: { versionId?: string; lastUpdated?: string; profile?: string[] };
}

export type Resource<T extends string = string> = FhirResource & { resourceType: T };

// For callers that genuinely need arbitrary-field access on an untyped resource.
export type GenericResource = FhirResource & Record<string, unknown>;

export type BundleType =
  | "document"
  | "message"
  | "transaction"
  | "transaction-response"
  | "batch"
  | "batch-response"
  | "history"
  | "searchset"
  | "collection";

export interface BundleLink {
  relation: string;
  url: string;
}

export interface BundleEntryRequest {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  url: string;
}

export interface BundleEntryResponse {
  status: string;
  location?: string;
  etag?: string;
  outcome?: OperationOutcome;
}

export interface BundleEntrySearch {
  mode?: "match" | "include" | "outcome";
  score?: number;
}

export interface BundleEntry<T extends FhirResource = FhirResource> {
  fullUrl?: string;
  resource?: T;
  search?: BundleEntrySearch;
  request?: BundleEntryRequest;
  response?: BundleEntryResponse;
}

export interface Bundle<T extends FhirResource = FhirResource> {
  resourceType: "Bundle";
  id?: string;
  type: BundleType;
  total?: number;
  link?: BundleLink[];
  entry?: BundleEntry<T>[];
}

export interface SearchResult<T extends FhirResource = FhirResource> {
  resources: T[];
  total?: number | undefined;
  next?: string | undefined;
}

export function parseSearchBundle<T extends FhirResource = FhirResource>(bundle: Bundle<T>): SearchResult<T> {
  const resources = (bundle.entry ?? [])
    .filter((entry): entry is BundleEntry<T> & { resource: T } => entry.resource !== undefined && entry.search?.mode !== "outcome")
    .map((entry) => entry.resource);
  const next = bundle.link?.find((link) => link.relation === "next")?.url;
  return { resources, total: bundle.total, next };
}

// Collects operations, then builds one Bundle to execute as batch or transaction (FR4).
export class BundleBuilder {
  private readonly entries: BundleEntry[] = [];

  read(resourceType: string, id: string): this {
    this.entries.push({ request: { method: "GET", url: `${resourceType}/${id}` } });
    return this;
  }

  // Generic (matching FhirClient.create/update) so a resource literal's extra fields
  // (name, gender, ...) don't trip TypeScript's excess-property check against a fixed
  // FhirResource parameter type — T is inferred from the argument itself instead.
  create<T extends FhirResource>(resource: T): this {
    this.entries.push({ resource, request: { method: "POST", url: resource.resourceType } });
    return this;
  }

  update<T extends FhirResource>(resource: T): this {
    if (!resource.id) throw new Error("BundleBuilder.update() requires resource.id to be set");
    this.entries.push({ resource, request: { method: "PUT", url: `${resource.resourceType}/${resource.id}` } });
    return this;
  }

  delete(resourceType: string, id: string): this {
    this.entries.push({ request: { method: "DELETE", url: `${resourceType}/${id}` } });
    return this;
  }

  build(type: "batch" | "transaction"): Bundle {
    return { resourceType: "Bundle", type, entry: [...this.entries] };
  }
}

export interface BatchEntryResult<T extends FhirResource = FhirResource> {
  status: number;
  resource?: T | undefined;
  outcome?: OperationOutcome | undefined;
  location?: string | undefined;
}

// Maps a batch/transaction-response Bundle back to per-entry results, positionally
// aligned with the request Bundle's entries.
export function parseBatchResponse<T extends FhirResource = FhirResource>(bundle: Bundle<T>): BatchEntryResult<T>[] {
  return (bundle.entry ?? []).map((entry) => ({
    status: parseInt(entry.response?.status ?? "0", 10) || 0,
    resource: entry.resource,
    outcome: entry.response?.outcome,
    location: entry.response?.location,
  }));
}
