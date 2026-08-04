import type { TokenProvider } from "./auth.js";
import {
  type Bundle,
  BundleBuilder,
  type BatchEntryResult,
  type FhirResource,
  type SearchResult,
  parseBatchResponse,
  parseSearchBundle,
} from "./bundle.js";
import { CapabilityCache, type CapabilityStatement, type TypeRestfulInteraction, supportsOperation as checkSupportsOperation } from "./capability.js";
import { parseErrorResponse } from "./errors.js";
import {
  type ConditionSearchParams,
  type EncounterSearchParams,
  type ObservationSearchParams,
  type PatientSearchParams,
  type SearchParams,
  buildConditionSearchQuery,
  buildEncounterSearchQuery,
  buildObservationSearchQuery,
  buildPatientSearchQuery,
  buildSearchQuery,
} from "./search.js";
import type { Condition } from "./resources/condition.js";
import type { Encounter } from "./resources/encounter.js";
import type { Observation } from "./resources/observation.js";
import type { Patient } from "./resources/patient.js";

export interface RetryConfig {
  /** Max retry attempts after the initial try. */
  attempts: number;
  /** Base backoff in ms, doubled per attempt. Default 250. */
  backoffMs?: number;
  /** HTTP statuses to retry on. Default: any 5xx. */
  retryOnStatus?: number[];
}

export interface FhirClientConfig {
  baseUrl: string;
  tokenProvider?: TokenProvider;
  headers?: Record<string, string>;
  /** Off by default — retries only happen when this is set. */
  retry?: RetryConfig;
  /** Unsafe — only for local sandbox testing against http://, never production. */
  allowInsecureHttp?: boolean;
  capabilityCacheTtlMs?: number;
  /** Injectable for test doubles or runtimes without a global fetch. Defaults to global fetch. */
  fetchFn?: typeof fetch;
  /** Logs method + status-code only, via console.debug; URLs are redacted (see redactUrlForLogging). */
  debug?: boolean;
}

// Search-parameter keys treated as patient-identifying for debug-log redaction (NFR 6.1).
const SENSITIVE_SEARCH_PARAMS = new Set([
  "name",
  "given",
  "family",
  "identifier",
  "birthdate",
  "address",
  "address-city",
  "address-state",
  "address-postalcode",
  "address-country",
  "telecom",
  "email",
  "phone",
]);

function redactUrlForLogging(url: string): string {
  const parsed = new URL(url);
  for (const key of Array.from(parsed.searchParams.keys())) {
    if (SENSITIVE_SEARCH_PARAMS.has(key)) parsed.searchParams.set(key, "[REDACTED]");
  }
  return parsed.toString();
}

export class FhirClient {
  private readonly fetchFn: typeof fetch;
  private readonly capabilityCache: CapabilityCache;

  constructor(private readonly config: FhirClientConfig) {
    const protocol = new URL(config.baseUrl).protocol;
    if (protocol !== "https:" && !config.allowInsecureHttp) {
      throw new Error(
        "FhirClient requires an https:// baseUrl. Pass allowInsecureHttp: true only for local sandbox testing against http:// — never in production.",
      );
    }
    // Bind to globalThis — an unbound `fetch` reference throws "Illegal invocation"
    // in browsers (native fetch requires Window/WorkerGlobalScope as receiver); Node
    // tolerates the unbound call, which is why this only surfaces in browser runtimes.
    this.fetchFn = config.fetchFn ?? fetch.bind(globalThis);
    this.capabilityCache = new CapabilityCache(config.capabilityCacheTtlMs);
  }

  // --- FR2: Resource CRUD ---

  async read<T extends FhirResource = FhirResource>(resourceType: string, id: string): Promise<T> {
    return this.request<T>("GET", `${resourceType}/${id}`);
  }

  async vread<T extends FhirResource = FhirResource>(resourceType: string, id: string, versionId: string): Promise<T> {
    return this.request<T>("GET", `${resourceType}/${id}/_history/${versionId}`);
  }

  async create<T extends FhirResource>(resource: T): Promise<T> {
    return this.request<T>("POST", resource.resourceType, resource);
  }

  async update<T extends FhirResource>(resource: T): Promise<T> {
    if (!resource.id) throw new Error("update() requires resource.id to be set");
    return this.request<T>("PUT", `${resource.resourceType}/${resource.id}`, resource);
  }

  async delete(resourceType: string, id: string): Promise<void> {
    await this.request<void>("DELETE", `${resourceType}/${id}`);
  }

  // --- FR3: Search ---

  async search<T extends FhirResource = FhirResource>(resourceType: string, params: SearchParams = {}): Promise<SearchResult<T>> {
    const qs = buildSearchQuery(params).toString();
    const bundle = await this.request<Bundle<T>>("GET", qs ? `${resourceType}?${qs}` : resourceType);
    return parseSearchBundle(bundle);
  }

  async searchPatients(params: PatientSearchParams = {}): Promise<SearchResult<Patient>> {
    const bundle = await this.request<Bundle<Patient>>("GET", `Patient?${buildPatientSearchQuery(params).toString()}`);
    return parseSearchBundle(bundle);
  }

  async searchObservations(params: ObservationSearchParams = {}): Promise<SearchResult<Observation>> {
    const bundle = await this.request<Bundle<Observation>>("GET", `Observation?${buildObservationSearchQuery(params).toString()}`);
    return parseSearchBundle(bundle);
  }

  async searchEncounters(params: EncounterSearchParams = {}): Promise<SearchResult<Encounter>> {
    const bundle = await this.request<Bundle<Encounter>>("GET", `Encounter?${buildEncounterSearchQuery(params).toString()}`);
    return parseSearchBundle(bundle);
  }

  async searchConditions(params: ConditionSearchParams = {}): Promise<SearchResult<Condition>> {
    const bundle = await this.request<Bundle<Condition>>("GET", `Condition?${buildConditionSearchQuery(params).toString()}`);
    return parseSearchBundle(bundle);
  }

  // --- FR4: Bundle handling ---

  async nextPage<T extends FhirResource = FhirResource>(result: SearchResult<T>): Promise<SearchResult<T> | undefined> {
    if (!result.next) return undefined;
    const bundle = await this.request<Bundle<T>>("GET", result.next);
    return parseSearchBundle(bundle);
  }

  async executeBundle<T extends FhirResource = FhirResource>(
    builder: BundleBuilder,
    type: "batch" | "transaction",
  ): Promise<BatchEntryResult<T>[]> {
    const responseBundle = await this.request<Bundle<T>>("POST", "", builder.build(type));
    return parseBatchResponse(responseBundle);
  }

  // --- FR5: Capability discovery ---

  async fetchCapabilityStatement(): Promise<CapabilityStatement> {
    return this.capabilityCache.getOrFetch(() => this.request<CapabilityStatement>("GET", "metadata"));
  }

  async supportsOperation(resourceType: string, interaction: TypeRestfulInteraction): Promise<boolean> {
    const statement = await this.fetchCapabilityStatement();
    return checkSupportsOperation(statement, resourceType, interaction);
  }

  // --- internals ---

  private resolveUrl(path: string): string {
    if (/^https?:\/\//.test(path)) return path;
    const base = this.config.baseUrl.endsWith("/") ? this.config.baseUrl : `${this.config.baseUrl}/`;
    return new URL(path, base).toString();
  }

  private shouldRetry(attemptNumber: number, status: number | undefined): boolean {
    const retry = this.config.retry;
    if (!retry || attemptNumber >= retry.attempts) return false;
    if (status === undefined) return true;
    if (retry.retryOnStatus) return retry.retryOnStatus.includes(status);
    return status >= 500 && status < 600;
  }

  private async backoffDelay(attemptNumber: number): Promise<void> {
    const base = this.config.retry?.backoffMs ?? 250;
    await new Promise((resolve) => setTimeout(resolve, base * 2 ** attemptNumber));
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = this.resolveUrl(path);
    const { status, body: responseBody } = await this.requestWithRetry(method, url, body, 0);
    if (status >= 200 && status < 300) return responseBody as T;
    throw parseErrorResponse(status, responseBody);
  }

  private async requestWithRetry(
    method: string,
    url: string,
    body: unknown,
    attemptNumber: number,
  ): Promise<{ status: number; body: unknown }> {
    const headers: Record<string, string> = { Accept: "application/fhir+json", ...this.config.headers };
    if (body !== undefined) headers["Content-Type"] = "application/fhir+json";
    if (this.config.tokenProvider) {
      headers.Authorization = `Bearer ${await this.config.tokenProvider()}`;
    }

    const init: RequestInit = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);

    let response: Response;
    try {
      response = await this.fetchFn(url, init);
    } catch (networkError) {
      if (this.shouldRetry(attemptNumber, undefined)) {
        await this.backoffDelay(attemptNumber);
        return this.requestWithRetry(method, url, body, attemptNumber + 1);
      }
      throw networkError;
    }

    if (this.config.debug) {
      console.debug(`[fhir-client] ${method} ${redactUrlForLogging(url)} -> ${response.status}`);
    }

    if (!response.ok && this.shouldRetry(attemptNumber, response.status)) {
      await this.backoffDelay(attemptNumber);
      return this.requestWithRetry(method, url, body, attemptNumber + 1);
    }

    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : undefined };
  }
}
