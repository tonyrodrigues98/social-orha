export type MatrixPrincipal =
  | "user-a"
  | "user-b"
  | "admin"
  | "moderator"
  | "support";

export type MatrixRole = "user" | "admin" | "moderator" | "support";

export type MatrixPrincipalDefinition = {
  principal: MatrixPrincipal;
  role: MatrixRole;
  environmentStem: string;
  label: string;
};

export type EphemeralMatrixIdentity = MatrixPrincipalDefinition & {
  email: string;
  password: string;
  rotatedPassword?: string;
  username: string;
  fullName: string;
};

export const MATRIX_PRINCIPALS: readonly MatrixPrincipalDefinition[] = [
  {
    principal: "user-a",
    role: "user",
    environmentStem: "USER_A",
    label: "Usuário A",
  },
  {
    principal: "user-b",
    role: "user",
    environmentStem: "USER_B",
    label: "Usuário B",
  },
  {
    principal: "admin",
    role: "admin",
    environmentStem: "ADMIN",
    label: "Admin",
  },
  {
    principal: "moderator",
    role: "moderator",
    environmentStem: "MODERATOR",
    label: "Moderador",
  },
  {
    principal: "support",
    role: "support",
    environmentStem: "SUPPORT",
    label: "Suporte",
  },
] as const;

function normalizedRunToken(value: string): string {
  const token = value.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
  if (token.length < 8) {
    throw new Error("O identificador efêmero da matriz precisa ter ao menos 8 caracteres.");
  }
  return token;
}

export function createEphemeralMatrixIdentity(
  definition: MatrixPrincipalDefinition,
  runId: string,
): EphemeralMatrixIdentity {
  const token = normalizedRunToken(runId);
  const principalSlug = definition.principal.replace("-", "");
  const password = `Orha-${principalSlug}-${token}!9aA`;
  return {
    ...definition,
    email: `orha-e2e-${principalSlug}-${token}@example.invalid`,
    password,
    rotatedPassword:
      definition.principal === "user-a"
        ? `Orha-${principalSlug}-${token}-rotated!8bB`
        : undefined,
    username: `e2e_${principalSlug}_${token}`,
    fullName: `ORHA E2E ${definition.label} ${token}`,
  };
}

export function matrixEnvironment(
  identities: readonly EphemeralMatrixIdentity[],
): NodeJS.ProcessEnv {
  if (identities.length !== MATRIX_PRINCIPALS.length) {
    throw new Error("A matriz efêmera exige exatamente cinco identidades distintas.");
  }
  const principals = new Set(identities.map((identity) => identity.principal));
  if (principals.size !== MATRIX_PRINCIPALS.length) {
    throw new Error("A matriz efêmera contém uma identidade duplicada.");
  }

  const environment: NodeJS.ProcessEnv = {};
  for (const identity of identities) {
    environment[`ORHA_E2E_${identity.environmentStem}_EMAIL`] = identity.email;
    environment[`ORHA_E2E_${identity.environmentStem}_PASSWORD`] = identity.password;
    environment[`ORHA_E2E_${identity.environmentStem}_PROFILE_TEXT`] = identity.fullName;
    if (identity.rotatedPassword) {
      environment.ORHA_E2E_USER_A_ROTATED_PASSWORD = identity.rotatedPassword;
    }
  }
  return environment;
}
