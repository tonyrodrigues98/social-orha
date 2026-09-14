import type { Page, Response } from "playwright/test";

const supabaseRuntimePath = /^\/(?:auth|functions|rest|storage)\/v1\//;

function sanitizedFailure(response: Response): string | null {
  const url = new URL(response.url());
  if (response.status() < 400 || !supabaseRuntimePath.test(url.pathname)) return null;
  return `${response.request().method()} ${url.pathname} -> ${response.status()} ${response.statusText()}`;
}

export async function withSupabaseFailureDiagnostics<T>(
  page: Page,
  action: () => Promise<T>,
): Promise<T> {
  const failures: string[] = [];
  const onResponse = (response: Response) => {
    const failure = sanitizedFailure(response);
    if (failure) failures.push(failure);
  };
  page.on("response", onResponse);
  try {
    return await action();
  } catch (cause) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    const details = failures.length
      ? `\nFalhas Supabase observadas:\n${failures.map((failure) => `- ${failure}`).join("\n")}`
      : "\nNenhuma resposta HTTP >= 400 do Supabase foi observada durante a ação.";
    throw new Error(`${causeMessage}${details}`, { cause });
  } finally {
    page.off("response", onResponse);
  }
}
