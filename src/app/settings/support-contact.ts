export function normalizeSupportEmail(value: string | null | undefined): string | null {
  const candidate = value?.trim() ?? "";
  if (!candidate || candidate.length > 254 || /[\r\n\0]/.test(candidate)) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
}

export function buildSupportMailto(value: string | null | undefined): string | null {
  const email = normalizeSupportEmail(value);
  if (!email) return null;
  const query = new URLSearchParams({
    subject: "Ajuda com a ORHA",
    body: "Olá, equipe ORHA,\n\nPreciso de ajuda com:\n\nE-mail da conta (opcional):\n",
  });
  return `mailto:${email}?${query.toString()}`;
}
