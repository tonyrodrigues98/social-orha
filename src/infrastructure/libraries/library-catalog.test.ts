import { describe, expect, it } from "vitest";

import { installedPackageNames, libraryCatalog, quarantinedPackageNames } from "./library-catalog";

describe("library catalog", () => {
  it("keeps every researched candidate represented", () => {
    expect(libraryCatalog).toHaveLength(43);
    expect(new Set(libraryCatalog.map((entry) => entry.name)).size).toBe(libraryCatalog.length);
  });

  it("associates packages with every npm entry", () => {
    const incomplete = libraryCatalog.filter((entry) => entry.kind === "npm" && !entry.packages?.length);
    expect(incomplete).toEqual([]);
    expect(installedPackageNames.length).toBeGreaterThan(40);
  });

  it("keeps risky alternatives explicitly quarantined", () => {
    expect(quarantinedPackageNames).toEqual(expect.arrayContaining([
      "@emoji-mart/react",
      "react-media-recorder",
      "vaul",
    ]));
    expect(libraryCatalog.find((entry) => entry.name === "Vidstack")?.status).toBe("installed");
  });
});
