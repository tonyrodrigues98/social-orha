import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./index.css", import.meta.url), "utf8");
const drawer = readFileSync(
  new URL("../components/godui/drawer.tsx", import.meta.url),
  "utf8",
);

describe("iOS editable-control zoom contract", () => {
  it("covers editable controls rendered by the React Aria modal portal", () => {
    expect(drawer).toContain("orha-modal-overlay");
    expect(styles).toMatch(
      /\.orha-modal-overlay\s+:where\([\s\S]*?textarea,[\s\S]*?select,[\s\S]*?\[contenteditable\]:not\(\[contenteditable="false"\]\)[\s\S]*?\)\s*\{[\s\S]*?font-size:\s*16px\s*!important;/,
    );
  });

  it("does not apply the portal typography rule to buttons", () => {
    const portalRule = styles.match(
      /\.orha-modal-overlay\s+:where\(([\s\S]*?)\)\s*\{[\s\S]*?font-size:\s*16px\s*!important;/,
    )?.[1];

    expect(portalRule).toBeDefined();
    expect(portalRule).not.toMatch(/(^|,)\s*button\b/);
  });
});
