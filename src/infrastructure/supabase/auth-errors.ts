const authMessages: Record<string, string> = {
  "Invalid login credentials": "E-mail ou senha incorretos.",
  "Email not confirmed": "Confirme seu e-mail antes de entrar.",
  "User already registered": "Este e-mail já possui uma conta.",
  "Password should be at least 6 characters": "A senha precisa ter pelo menos 8 caracteres.",
  "Signup requires a valid password": "Informe uma senha válida.",
  "Unable to validate email address: invalid format": "Informe um e-mail válido.",
  "Email rate limit exceeded": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  "For security purposes, you can only request this after": "Aguarde um pouco antes de solicitar outro e-mail.",
};

export function getAuthErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Não foi possível concluir. Tente novamente.";

  const direct = authMessages[error.message];
  if (direct) return direct;

  const partial = Object.entries(authMessages).find(([source]) =>
    error.message.includes(source),
  );

  return partial?.[1] ?? "Não foi possível concluir. Tente novamente.";
}
