import { exportDatasets } from "../_shared/account-export.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("friendship export uses the deployed addressee_id schema column", () => {
  const dataset = exportDatasets.find((candidate) => candidate.key === "friendships");
  assert(dataset, "friendships dataset is missing");
  const filter = dataset.filter("00000000-0000-4000-8000-000000000001");
  assert("or" in filter, "friendships must export both directions");
  assert(filter.or.includes("requester_id.eq."), "requester filter is missing");
  assert(filter.or.includes("addressee_id.eq."), "addressee filter is missing");
  assert(!filter.or.includes("recipient_id.eq."), "legacy recipient_id filter must not return");
});

Deno.test("account export never discloses the private moderation snapshot to its reporter", () => {
  const dataset = exportDatasets.find((candidate) => candidate.key === "reportsSubmitted");
  assert(dataset?.columns, "reports export must use an explicit safe projection");
  assert(!dataset.columns.includes("target_snapshot"), "moderation target snapshot leaked into export");
  assert(!dataset.columns.includes("target_owner_id"), "moderation target owner leaked into export");
});
