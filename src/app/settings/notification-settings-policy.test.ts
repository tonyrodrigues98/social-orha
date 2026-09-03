import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildLaunchNotificationPreferencesUpdate } from "./notification-settings-policy";

describe("launch notification settings", () => {
  it("keeps critical notices mandatory and never persists unsupported delivery toggles", () => {
    expect(buildLaunchNotificationPreferencesUpdate({
      socialEnabled: false,
      messagesEnabled: true,
      communityEnabled: false,
      systemEnabled: false,
      emailEnabled: true,
      pushEnabled: true,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
    })).toEqual({
      socialEnabled: false,
      messagesEnabled: true,
      communityEnabled: false,
      systemEnabled: true,
      emailEnabled: false,
      pushEnabled: false,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
    });
  });

  it("does not render controls that would only pretend to deliver e-mail or push", () => {
    const source = readFileSync(new URL("../pages/settings-page.tsx", import.meta.url), "utf8");

    expect(source).not.toContain('label="E-mail"');
    expect(source).not.toContain('label="Push"');
    expect(source).not.toContain('toggle("systemEnabled")');
    expect(source).toContain("Avisos críticos sobre sua conta");
  });
});
