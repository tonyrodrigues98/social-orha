import axe from "axe-core";
import { expect, test as base, type Page } from "playwright/test";
import {
  runtimeAllowlist,
  type RuntimeIssueKind,
} from "./runtime-allowlist";

type RuntimeIssue = {
  kind: RuntimeIssueKind;
  message: string;
  url?: string;
  status?: number;
};

type QualityFixtures = {
  runtimeQualityGate: void;
};

function isAllowed(issue: RuntimeIssue): boolean {
  return runtimeAllowlist.some((allowance) => {
    if (allowance.kind !== issue.kind) return false;
    if (allowance.status !== undefined && allowance.status !== issue.status) {
      return false;
    }
    if (allowance.url && !allowance.url.test(issue.url ?? "")) return false;
    if (allowance.message && !allowance.message.test(issue.message)) return false;
    return true;
  });
}

function redactRuntimeUrl(value?: string): string | undefined {
  if (!value) return value;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}${url.search ? "?[redacted]" : ""}`;
  } catch {
    return "[unparseable URL redacted]";
  }
}

function redactRuntimeMessage(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[JWT redacted]")
    .replace(
      /([?&](?:access_token|refresh_token|token|code)=)[^&\s]+/gi,
      "$1[redacted]",
    );
}

export const test = base.extend<QualityFixtures>({
  runtimeQualityGate: [
    async ({ page }, use, testInfo) => {
      const observer = observeRuntimeQuality(page);

      await use();

      if (testInfo.status !== "skipped") {
        observer.expectClean();
      }
    },
    { auto: true },
  ],
});

export { expect } from "playwright/test";

export function observeRuntimeQuality(page: Page): {
  expectClean: () => void;
} {
  const issues: RuntimeIssue[] = [];
  const record = (issue: RuntimeIssue) => {
    if (!isAllowed(issue)) {
      issues.push({
        ...issue,
        message: redactRuntimeMessage(issue.message),
        url: redactRuntimeUrl(issue.url),
      });
    }
  };

  page.on("console", (message) => {
    if (message.type() === "error") {
      record({
        kind: "console",
        message: message.text(),
        url: message.location().url,
      });
    }
  });
  page.on("pageerror", (error) => {
    record({ kind: "pageerror", message: error.message });
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "Falha de rede sem detalhe";
    // Route changes intentionally abort stale TanStack/Supabase reads through
    // AbortController. Chromium reports those client-side cancellations as
    // ERR_ABORTED; they are not transport failures and have no HTTP response.
    if (/\bERR_ABORTED\b/i.test(failure)) return;
    record({
      kind: "requestfailed",
      message: failure,
      url: request.url(),
    });
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      record({
        kind: "response",
        message: `${response.status()} ${response.statusText()}`,
        status: response.status(),
        url: response.url(),
      });
    }
  });

  return {
    expectClean: () => {
      expect(
        issues,
        `Erros de runtime não permitidos:\n${issues
          .map(
            (issue) =>
              `- ${issue.kind}: ${issue.status ?? ""} ${issue.url ?? ""} ${issue.message}`,
          )
          .join("\n")}`,
      ).toEqual([]);
    },
  };
}

export async function expectBaselineAccessibility(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("lang", /^pt(?:-BR)?$/i);
  await expect(page.locator("main:visible")).toHaveCount(1);
  await expect(page.locator("h1:visible")).toHaveCount(1);

  const audit = await page.evaluate(() => {
    const isVisible = (element: Element) => {
      const htmlElement = element as HTMLElement;
      const style = window.getComputedStyle(htmlElement);
      const rect = htmlElement.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const labelledByText = (element: Element) =>
      (element.getAttribute("aria-labelledby") ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
        .join(" ")
        .trim();
    const accessibleName = (element: Element) => {
      const explicit = element.getAttribute("aria-label")?.trim();
      if (explicit) return explicit;
      const labelledBy = labelledByText(element);
      if (labelledBy) return labelledBy;
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      ) {
        const labels = Array.from(element.labels ?? [])
          .map((label) => label.textContent?.trim() ?? "")
          .join(" ")
          .trim();
        if (labels) return labels;
      }
      if (element instanceof HTMLImageElement) return element.alt.trim();
      return (
        element.textContent?.trim() ||
        element.getAttribute("title")?.trim() ||
        ""
      );
    };

    const ids = Array.from(document.querySelectorAll<HTMLElement>("[id]"))
      .map((element) => element.id)
      .filter(Boolean);
    const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    const unnamedControls = Array.from(
      document.querySelectorAll(
        'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="checkbox"], [role="switch"], [role="combobox"], [role="textbox"], [role="link"]',
      ),
    )
      .filter(isVisible)
      .filter((element) => !accessibleName(element))
      .map((element) => element.outerHTML.slice(0, 180));
    const imagesWithoutAlt = Array.from(document.querySelectorAll("img"))
      .filter(isVisible)
      .filter((image) => !image.hasAttribute("alt"))
      .map((image) => image.outerHTML.slice(0, 180));
    const editableFontSizes = Array.from(
      document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        'input:not([type]), input[type="text"], input[type="email"], input[type="password"], input[type="search"], input[type="tel"], input[type="url"], input[type="number"], input[type="date"], input[type="datetime-local"], input[type="month"], input[type="time"], input[type="week"], textarea, select',
      ),
    )
      .filter(isVisible)
      .map((element) => ({
        element: element.outerHTML.slice(0, 140),
        fontSize: Number.parseFloat(window.getComputedStyle(element).fontSize),
      }))
      .filter(({ fontSize }) => fontSize < 16);
    const undersizedTouchTargets = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button, a[href], input[type="checkbox"], input[type="radio"], [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"]',
      ),
    )
      .filter(isVisible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          element: element.outerHTML.slice(0, 180),
          width: Math.round(rect.width * 100) / 100,
          height: Math.round(rect.height * 100) / 100,
        };
      })
      // Browsers can report a CSS 44px utility as 43.98–43.99 after device
      // pixel rounding. The half-pixel tolerance still rejects every 43px target.
      .filter(({ width, height }) => width < 43.5 || height < 43.5);

    return {
      duplicates,
      unnamedControls,
      imagesWithoutAlt,
      editableFontSizes,
      undersizedTouchTargets,
      horizontalOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  expect(audit.duplicates, "IDs duplicados").toEqual([]);
  expect(audit.unnamedControls, "Controles sem nome acessível").toEqual([]);
  expect(audit.imagesWithoutAlt, "Imagens sem atributo alt").toEqual([]);
  expect(
    audit.editableFontSizes,
    "Campos editáveis abaixo de 16px causam zoom automático no iOS",
  ).toEqual([]);
  expect(
    audit.undersizedTouchTargets,
    "Controles interativos precisam preservar alvos de toque de pelo menos 44×44px",
  ).toEqual([]);
  expect(audit.horizontalOverflow, "Overflow horizontal da viewport").toBeLessThanOrEqual(1);

  const hasAxe = await page.evaluate(
    () => "axe" in (window as typeof window & { axe?: unknown }),
  );
  if (!hasAxe) await page.addScriptTag({ content: axe.source });

  const axeViolations = await page.evaluate(async () => {
    type AxeBrowserApi = {
      run: (
        context: Document,
        options: {
          runOnly: { type: "tag"; values: string[] };
        },
      ) => Promise<{
        violations: Array<{
          id: string;
          impact: string | null;
          help: string;
          nodes: Array<{ target: string[]; failureSummary?: string }>;
        }>;
      }>;
    };
    const browserWindow = window as typeof window & { axe: AxeBrowserApi };
    const results = await browserWindow.axe.run(document, {
      runOnly: {
        type: "tag",
        values: [
          "wcag2a",
          "wcag2aa",
          "wcag21a",
          "wcag21aa",
          "wcag22a",
          "wcag22aa",
        ],
      },
    });
    return results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        failureSummary: node.failureSummary,
      })),
    }));
  });

  expect(axeViolations, "Violações WCAG A/AA encontradas pelo axe-core").toEqual(
    [],
  );
}
