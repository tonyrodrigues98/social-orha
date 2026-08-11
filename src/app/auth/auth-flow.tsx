import { useState } from "react";
import { ArrowLeft, CheckCircle2, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/base/buttons/button";
import { BrandMark } from "@/app/components/brand-mark";
import {
  resendSignUpConfirmation,
  sendPasswordRecovery,
  signInWithEmail,
  signUpWithEmail,
  updatePassword,
} from "@/infrastructure/supabase/email-auth";
import { getAuthErrorMessage } from "@/infrastructure/supabase/auth-errors";
import { AuthError, ControlledInput } from "./auth-fields";
import { useAuth } from "./auth-context";

type AuthScreen = "welcome" | "sign_in" | "sign_up" | "forgot" | "check_email";
type EmailForm = { email: string };
type SignInForm = EmailForm & { password: string };
type SignUpForm = SignInForm & { confirmPassword: string; adult: boolean; terms: boolean };
type ResetPasswordForm = { password: string; confirmPassword: string };

function AuthFrame({
  children,
  onBack,
}: {
  children: React.ReactNode;
  onBack?: () => void;
}) {
  return (
    <div className="auth-screen">
      <header className="auth-topbar">
        {onBack ? (
          <button type="button" className="auth-back" onClick={onBack} aria-label="Voltar">
            <ArrowLeft size={21} />
          </button>
        ) : <span />}
        <BrandMark className="auth-brand" />
        <span />
      </header>
      <motion.main
        className="auth-content"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
      >
        {children}
      </motion.main>
    </div>
  );
}

export function AuthFlow() {
  const [screen, setScreen] = useState<AuthScreen>("welcome");
  const [pendingEmail, setPendingEmail] = useState("");

  if (screen === "welcome") {
    return (
      <AuthFrame>
        <div className="auth-welcome-art" aria-hidden>
          <span className="auth-orbit one" />
          <span className="auth-orbit two" />
          <div className="auth-welcome-mark"><ShieldCheck size={32} /></div>
        </div>
        <div className="auth-heading welcome">
          <span className="auth-eyebrow">BEM-VINDO À ORHA</span>
          <h1>Um lugar para<br />pertencer de verdade.</h1>
          <p>Conheça pessoas, participe de comunidades e mostre quem você é.</p>
        </div>
        <div className="auth-actions">
          <Button className="auth-primary-button" size="xl" onPress={() => setScreen("sign_up")}>Criar minha conta</Button>
          <Button className="auth-secondary-button" color="secondary" size="xl" onPress={() => setScreen("sign_in")}>Já tenho uma conta</Button>
        </div>
        <p className="auth-legal-copy">Exclusivo para maiores de 18 anos.</p>
      </AuthFrame>
    );
  }

  if (screen === "sign_in") {
    return <SignInScreen onBack={() => setScreen("welcome")} onForgot={() => setScreen("forgot")} />;
  }

  if (screen === "sign_up") {
    return (
      <SignUpScreen
        onBack={() => setScreen("welcome")}
        onVerification={(email) => { setPendingEmail(email); setScreen("check_email"); }}
      />
    );
  }

  if (screen === "forgot") {
    return (
      <ForgotPasswordScreen
        onBack={() => setScreen("sign_in")}
        onSent={(email) => { setPendingEmail(email); setScreen("check_email"); }}
      />
    );
  }

  return <CheckEmailScreen email={pendingEmail} onBack={() => setScreen("sign_in")} />;
}

function SignInScreen({ onBack, onForgot }: { onBack: () => void; onForgot: () => void }) {
  const form = useForm<SignInForm>({ defaultValues: { email: "", password: "" } });
  const [error, setError] = useState<string | null>(null);

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const result = await signInWithEmail(values.email.trim(), values.password);
      if (result.error) throw result.error;
    } catch (submitError) {
      setError(getAuthErrorMessage(submitError));
    }
  });

  return (
    <AuthFrame onBack={onBack}>
      <div className="auth-heading"><span className="auth-eyebrow">QUE BOM TER VOCÊ AQUI</span><h1>Entrar na ORHA</h1><p>Continue de onde parou.</p></div>
      <form className="auth-form" onSubmit={submit} noValidate>
        <ControlledInput control={form.control} name="email" label="E-mail" placeholder="voce@exemplo.com" icon={Mail} autoComplete="email" rules={{ required: "Informe seu e-mail.", pattern: { value: /^\S+@\S+\.\S+$/, message: "Informe um e-mail válido." } }} />
        <ControlledInput control={form.control} name="password" label="Senha" placeholder="Sua senha" type="password" icon={LockKeyhole} autoComplete="current-password" rules={{ required: "Informe sua senha." }} />
        <button type="button" className="auth-text-action align-right" onClick={onForgot}>Esqueci minha senha</button>
        <AuthError message={error} />
        <Button type="submit" className="auth-primary-button" size="xl" isLoading={form.formState.isSubmitting}>Entrar</Button>
      </form>
    </AuthFrame>
  );
}

function SignUpScreen({ onBack, onVerification }: { onBack: () => void; onVerification: (email: string) => void }) {
  const form = useForm<SignUpForm>({ defaultValues: { email: "", password: "", confirmPassword: "", adult: false, terms: false } });
  const [error, setError] = useState<string | null>(null);

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    if (values.password !== values.confirmPassword) { setError("As senhas não são iguais."); return; }
    if (!values.adult) { setError("Você precisa confirmar que possui 18 anos ou mais."); return; }
    if (!values.terms) { setError("Aceite os Termos e a Política de Privacidade para continuar."); return; }

    try {
      const result = await signUpWithEmail({ email: values.email.trim(), password: values.password });
      if (result.error) throw result.error;
      if (!result.data.session) onVerification(values.email.trim());
    } catch (submitError) {
      setError(getAuthErrorMessage(submitError));
    }
  });

  return (
    <AuthFrame onBack={onBack}>
      <div className="auth-heading"><span className="auth-eyebrow">SEU COMEÇO</span><h1>Criar uma conta</h1><p>Primeiro, proteja seu acesso. Seu perfil vem logo depois.</p></div>
      <form className="auth-form" onSubmit={submit} noValidate>
        <ControlledInput control={form.control} name="email" label="E-mail" placeholder="voce@exemplo.com" icon={Mail} autoComplete="email" rules={{ required: "Informe seu e-mail.", pattern: { value: /^\S+@\S+\.\S+$/, message: "Informe um e-mail válido." } }} />
        <ControlledInput control={form.control} name="password" label="Senha" placeholder="Mínimo de 8 caracteres" type="password" icon={LockKeyhole} autoComplete="new-password" rules={{ required: "Crie uma senha.", minLength: { value: 8, message: "Use pelo menos 8 caracteres." } }} />
        <ControlledInput control={form.control} name="confirmPassword" label="Confirmar senha" placeholder="Repita sua senha" type="password" icon={LockKeyhole} autoComplete="new-password" rules={{ required: "Confirme sua senha." }} />
        <label className="auth-check"><input type="checkbox" {...form.register("adult")} /><span>Confirmo que tenho 18 anos ou mais.</span></label>
        <label className="auth-check"><input type="checkbox" {...form.register("terms")} /><span>Li e aceito os Termos de Uso e a Política de Privacidade.</span></label>
        <AuthError message={error} />
        <Button type="submit" className="auth-primary-button" size="xl" isLoading={form.formState.isSubmitting}>Criar conta</Button>
      </form>
    </AuthFrame>
  );
}

function ForgotPasswordScreen({ onBack, onSent }: { onBack: () => void; onSent: (email: string) => void }) {
  const form = useForm<EmailForm>({ defaultValues: { email: "" } });
  const [error, setError] = useState<string | null>(null);
  const submit = form.handleSubmit(async ({ email }) => {
    setError(null);
    try { await sendPasswordRecovery(email.trim()); onSent(email.trim()); }
    catch (submitError) { setError(getAuthErrorMessage(submitError)); }
  });

  return (
    <AuthFrame onBack={onBack}>
      <div className="auth-icon-heading"><span><LockKeyhole size={24} /></span></div>
      <div className="auth-heading"><span className="auth-eyebrow">RECUPERAR ACESSO</span><h1>Esqueceu sua senha?</h1><p>Enviaremos um link seguro para você criar uma nova.</p></div>
      <form className="auth-form" onSubmit={submit} noValidate>
        <ControlledInput control={form.control} name="email" label="E-mail da conta" placeholder="voce@exemplo.com" icon={Mail} autoComplete="email" rules={{ required: "Informe seu e-mail.", pattern: { value: /^\S+@\S+\.\S+$/, message: "Informe um e-mail válido." } }} />
        <AuthError message={error} />
        <Button type="submit" className="auth-primary-button" size="xl" isLoading={form.formState.isSubmitting}>Enviar link</Button>
      </form>
    </AuthFrame>
  );
}

function CheckEmailScreen({ email, onBack }: { email: string; onBack: () => void }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setError(null);
    try {
      const result = await resendSignUpConfirmation(email);
      if (result.error) throw result.error;
      setSent(true);
    } catch (resendError) { setError(getAuthErrorMessage(resendError)); }
  }

  return (
    <AuthFrame onBack={onBack}>
      <div className="auth-confirmation">
        <span className="confirmation-icon"><Mail size={28} /></span>
        <span className="auth-eyebrow">CONFIRA SUA CAIXA DE ENTRADA</span>
        <h1>Enviamos um e-mail</h1>
        <p>Use o link enviado para <strong>{email}</strong>. Você voltará direto para concluir seu perfil.</p>
        {sent ? <div className="auth-success"><CheckCircle2 size={17} /> E-mail enviado novamente.</div> : null}
        <AuthError message={error} />
        <Button className="auth-secondary-button" color="secondary" size="xl" onPress={resend}>Reenviar e-mail</Button>
        <button type="button" className="auth-text-action" onClick={onBack}>Voltar para entrar</button>
      </div>
    </AuthFrame>
  );
}

export function ResetPasswordScreen() {
  const { finishPasswordRecovery } = useAuth();
  const form = useForm<ResetPasswordForm>({ defaultValues: { password: "", confirmPassword: "" } });
  const [error, setError] = useState<string | null>(null);

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    if (values.password !== values.confirmPassword) { setError("As senhas não são iguais."); return; }
    try { await updatePassword(values.password); finishPasswordRecovery(); }
    catch (submitError) { setError(getAuthErrorMessage(submitError)); }
  });

  return (
    <AuthFrame>
      <div className="auth-heading"><span className="auth-eyebrow">NOVO ACESSO</span><h1>Crie uma nova senha</h1><p>Use pelo menos 8 caracteres e não reutilize uma senha antiga.</p></div>
      <form className="auth-form" onSubmit={submit} noValidate>
        <ControlledInput control={form.control} name="password" label="Nova senha" placeholder="Mínimo de 8 caracteres" type="password" icon={LockKeyhole} autoComplete="new-password" rules={{ required: "Crie uma senha.", minLength: { value: 8, message: "Use pelo menos 8 caracteres." } }} />
        <ControlledInput control={form.control} name="confirmPassword" label="Confirmar nova senha" placeholder="Repita sua senha" type="password" icon={LockKeyhole} autoComplete="new-password" rules={{ required: "Confirme sua senha." }} />
        <AuthError message={error} />
        <Button type="submit" className="auth-primary-button" size="xl" isLoading={form.formState.isSubmitting}>Atualizar senha</Button>
      </form>
    </AuthFrame>
  );
}
