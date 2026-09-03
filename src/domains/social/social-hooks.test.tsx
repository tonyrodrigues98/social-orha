import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SocialRepository } from "./repository";
import { SocialRepositoryProvider } from "./social-repository-provider";
import { useSocialRepository } from "./social-repository-context";
import { mergeSocialPage } from "./use-social";

describe("social repository injection", () => {
  it("provides the injected adapter without creating a hidden singleton", () => {
    const repository = Object.create(null) as SocialRepository;

    function Probe() {
      return <span>{useSocialRepository() === repository ? "injected" : "missing"}</span>;
    }

    expect(
      renderToStaticMarkup(
        <SocialRepositoryProvider repository={repository}>
          <Probe />
        </SocialRepositoryProvider>,
      ),
    ).toContain("injected");
  });

  it("fails loudly when the provider is missing", () => {
    function Probe() {
      useSocialRepository();
      return null;
    }

    expect(() => renderToStaticMarkup(<Probe />)).toThrow(
      "SocialRepositoryProvider",
    );
  });
});

describe("social pagination", () => {
  it("keeps the first item and ignores duplicate ids from the next page", () => {
    expect(
      mergeSocialPage(
        [{ id: "a", value: 1 }],
        {
          items: [
            { id: "a", value: 2 },
            { id: "b", value: 3 },
          ],
          nextCursor: null,
        },
        true,
        (item) => item.id,
      ),
    ).toEqual([
      { id: "a", value: 1 },
      { id: "b", value: 3 },
    ]);
  });
});
