import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Mail } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/base/buttons/button";
import { SocialButton } from "@/components/base/buttons/social-button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
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

type AuthScreen = "sign_in" | "sign_up" | "forgot" | "check_email";
type EmailForm = { email: string };
type SignInForm = EmailForm & { password: string };
type SignUpForm = SignInForm & {
  confirmPassword: string;
  adult: boolean;
  terms: boolean;
};
type ResetPasswordForm = { password: string; confirmPassword: string };

type AuthFlowProps = {
  /** Starts the post-auth acknowledgement once Supabase has accepted a login. */
  onSignedIn?: () => void;
};

function AccessBrandMark() {
  return (
    <img
      className="access-title-brand"
      src={`${import.meta.env.BASE_URL}brand/orha-mark-transparent.png`}
      width="697"
      height="177"
      alt="ORHA"
      draggable={false}
    />
  );
}

function AuthFrame({
  children,
  onBack,
}: {
  children: React.ReactNode;
  onBack?: () => void;
}) {
  const shellRef = useRef<HTMLElement>(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    shellRef.current
      ?.querySelector<HTMLElement>("h1")
      ?.focus({ preventScroll: true });
  }, []);

  return (
    <main className="access-screen">
      <motion.section
        ref={shellRef}
        className={`access-shell auth-flow ${onBack ? "has-back" : ""}`}
        initial={
          shouldReduceMotion ? false : { opacity: 0, x: 14, scale: 0.985 }
        }
        animate={{ opacity: 1, x: 0, scale: 1 }}
        transition={{
          duration: shouldReduceMotion ? 0 : 0.33,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        {onBack ? (
          <button
            type="button"
            className="access-back"
            onClick={onBack}
            aria-label="Voltar"
          >
            <ArrowLeft size={19} />
          </button>
        ) : null}
        {children}
      </motion.section>
    </main>
  );
}

export function AuthFlow({ onSignedIn }: AuthFlowProps) {
  const [screen, setScreen] = useState<AuthScreen>("sign_in");
  const [pendingEmail, setPendingEmail] = useState("");

  if (screen === "sign_in") {
    return (
      <SignInScreen
        key="sign-in"
        onForgot={() => setScreen("forgot")}
        onCreateAccount={() => setScreen("sign_up")}
        onSignedIn={onSignedIn}
      />
    );
  }

  if (screen === "sign_up") {
    return (
      <SignUpScreen
        key="sign-up"
        onBack={() => setScreen("sign_in")}
        onVerification={(email) => {
          setPendingEmail(email);
          setScreen("check_email");
        }}
      />
    );
  }

  if (screen === "forgot") {
    return (
      <ForgotPasswordScreen
        key="forgot"
        onBack={() => setScreen("sign_in")}
        onSent={(email) => {
          setPendingEmail(email);
          setScreen("check_email");
        }}
      />
    );
  }

  return (
    <CheckEmailScreen
      key="check-email"
      email={pendingEmail}
      onBack={() => setScreen("sign_in")}
    />
  );
}

function SignInScreen({
  onForgot,
  onCreateAccount,
  onSignedIn,
}: {
  onForgot: () => void;
  onCreateAccount: () => void;
  onSignedIn?: () => void;
}) {
  const form = useForm<SignInForm>({
    defaultValues: { email: "", password: "" },
  });
  const [error, setError] = useState<string | null>(null);
  const [googleNotice, setGoogleNotice] = useState(false);

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const result = await signInWithEmail(
        values.email.trim(),
        values.password,
      );
      if (result.error) throw result.error;
      onSignedIn?.();
    } catch (submitError) {
      setError(getAuthErrorMessage(submitError));
    }
  });

  return (
    <AuthFrame>
      <div className="access-intro">
        <h1 id="access-title" tabIndex={-1}>
          <span>Você chegou à</span>
          <AccessBrandMark />
        </h1>
      </div>
      <form className="access-form" onSubmit={submit} noValidate>
        <ControlledInput
          control={form.control}
          name="email"
          label="E-mail"
          placeholder="voce@email.com"
          autoComplete="email"
          variant="access"
          rules={{
            required: "Informe seu e-mail.",
            pattern: {
              value: /^\S+@\S+\.\S+$/,
              message: "Informe um e-mail válido.",
            },
          }}
        />
        <ControlledInput
          control={form.control}
          name="password"
          label="Senha"
          placeholder="Sua senha"
          type="password"
          autoComplete="current-password"
          variant="access"
          rules={{ required: "Informe sua senha." }}
        />
        <button type="button" className="access-text-action" onClick={onForgot}>
          Esqueci minha senha
        </button>
        <AuthError message={error} />
        <Button
          type="submit"
          className="access-primary-button"
          size="xl"
          isLoading={form.formState.isSubmitting}
        >
          Entrar
        </Button>
        <div className="access-divider" aria-hidden="true">
          <span />
          ou continue com
          <span />
        </div>
        <SocialButton
          social="google"
          theme="brand"
          className="access-google-button"
          onClick={() => setGoogleNotice(true)}
        >
          Continuar com Google
        </SocialButton>
        {googleNotice ? (
          <p className="access-notice" role="status">
            A autenticação com Google será ativada em breve.
          </p>
        ) : null}
      </form>
      <p className="access-switch-page">
        Ainda não faz parte?
        <button type="button" onClick={onCreateAccount}>
          Criar conta
        </button>
      </p>
    </AuthFrame>
  );
}

function SignUpScreen({
  onBack,
  onVerification,
}: {
  onBack: () => void;
  onVerification: (email: string) => void;
}) {
  const form = useForm<SignUpForm>({
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      adult: false,
      terms: false,
    },
  });
  const [error, setError] = useState<string | null>(null);

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    if (values.password !== values.confirmPassword) {
      setError("As senhas não são iguais.");
      form.setFocus("confirmPassword");
      return;
    }
    if (!values.adult) {
      setError("Você precisa confirmar que possui 18 anos ou mais.");
      document.querySelector<HTMLInputElement>('input[name="adult"]')?.focus();
      return;
    }
    if (!values.terms) {
      setError("Aceite os Termos e a Política de Privacidade para continuar.");
      document.querySelector<HTMLInputElement>('input[name="terms"]')?.focus();
      return;
    }

    try {
      const result = await signUpWithEmail({
        email: values.email.trim(),
        password: values.password,
      });
      if (result.error) throw result.error;
      if (!result.data.session) onVerification(values.email.trim());
    } catch (submitError) {
      setError(getAuthErrorMessage(submitError));
    }
  });

  return (
    <AuthFrame onBack={onBack}>
      <div className="access-secondary-intro">
        <p>SEU COMEÇO</p>
        <h1 tabIndex={-1}>Criar uma conta</h1>
        <span>Primeiro, proteja seu acesso. Seu perfil vem logo depois.</span>
      </div>
      <form className="access-form" onSubmit={submit} noValidate>
        <ControlledInput
          control={form.control}
          name="email"
          label="E-mail"
          placeholder="voce@email.com"
          autoComplete="email"
          variant="access"
          rules={{
            required: "Informe seu e-mail.",
            pattern: {
              value: /^\S+@\S+\.\S+$/,
              message: "Informe um e-mail válido.",
            },
          }}
        />
        <ControlledInput
          control={form.control}
          name="password"
          label="Senha"
          placeholder="Crie uma senha segura"
          type="password"
          autoComplete="new-password"
          variant="access"
          rules={{
            required: "Crie uma senha.",
            minLength: { value: 8, message: "Use pelo menos 8 caracteres." },
          }}
        />
        <ControlledInput
          control={form.control}
          name="confirmPassword"
          label="Confirmar senha"
          placeholder="Repita sua senha"
          type="password"
          autoComplete="new-password"
          variant="access"
          rules={{ required: "Confirme sua senha." }}
        />
        <Controller
          control={form.control}
          name="adult"
          render={({ field }) => (
            <Checkbox
              ref={field.ref}
              name={field.name}
              isSelected={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              size="md"
              className="auth-check min-h-11 [&_p]:!text-[11px] [&_p]:!font-normal [&_p]:!leading-[1.42]"
              label="Confirmo que tenho 18 anos ou mais."
            />
          )}
        />
        <Controller
          control={form.control}
          name="terms"
          render={({ field }) => (
            <Checkbox
              ref={field.ref}
              name={field.name}
              isSelected={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              size="md"
              className="auth-check min-h-11 [&_p]:!text-[11px] [&_p]:!font-normal [&_p]:!leading-[1.42]"
              label="Li e aceito os Termos de Uso e a Política de Privacidade."
            />
          )}
        />
        <AuthError message={error} />
        <Button
          type="submit"
          className="access-primary-button"
          size="xl"
          isLoading={form.formState.isSubmitting}
        >
          Criar conta
        </Button>
      </form>
    </AuthFrame>
  );
}

function ForgotPasswordScreen({
  onBack,
  onSent,
}: {
  onBack: () => void;
  onSent: (email: string) => void;
}) {
  const form = useForm<EmailForm>({ defaultValues: { email: "" } });
  const [error, setError] = useState<string | null>(null);
  const submit = form.handleSubmit(async ({ email }) => {
    setError(null);
    try {
      await sendPasswordRecovery(email.trim());
      onSent(email.trim());
    } catch (submitError) {
      setError(getAuthErrorMessage(submitError));
    }
  });

  return (
    <AuthFrame onBack={onBack}>
      <div className="access-secondary-intro">
        <p>RECUPERAR ACESSO</p>
        <h1 tabIndex={-1}>Esqueceu sua senha?</h1>
        <span>Enviaremos um link seguro para você criar uma nova.</span>
      </div>
      <form className="access-form" onSubmit={submit} noValidate>
        <ControlledInput
          control={form.control}
          name="email"
          label="E-mail da conta"
          placeholder="voce@email.com"
          autoComplete="email"
          variant="access"
          rules={{
            required: "Informe seu e-mail.",
            pattern: {
              value: /^\S+@\S+\.\S+$/,
              message: "Informe um e-mail válido.",
            },
          }}
        />
        <AuthError message={error} />
        <Button
          type="submit"
          className="access-primary-button"
          size="xl"
          isLoading={form.formState.isSubmitting}
        >
          Enviar link
        </Button>
      </form>
    </AuthFrame>
  );
}

function CheckEmailScreen({
  email,
  onBack,
}: {
  email: string;
  onBack: () => void;
}) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setError(null);
    try {
      const result = await resendSignUpConfirmation(email);
      if (result.error) throw result.error;
      setSent(true);
    } catch (resendError) {
      setError(getAuthErrorMessage(resendError));
    }
  }

  return (
    <AuthFrame onBack={onBack}>
      <div className="access-confirmation">
        <span className="confirmation-icon">
          <Mail size={27} />
        </span>
        <p>CONFIRA SUA CAIXA DE ENTRADA</p>
        <h1 tabIndex={-1}>Enviamos um e-mail</h1>
        <span>
          Use o link enviado para <strong>{email}</strong>. Você voltará direto
          para concluir seu perfil.
        </span>
        {sent ? (
          <div className="auth-success">
            <CheckCircle2 size={17} /> E-mail enviado novamente.
          </div>
        ) : null}
        <AuthError message={error} />
        <Button
          className="access-google-button"
          color="secondary"
          size="xl"
          onPress={() => void resend()}
        >
          Reenviar e-mail
        </Button>
        <button type="button" className="access-return-button" onClick={onBack}>
          Voltar para entrar
        </button>
      </div>
    </AuthFrame>
  );
}

export function ResetPasswordScreen() {
  const { finishPasswordRecovery } = useAuth();
  const form = useForm<ResetPasswordForm>({
    defaultValues: { password: "", confirmPassword: "" },
  });
  const [error, setError] = useState<string | null>(null);

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    if (values.password !== values.confirmPassword) {
      setError("As senhas não são iguais.");
      form.setFocus("confirmPassword");
      return;
    }
    try {
      await updatePassword(values.password);
      finishPasswordRecovery();
    } catch (submitError) {
      setError(getAuthErrorMessage(submitError));
    }
  });

  return (
    <AuthFrame>
      <div className="access-secondary-intro">
        <p>NOVO ACESSO</p>
        <h1 tabIndex={-1}>Crie uma nova senha</h1>
        <span>
          Use pelo menos 8 caracteres e não reutilize uma senha antiga.
        </span>
      </div>
      <form className="access-form" onSubmit={submit} noValidate>
        <ControlledInput
          control={form.control}
          name="password"
          label="Nova senha"
          placeholder="Crie uma senha segura"
          type="password"
          autoComplete="new-password"
          variant="access"
          rules={{
            required: "Informe uma senha.",
            minLength: { value: 8, message: "Use pelo menos 8 caracteres." },
          }}
        />
        <ControlledInput
          control={form.control}
          name="confirmPassword"
          label="Confirmar nova senha"
          placeholder="Repita sua senha"
          type="password"
          autoComplete="new-password"
          variant="access"
          rules={{ required: "Confirme sua senha." }}
        />
        <AuthError message={error} />
        <Button
          type="submit"
          className="access-primary-button"
          size="xl"
          isLoading={form.formState.isSubmitting}
        >
          Atualizar senha
        </Button>
      </form>
    </AuthFrame>
  );
}
