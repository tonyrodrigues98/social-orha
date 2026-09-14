import { parseLifecycleRpcRow } from "../_shared/database-row.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertThrowsInvalidRow(operation: () => unknown): void {
  try {
    operation();
    throw new Error("malformed lifecycle row was accepted");
  } catch (cause) {
    assert(cause instanceof TypeError, "unexpected error type");
    assert(cause.message === "invalid_lifecycle_rpc_row", "unexpected error message");
  }
}

const validRow = {
  id: "7777e0bc-bce4-4ca5-b88f-5f25b1fa37f8",
  user_id: "09f1d827-043f-42d5-86ae-05b7644d3d34",
  kind: "deactivate",
  status: "processing",
  execute_after: "2026-09-14T05:00:00.000Z",
};

Deno.test("lifecycle RPC parser treats an empty or NULL composite as an empty queue", () => {
  assert(parseLifecycleRpcRow(null) === null, "NULL composite was not empty");
  assert(parseLifecycleRpcRow([]) === null, "empty result was not empty");
  assert(
    parseLifecycleRpcRow([{
      id: null,
      user_id: null,
      kind: null,
      status: null,
      execute_after: null,
    }]) === null,
    "all-NULL composite was not empty",
  );
});

Deno.test("lifecycle RPC parser accepts a valid claimed request", () => {
  const parsed = parseLifecycleRpcRow([validRow]);
  assert(parsed !== null, "valid lifecycle request was discarded");
  assert(JSON.stringify(parsed) === JSON.stringify(validRow), "valid lifecycle request changed");
});

Deno.test("lifecycle RPC parser rejects malformed queue responses", () => {
  assertThrowsInvalidRow(() => parseLifecycleRpcRow([{ ...validRow, id: null }]));
  assertThrowsInvalidRow(() => parseLifecycleRpcRow("unexpected"));
});
