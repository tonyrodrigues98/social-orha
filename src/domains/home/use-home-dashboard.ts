import { useQuery } from "@tanstack/react-query";
import { getHomeDashboardRepository } from "@/infrastructure/supabase/home/home-dashboard-repository";
import type { HomeDashboardRepository } from "./types";

export const homeDashboardKeys = {
  all: ["home-dashboard"] as const,
  summary: (profileId: string) => ["home-dashboard", profileId, "summary"] as const,
};

export function useHomeDashboard(
  profileId: string,
  repository?: HomeDashboardRepository,
) {
  return useQuery({
    queryKey: homeDashboardKeys.summary(profileId),
    queryFn: ({ signal }) => (repository ?? getHomeDashboardRepository()).getSummary({
      recentLimit: 5,
      signal,
    }),
    enabled: Boolean(profileId),
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });
}
