import { describe, expect, it } from "vitest";
import { parseLifecycleRpcRow } from "../_shared/database-row";

const validRow = {
  id: "7777e0bc-bce4-4ca5-b88f-5f25b1fa37f8",
  user_id: "09f1d827-043f-42d5-86ae-05b7644d3d34",
  kind: "deactivate",
  status: "processing",
  execute_after: "2026-09-14T05:00:00.000Z",
};

describe("lifecycle RPC row parsing", () => {
  it("treats an empty or NULL composite as an empty queue", () => {
    expect(parseLifecycleRpcRow(null)).toBeNull();
    expect(parseLifecycleRpcRow([])).toBeNull();
    expect(parseLifecycleRpcRow([{ id: null, user_id: null, kind: null, status: null, execute_after: null }])).toBeNull();
  });

  it("accepts a valid claimed lifecycle request", () => {
    expect(parseLifecycleRpcRow([validRow])).toEqual(validRow);
  });

  it("rejects a partially malformed queue response instead of processing it", () => {
    expect(() => parseLifecycleRpcRow([{ ...validRow, id: null }])).toThrow("invalid_lifecycle_rpc_row");
    expect(() => parseLifecycleRpcRow("unexpected")).toThrow("invalid_lifecycle_rpc_row");
  });
});
