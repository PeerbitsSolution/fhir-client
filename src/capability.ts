// FHIR R4 CapabilityStatement — https://hl7.org/fhir/R4/capabilitystatement.html
export type TypeRestfulInteraction =
  | "read"
  | "vread"
  | "update"
  | "patch"
  | "delete"
  | "history-instance"
  | "history-type"
  | "create"
  | "search-type";

export interface CapabilityStatementRestResource {
  type: string;
  interaction?: Array<{ code: TypeRestfulInteraction }>;
}

export interface CapabilityStatementRest {
  mode: "client" | "server";
  resource?: CapabilityStatementRestResource[];
}

export interface CapabilityStatement {
  resourceType: "CapabilityStatement";
  status?: string;
  date?: string;
  kind?: "instance" | "capability" | "requirements";
  fhirVersion?: string;
  format?: string[];
  rest?: CapabilityStatementRest[];
}

export function supportsOperation(
  statement: CapabilityStatement,
  resourceType: string,
  interaction: TypeRestfulInteraction,
): boolean {
  const serverRest = statement.rest?.find((rest) => rest.mode === "server");
  const resource = serverRest?.resource?.find((r) => r.type === resourceType);
  return resource?.interaction?.some((i) => i.code === interaction) ?? false;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;

// In-memory TTL cache for /metadata (FR5) — fetch orchestration (auth, retry) stays in
// client.ts's request pipeline; this only owns "is the cached copy still fresh".
export class CapabilityCache {
  private cached: { statement: CapabilityStatement; fetchedAt: number } | undefined;

  constructor(private readonly ttlMs: number = DEFAULT_TTL_MS) {}

  get(): CapabilityStatement | undefined {
    if (!this.cached) return undefined;
    if (Date.now() - this.cached.fetchedAt > this.ttlMs) return undefined;
    return this.cached.statement;
  }

  set(statement: CapabilityStatement): void {
    this.cached = { statement, fetchedAt: Date.now() };
  }

  async getOrFetch(fetcher: () => Promise<CapabilityStatement>): Promise<CapabilityStatement> {
    const cached = this.get();
    if (cached) return cached;
    const statement = await fetcher();
    this.set(statement);
    return statement;
  }
}
