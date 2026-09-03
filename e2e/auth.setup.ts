import { mkdir } from "node:fs/promises";
import { test as setup } from "playwright/test";
import { signInThroughPublicUi } from "./support/auth-ui";
import {
  AUTH_STATE_DIRECTORY,
  authStatePath,
  requireNamedCredentials,
  openApp,
  type TestPrincipal,
} from "./support/environment";

const principals: readonly TestPrincipal[] = ["user-a", "user-b", "admin"];

setup.describe("sessões reais nomeadas", () => {
  setup.describe.configure({ mode: "serial" });

  for (const principal of principals) {
    setup(`autenticar ${principal}`, async ({ page }) => {
      setup.setTimeout(90_000);
      await mkdir(AUTH_STATE_DIRECTORY, { recursive: true });
      const credentials = requireNamedCredentials(principal);
      const rotatedPassword = process.env.ORHA_E2E_USER_A_ROTATED_PASSWORD?.trim();

      await openApp(page);
      await signInThroughPublicUi(
        page,
        credentials,
        principal === "user-a" && rotatedPassword
          ? [rotatedPassword]
          : [],
      );
      await page.context().storageState({ path: authStatePath(principal) });
    });
  }
});
