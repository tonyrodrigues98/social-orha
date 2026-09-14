import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914080000_worker_scheduler_foundation.sql"),
  "utf8",
);

describe("worker scheduler migration", () => {
  it("uses the supported Cron, pg_net, and Vault path without embedded credentials", () => {
    expect(migration).toContain("create extension if not exists pg_cron");
    expect(migration).toContain("create extension if not exists pg_net");
    expect(migration).toContain("from vault.decrypted_secrets");
    expect(migration).toContain("net.http_post(");
    expect(migration).not.toMatch(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/);
    expect(migration).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{16,}/);
  });

  it("allows only the two bounded workers and never exposes invocation to app roles", () => {
    expect(migration).toContain("p_worker_name not in ('account-lifecycle-worker', 'media-cleanup-worker')");
    expect(migration).toContain("p_limit < 1 or p_limit > 100");
    expect(migration).toContain(
      "revoke all on function private.invoke_orha_worker(text, integer) from public, anon, authenticated, service_role",
    );
    expect(migration).toContain("grant execute on function private.invoke_orha_worker(text, integer) to postgres");
  });

  it("replaces named jobs deterministically with the approved schedules", () => {
    expect(migration).toContain("perform cron.unschedule(v_job_id)");
    expect(migration).toContain("'orha-account-lifecycle-worker',\n    '*/5 * * * *'");
    expect(migration).toContain("'orha-media-cleanup-worker',\n    '*/10 * * * *'");
    expect(migration).toContain("'account-lifecycle-worker'', 10");
    expect(migration).toContain("'media-cleanup-worker'', 50");
  });
});
