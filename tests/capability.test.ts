import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CapabilityCache, type CapabilityStatement, supportsOperation } from "../src/capability";

const syntheticCapabilityStatement: CapabilityStatement = {
  resourceType: "CapabilityStatement",
  status: "active",
  kind: "instance",
  rest: [
    {
      mode: "server",
      resource: [
        { type: "Patient", interaction: [{ code: "read" }, { code: "search-type" }] },
        { type: "Observation", interaction: [{ code: "read" }] },
      ],
    },
  ],
};

describe("supportsOperation", () => {
  it("returns true when the server rest entry lists the interaction", () => {
    expect(supportsOperation(syntheticCapabilityStatement, "Patient", "search-type")).toBe(true);
  });

  it("returns false when the interaction isn't listed", () => {
    expect(supportsOperation(syntheticCapabilityStatement, "Observation", "delete")).toBe(false);
  });

  it("returns false for a resource type not in the statement", () => {
    expect(supportsOperation(syntheticCapabilityStatement, "Encounter", "read")).toBe(false);
  });

  it("returns false when there is no server rest entry", () => {
    expect(supportsOperation({ resourceType: "CapabilityStatement" }, "Patient", "read")).toBe(false);
  });
});

describe("CapabilityCache", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("only calls the fetcher once while the cached value is fresh", async () => {
    const cache = new CapabilityCache(1000);
    const fetcher = vi.fn().mockResolvedValue(syntheticCapabilityStatement);

    await cache.getOrFetch(fetcher);
    await cache.getOrFetch(fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("re-fetches once the TTL has elapsed", async () => {
    const cache = new CapabilityCache(1000);
    const fetcher = vi.fn().mockResolvedValue(syntheticCapabilityStatement);

    await cache.getOrFetch(fetcher);
    vi.advanceTimersByTime(1001);
    await cache.getOrFetch(fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
