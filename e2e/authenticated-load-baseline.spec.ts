import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "playwright/test";
import {
  expectedSupabaseHost,
  requireNamedCredentials,
  type TestPrincipal,
} from "./support/environment";

const principals: readonly TestPrincipal[] = [
  "user-a",
  "user-b",
  "admin",
  "moderator",
  "support",
];
const rounds = 6;

type TimedResult = {
  durationMs: number;
  error: unknown;
};

type Metric = {
  samples: number;
  errors: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
};

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} é obrigatório para o baseline remoto.`);
  return value;
}

function percentile(values: readonly number[], percentileValue: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.max(
    0,
    Math.min(ordered.length - 1, Math.ceil(percentileValue * ordered.length) - 1),
  );
  return ordered[index] ?? Number.POSITIVE_INFINITY;
}

function metric(results: readonly TimedResult[]): Metric {
  const durations = results.map(({ durationMs }) => durationMs);
  return {
    samples: results.length,
    errors: results.filter(({ error }) => Boolean(error)).length,
    p50Ms: Math.round(percentile(durations, 0.5)),
    p95Ms: Math.round(percentile(durations, 0.95)),
    p99Ms: Math.round(percentile(durations, 0.99)),
    maxMs: Math.round(Math.max(...durations)),
  };
}

async function timed(operation: () => Promise<{ error: unknown }>): Promise<TimedResult> {
  const startedAt = performance.now();
  const result = await operation().catch((error: unknown) => ({ error }));
  return {
    durationMs: performance.now() - startedAt,
    error: result.error,
  };
}

async function measureConcurrentReads(
  clients: readonly SupabaseClient[],
  operation: (client: SupabaseClient) => PromiseLike<{ error: unknown }>,
): Promise<TimedResult[]> {
  const samples: TimedResult[] = [];
  for (let round = 0; round < rounds; round += 1) {
    samples.push(
      ...(await Promise.all(
        clients.map((client) =>
          timed(() => Promise.resolve(operation(client))),
        ),
      )),
    );
  }
  return samples;
}

test.describe("baseline remoto de carga", () => {
  test("mede Auth e leituras sociais com concorrência cinco", async ({
    browserName,
  }, testInfo) => {
    test.setTimeout(180_000);
    expect(browserName).toBe("chromium");
    const stagingUrl = requiredEnvironment("ORHA_STAGING_SUPABASE_URL");
    const publishableKey = requiredEnvironment(
      "ORHA_STAGING_SUPABASE_PUBLISHABLE_KEY",
    );
    expect(new URL(stagingUrl).host).toBe(expectedSupabaseHost());

    const clients = principals.map(() =>
      createClient(stagingUrl, publishableKey, {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      }),
    );
    const authSamples = await Promise.all(
      clients.map((client, index) => {
        const credentials = requireNamedCredentials(principals[index]!);
        return timed(() =>
          client.auth.signInWithPassword({
            email: credentials.email,
            password: credentials.password,
          }),
        );
      }),
    );

    try {
      expect(authSamples.filter(({ error }) => error)).toHaveLength(0);
      await Promise.all(
        clients.map((client) =>
          client.rpc("get_home_dashboard_summary", { p_recent_limit: 6 }),
        ),
      );

      const homeSamples = await measureConcurrentReads(clients, (client) =>
        client.rpc("get_home_dashboard_summary", { p_recent_limit: 6 }),
      );
      const profileSamples = await measureConcurrentReads(clients, (client) =>
        client.rpc("search_visible_profiles", {
          search_term: "orha",
          page_size: 20,
          page_offset: 0,
        }),
      );
      const interestSamples = await measureConcurrentReads(clients, (client) =>
        client.rpc("search_discoverable_interests", {
          p_search: "",
          p_limit: 20,
          p_offset: 0,
        }),
      );
      const result = {
        environment: "staging",
        concurrency: clients.length,
        auth: metric(authSamples),
        home: metric(homeSamples),
        profiles: metric(profileSamples),
        interests: metric(interestSamples),
      };

      await testInfo.attach("orha-staging-load-baseline", {
        body: Buffer.from(JSON.stringify(result, null, 2)),
        contentType: "application/json",
      });
      console.log(
        `ORHA staging load baseline: ${JSON.stringify(result)}`,
      );
      expect(result.auth.errors).toBe(0);
      expect(result.auth.p95Ms).toBeLessThanOrEqual(1_500);
      expect(result.auth.p99Ms).toBeLessThanOrEqual(3_000);
      for (const reading of [result.home, result.profiles, result.interests]) {
        expect(reading.samples).toBe(rounds * clients.length);
        expect(reading.errors).toBe(0);
        expect(reading.p95Ms).toBeLessThanOrEqual(1_200);
        expect(reading.p99Ms).toBeLessThanOrEqual(2_500);
      }
    } finally {
      await Promise.all(
        clients.map((client) => client.auth.signOut().catch(() => undefined)),
      );
    }
  });
});
