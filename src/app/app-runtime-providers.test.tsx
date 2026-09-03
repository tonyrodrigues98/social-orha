import { renderToStaticMarkup } from "react-dom/server";
import { useQueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  useExploreRepository,
  type ExploreRepository,
} from "@/domains/explore";
import {
  useMessagingServices,
  type MessagingServices,
} from "@/domains/messaging";
import {
  useNotificationRepository,
  type NotificationRepository,
} from "@/domains/notifications";
import {
  useSocialRepository,
  type SocialRepository,
} from "@/domains/social";
import {
  useTrustRepository,
  type TrustRepository,
} from "@/domains/trust";
import type { AppRuntimeAdapters } from "./app-runtime-adapters";
import { AppRuntimeProviders } from "./app-runtime-providers";

describe("AppRuntimeProviders", () => {
  it("mounts every runtime repository together with TanStack Query", () => {
    const adapters: AppRuntimeAdapters = {
      explore: Object.create(null) as ExploreRepository,
      social: Object.create(null) as SocialRepository,
      notifications: Object.create(null) as NotificationRepository,
      trust: Object.create(null) as TrustRepository,
      messaging: Object.create(null) as MessagingServices,
    };
    let observed: AppRuntimeAdapters | undefined;
    let hasQueryClient = false;

    function Probe() {
      observed = {
        explore: useExploreRepository(),
        social: useSocialRepository(),
        notifications: useNotificationRepository(),
        trust: useTrustRepository(),
        messaging: useMessagingServices(),
      };
      hasQueryClient = Boolean(useQueryClient());
      return <span>ready</span>;
    }

    expect(
      renderToStaticMarkup(
        <AppRuntimeProviders adapters={adapters}>
          <Probe />
        </AppRuntimeProviders>,
      ),
    ).toContain("ready");
    expect(observed).toEqual(adapters);
    expect(hasQueryClient).toBe(true);
  });
});
