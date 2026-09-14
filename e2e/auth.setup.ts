import { mkdir } from "node:fs/promises";
import { test as setup } from "playwright/test";
import { signInThroughPublicUi } from "./support/auth-ui";
import {
  AUTH_STATE_DIRECTORY,
  authStatePath,
  requireNamedCredentials,
  openApp,
  readSupabaseSessionSubject,
  type TestPrincipal,
} from "./support/environment";
import {
  assertE2EPrincipalProvisioning,
  createE2EAdminClient,
} from "./support/supabase-admin";

const principals: readonly TestPrincipal[] = ["user-a", "user-b", "admin", "moderator", "support"];
const observedSubjects = new Map<string, TestPrincipal>();

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

      const state = await page.context().storageState();
      const subject = readSupabaseSessionSubject(state);
      if (!subject) {
        throw new Error(`A sessão E2E ${principal} não contém um subject Supabase válido.`);
      }
      const existingPrincipal = observedSubjects.get(subject);
      if (existingPrincipal) {
        throw new Error(
          `As sessões E2E ${existingPrincipal} e ${principal} apontam para a mesma conta.`,
        );
      }

      await assertE2EPrincipalProvisioning(
        createE2EAdminClient(),
        principal,
        subject,
      );
      observedSubjects.set(subject, principal);
      await page.context().storageState({ path: authStatePath(principal) });
    });
  }
});
