import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const templateDirectory = path.resolve("supabase/templates");

function template(name: string): string {
  return readFileSync(path.join(templateDirectory, name), "utf8");
}

describe("Supabase Auth email templates", () => {
  it.each(["confirmation.html", "recovery.html"])(
    "%s keeps the server-generated one-time action URL",
    (name) => {
      const source = template(name);
      expect(source).toContain("{{ .ConfirmationURL }}");
      expect(source).toContain('lang="pt-BR"');
      expect(source).not.toMatch(/<script|<form|https?:\/\//i);
    },
  );

  it("enables an honest password-change security notification", () => {
    const source = template("password_changed_notification.html");
    expect(source).toContain("Sua senha foi alterada");
    expect(source).toMatch(/solicite imediatamente uma redefinição de\s+senha/);
    expect(source).not.toMatch(/<script|<form|https?:\/\//i);
  });

  it("binds every shipped template from the versioned Auth configuration", () => {
    const config = readFileSync(path.resolve("supabase/config.toml"), "utf8");
    expect(config).toContain("[auth.email.template.confirmation]");
    expect(config).toContain(
      'content_path = "./supabase/templates/confirmation.html"',
    );
    expect(config).toContain("[auth.email.template.recovery]");
    expect(config).toContain(
      'content_path = "./supabase/templates/recovery.html"',
    );
    expect(config).toContain("[auth.email.notification.password_changed]");
    expect(config).toMatch(
      /\[auth\.email\.notification\.password_changed\][\s\S]*?enabled = true/,
    );
  });
});
