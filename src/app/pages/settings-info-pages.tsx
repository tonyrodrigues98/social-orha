import type { ReactNode } from "react";
import {
  ChevronDown,
  ChevronLeft,
  CircleHelp,
  FileText,
  HeartHandshake,
  Headphones,
  LockKeyhole,
  Mail,
  MessageCircleWarning,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { Button } from "@/components/base/buttons/button";
import {
  SETTINGS_INFO_PATHS,
  type SettingsInfoNavigationProps,
  type SettingsInfoPageProps,
} from "../settings/settings-info-routes";
import { SettingsInfoLink } from "../settings/settings-info-link";
import { buildSupportMailto, normalizeSupportEmail } from "../settings/support-contact";
import { appLegalConfiguration } from "../settings/legal-configuration-runtime";
import {
  formatLegalEffectiveDate,
  type LegalPublicConfiguration,
} from "@/config/legal-public-configuration";

type InfoPageShellProps = SettingsInfoPageProps & {
  title: string;
  eyebrow: string;
  summary: string;
  icon: ReactNode;
  children: ReactNode;
};

function InfoPageShell({
  title,
  eyebrow,
  summary,
  icon,
  onBack,
  children,
}: InfoPageShellProps) {
  return (
    <div className="page min-h-dvh bg-gray-50 text-gray-950">
      <header className="sticky top-0 z-20 border-b border-gray-100 bg-white px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="flex min-h-11 items-center gap-2">
          <button
            type="button"
            aria-label="Voltar"
            onClick={onBack}
            className="grid size-11 shrink-0 place-items-center rounded-full outline-none active:bg-gray-100 focus-visible:ring-2 focus-visible:ring-violet-600"
          >
            <ChevronLeft aria-hidden size={22} />
          </button>
          <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight">{title}</h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-5 pb-[max(32px,env(safe-area-inset-bottom))]">
        <section className="rounded-3xl border border-violet-100 bg-white p-5 shadow-xs">
          <span className="grid size-12 place-items-center rounded-2xl bg-violet-50 text-violet-700">
            {icon}
          </span>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">{eyebrow}</p>
          <p className="mt-2 text-[15px] leading-6 text-gray-600">{summary}</p>
        </section>
        <div className="mt-4 space-y-4">{children}</div>
      </main>
    </div>
  );
}

function DocumentSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-5">
      <h2 className="text-base font-semibold text-gray-950">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-6 text-gray-600">{children}</div>
    </section>
  );
}

function UpdatedAt({ configuration }: { configuration: LegalPublicConfiguration }) {
  return (
    <p className="px-1 text-xs text-gray-500">
      Última atualização:{" "}
      <time dateTime={configuration.effectiveDate ?? "2026-08-16"}>
        {formatLegalEffectiveDate(configuration.effectiveDate)}
      </time>.
    </p>
  );
}

type LinkedInfoPageProps = SettingsInfoPageProps & SettingsInfoNavigationProps;
type LegalInfoPageProps = LinkedInfoPageProps & {
  legalConfiguration?: LegalPublicConfiguration;
};

export function TermsPage({
  onBack,
  onNavigate,
  legalConfiguration = appLegalConfiguration,
}: LegalInfoPageProps) {
  return (
    <InfoPageShell
      title="Termos de Uso"
      eyebrow="Acordo de convivência"
      summary="Estas regras explicam o uso responsável da ORHA, uma rede social 18+ baseada em amizades, comunidades e conversas reais."
      icon={<FileText aria-hidden size={23} />}
      onBack={onBack}
    >
      <UpdatedAt configuration={legalConfiguration} />
      <article className="space-y-4" aria-label="Termos de Uso da ORHA">
        <DocumentSection title="1. Quem pode usar">
          <p>A ORHA é destinada exclusivamente a pessoas com 18 anos ou mais.</p>
          <p>Você deve informar dados verdadeiros, proteger sua senha e não ceder a conta. Contas de menores, falsas ou usadas para contornar sanções podem ser restringidas.</p>
        </DocumentSection>

        <DocumentSection title="2. Relações dentro da ORHA">
          <p>A ORHA usa amizades, e não seguidores. Uma amizade só existe depois que a outra pessoa aceita a solicitação.</p>
          <p>Solicitações de conversa são independentes da amizade. Conversas privadas e grupos só podem ser acessados pelos participantes autorizados.</p>
        </DocumentSection>

        <DocumentSection title="3. Conteúdo e visibilidade">
          <p>Você continua responsável pelo conteúdo que publica, envia ou mantém no perfil. Publicações são públicas por padrão, salvo quando a interface indicar outra visibilidade.</p>
          <p>Ao enviar conteúdo, você permite que a ORHA o armazene, processe e exiba somente para operar as funções escolhidas. Essa autorização não transfere a autoria do seu conteúdo.</p>
        </DocumentSection>

        <DocumentSection title="4. Condutas proibidas">
          <ul className="list-disc space-y-1 pl-5">
            <li>assédio, ameaças, discurso de ódio ou discriminação;</li>
            <li>exploração sexual, conteúdo envolvendo menores ou violência ilegal;</li>
            <li>golpes, spam, falsa identidade ou coleta indevida de dados;</li>
            <li>publicação de conteúdo sem autorização ou que viole direitos de terceiros;</li>
            <li>tentativa de acessar contas, mensagens ou áreas administrativas sem permissão.</li>
          </ul>
        </DocumentSection>

        <DocumentSection title="5. Segurança e moderação">
          <p>Qualquer pessoa pode bloquear perfis e denunciar conteúdo dentro do contexto em que ele aparece. A pessoa denunciada não recebe a identidade do denunciante.</p>
          <p>A equipe pode remover conteúdo, limitar recursos, suspender ou banir contas quando houver violação, risco à comunidade ou obrigação legal. A autoridade é validada pelo serviço e pelo banco, nunca por controles visuais do aplicativo.</p>
        </DocumentSection>

        <DocumentSection title="6. Conta, disponibilidade e mudanças">
          <p>Você pode solicitar exportação, desativação ou exclusão nas configurações. A exclusão possui a janela de arrependimento informada no fluxo da conta.</p>
          <p>O serviço pode sofrer interrupções e recursos podem mudar. Alterações relevantes destes termos devem ser apresentadas de forma clara antes de valerem para o uso futuro.</p>
        </DocumentSection>

        <DocumentSection title="7. Identificação do operador">
          {legalConfiguration.isComplete ? (
            <>
              <p><strong>Operador:</strong> {legalConfiguration.operatorName}.</p>
              <p><strong>Endereço público:</strong> {legalConfiguration.address}.</p>
              <p><strong>Foro aplicável:</strong> {legalConfiguration.forum}.</p>
            </>
          ) : (
            <>
              <p>ORHA é o nome do produto. A identificação jurídica do operador, endereço e foro aplicável ainda não foram fornecidos para publicação e não são inventados nesta versão.</p>
              <p>Esses dados devem ser incluídos aqui antes da abertura operacional ao público.</p>
            </>
          )}
        </DocumentSection>
      </article>

      <SettingsInfoLink
        path={SETTINGS_INFO_PATHS.privacy}
        onNavigate={onNavigate}
        className="flex min-h-14 items-center justify-center rounded-2xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 outline-none active:bg-gray-50 focus-visible:ring-2 focus-visible:ring-violet-600"
      >
        Ler a Política de Privacidade
      </SettingsInfoLink>
    </InfoPageShell>
  );
}

export function PrivacyPolicyPage({
  onBack,
  onNavigate,
  legalConfiguration = appLegalConfiguration,
}: LegalInfoPageProps) {
  return (
    <InfoPageShell
      title="Política de Privacidade"
      eyebrow="Seus dados e escolhas"
      summary="Esta política descreve os dados necessários para operar a ORHA, onde eles aparecem e quais controles estão disponíveis."
      icon={<ShieldCheck aria-hidden size={23} />}
      onBack={onBack}
    >
      <UpdatedAt configuration={legalConfiguration} />
      <article className="space-y-4" aria-label="Política de Privacidade da ORHA">
        <DocumentSection title="1. Dados tratados">
          <p>Tratamos dados de cadastro e segurança, como e-mail, identificador da conta, confirmação, sessões e registros necessários para proteger o acesso.</p>
          <p>Também tratamos os dados que você escolhe fornecer: nome, username, nascimento, cidade, bio, foto, capa, galeria, interesses, favoritos e configurações de privacidade.</p>
          <p>O funcionamento social exige registrar amizades, bloqueios, comunidades, publicações, comentários, reações, conversas, mensagens, anexos, áudios, notificações, denúncias e ações de moderação relacionadas à sua conta.</p>
        </DocumentSection>

        <DocumentSection title="2. Para que usamos">
          <ul className="list-disc space-y-1 pl-5">
            <li>autenticar a conta e retomar o onboarding;</li>
            <li>exibir o perfil conforme suas escolhas de privacidade;</li>
            <li>entregar amizades, comunidades, mensagens e notificações;</li>
            <li>armazenar mídia e gerar acessos temporários quando ela for privada;</li>
            <li>prevenir abuso, aplicar bloqueios, analisar denúncias e auditar ações sensíveis;</li>
            <li>atender solicitações de acesso, correção, exportação, desativação ou exclusão.</li>
          </ul>
          <p>Métricas técnicas e de uso são opcionais. Elas permanecem desativadas até você consentir em Configurações &gt; Dados e não incluem e-mail, mensagens, pesquisas, arquivos nem conteúdo do perfil.</p>
        </DocumentSection>

        <DocumentSection title="3. O que outras pessoas podem ver">
          <p>Seu e-mail não é público. Nome e @username identificam o perfil; publicações são públicas por padrão. Outros campos obedecem às opções de privacidade disponíveis para a conta.</p>
          <p>Mensagens e anexos privados ficam disponíveis somente aos participantes autorizados. Uma denúncia de mensagem pode preservar apenas a evidência necessária para a análise.</p>
          <p>O bloqueio é global: ele limita descoberta, solicitações e novas interações entre as contas envolvidas.</p>
        </DocumentSection>

        <DocumentSection title="4. Infraestrutura e armazenamento local">
          <p>Supabase fornece autenticação, banco, arquivos privados e atualizações em tempo real. O host do aplicativo entrega os arquivos da PWA. Esses fornecedores processam os dados necessários para prestar suas partes do serviço.</p>
          <p>Quando configurado e autorizado por você, PostHog recebe somente eventos técnicos previamente permitidos. Captura automática, gravação de sessão, conteúdo da tela, URLs completas e exceções com mensagem ou stack ficam desativados.</p>
          <p>O dispositivo pode manter dados técnicos indispensáveis à sessão, ao cache da PWA e à recuperação de conexão. Dados privados em cache devem ser separados por conta e limpos no logout ou na troca de usuário.</p>
        </DocumentSection>

        <DocumentSection title="5. Retenção e segurança">
          <p>Os dados permanecem enquanto a conta ou a finalidade correspondente estiver ativa. Pedidos de exclusão seguem a janela de arrependimento mostrada nas configurações; registros mínimos podem ser preservados quando necessários para segurança, auditoria ou obrigação legal.</p>
          <p>Aplicamos controle de acesso no banco, mídia privada e trilhas de auditoria. Nenhum serviço conectado à internet pode prometer risco zero.</p>
        </DocumentSection>

        <DocumentSection title="6. Seus direitos e idade mínima">
          <p>Você pode corrigir o perfil e solicitar acesso, exportação, desativação ou exclusão pelos fluxos da conta. Dúvidas sobre dados podem ser encaminhadas pelo canal de contato.</p>
          <p>A ORHA não é destinada a menores de 18 anos. Se uma conta de menor for identificada, ela poderá ser bloqueada e removida após a verificação necessária.</p>
        </DocumentSection>

        <DocumentSection title="7. Controlador e canal de privacidade">
          {legalConfiguration.isComplete ? (
            <>
              <p><strong>Controlador:</strong> {legalConfiguration.controllerName}.</p>
              <p>
                Solicitações de privacidade podem ser enviadas para{" "}
                <a
                  className="font-semibold text-violet-700 underline underline-offset-2"
                  href={`mailto:${legalConfiguration.privacyEmail}`}
                >
                  {legalConfiguration.privacyEmail}
                </a>.
              </p>
            </>
          ) : (
            <>
              <p>A identificação jurídica do controlador e o canal formal de privacidade ainda não foram fornecidos para publicação. Esta versão não atribui esses papéis a uma pessoa ou empresa sem confirmação.</p>
              <p>Antes da abertura operacional, os dados do controlador e o canal válido devem substituir este aviso.</p>
            </>
          )}
        </DocumentSection>
      </article>

      <SettingsInfoLink
        path={SETTINGS_INFO_PATHS.contact}
        onNavigate={onNavigate}
        className="flex min-h-14 items-center justify-center rounded-2xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 outline-none active:bg-gray-50 focus-visible:ring-2 focus-visible:ring-violet-600"
      >
        Abrir opções de contato
      </SettingsInfoLink>
    </InfoPageShell>
  );
}

const helpTopics = [
  {
    title: "Não consigo entrar na conta",
    content: "Use Esqueci minha senha na tela de acesso. Se o e-mail ainda não foi confirmado, solicite um novo envio. Nunca compartilhe senha ou código recebido por e-mail.",
  },
  {
    title: "Como funcionam amizade e conversa?",
    content: "A amizade depende de uma solicitação aceita no perfil. Uma solicitação de conversa apenas libera o chat e não transforma as pessoas em amigas.",
  },
  {
    title: "Como bloquear ou denunciar?",
    content: "Abra as opções do perfil, publicação, comentário ou mensagem. Bloquear interrompe descoberta e novas interações. Denunciar envia o contexto mínimo necessário para a moderação.",
  },
  {
    title: "Quem vê meu perfil?",
    content: "Nome e @username identificam o perfil. Publicações são públicas por padrão. Foto, idade, cidade, interesses, favoritos e galeria seguem os controles disponíveis em Privacidade.",
  },
  {
    title: "Como funcionam imagens e áudios?",
    content: "Mídias de perfil e comunidade seguem a visibilidade do conteúdo. Anexos e áudios de conversa são privados e devem ser acessados somente por participantes autorizados.",
  },
  {
    title: "Como sair ou excluir a conta?",
    content: "Em Configurações, abra Segurança para encerrar sessões ou Conta para solicitar exportação, desativação e exclusão. A tela informa os efeitos e a janela de cancelamento antes da confirmação.",
  },
] as const;

export function HelpPage({ onBack, onNavigate }: LinkedInfoPageProps) {
  return (
    <InfoPageShell
      title="Ajuda"
      eyebrow="Respostas objetivas"
      summary="Encontre orientações sobre acesso, privacidade, segurança e os principais recursos sociais da ORHA."
      icon={<CircleHelp aria-hidden size={23} />}
      onBack={onBack}
    >
      <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white" aria-labelledby="help-topics-title">
        <h2 id="help-topics-title" className="border-b border-gray-100 px-5 py-4 text-base font-semibold">
          Dúvidas frequentes
        </h2>
        <div className="divide-y divide-gray-100">
          {helpTopics.map((topic) => (
            <details className="group" key={topic.title}>
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 text-left text-sm font-semibold text-gray-900 outline-none [&::-webkit-details-marker]:hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-600">
                <span className="min-w-0 flex-1">{topic.title}</span>
                <ChevronDown aria-hidden className="shrink-0 text-gray-400 transition-transform group-open:rotate-180" size={19} />
              </summary>
              <p className="px-5 pb-4 text-sm leading-6 text-gray-600">{topic.content}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-violet-100 bg-violet-50 p-5">
        <span className="grid size-11 place-items-center rounded-2xl bg-white text-violet-700">
          <HeartHandshake aria-hidden size={21} />
        </span>
        <h2 className="mt-3 font-semibold">Ainda precisa de ajuda?</h2>
        <p className="mt-1 text-sm leading-6 text-gray-600">Veja os canais disponíveis e escolha o tipo de atendimento adequado.</p>
        <SettingsInfoLink
          path={SETTINGS_INFO_PATHS.contact}
          onNavigate={onNavigate}
          className="mt-4 flex min-h-12 items-center justify-center rounded-xl bg-gray-950 px-4 text-sm font-semibold text-white outline-none active:bg-gray-800 focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2"
        >
          Ver opções de contato
        </SettingsInfoLink>
      </section>
    </InfoPageShell>
  );
}

export function ContactPage({
  onBack,
  onOpenSupport,
  supportEmail = appLegalConfiguration.supportEmail,
}: SettingsInfoPageProps & { supportEmail?: string | null; onOpenSupport?: () => void }) {
  const normalizedEmail = normalizeSupportEmail(supportEmail);
  const mailtoHref = buildSupportMailto(normalizedEmail);

  return (
    <InfoPageShell
      title="Contato"
      eyebrow="Escolha o canal correto"
      summary="Abra um chamado persistente dentro da ORHA. O contato por e-mail só aparece quando há um endereço público válido para este ambiente."
      icon={<Mail aria-hidden size={23} />}
      onBack={onBack}
    >
      <section className="rounded-3xl border border-violet-200 bg-violet-50 p-5">
        <span className="grid size-11 place-items-center rounded-2xl bg-violet-700 text-white">
          <Headphones aria-hidden size={21} />
        </span>
        <h2 className="mt-3 font-semibold">Atendimento dentro da ORHA</h2>
        <p className="mt-1 text-sm leading-6 text-gray-600">
          Seu chamado e as respostas ficam salvos na sua conta. Apenas você e a equipe autorizada de suporte podem ler a conversa.
        </p>
        {onOpenSupport && (
          <Button color="primary" size="lg" className="mt-4 w-full" iconLeading={Headphones} onPress={onOpenSupport}>
            Abrir suporte
          </Button>
        )}
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-5">
        <span className="grid size-11 place-items-center rounded-2xl bg-violet-50 text-violet-700">
          <Mail aria-hidden size={21} />
        </span>
        <h2 className="mt-3 font-semibold">Suporte por e-mail</h2>
        {mailtoHref && normalizedEmail ? (
          <>
            <p className="mt-1 text-sm leading-6 text-gray-600">
              O botão abre o aplicativo de e-mail do seu dispositivo. O envio e a confirmação são feitos pelo seu provedor, não dentro da ORHA.
            </p>
            <p className="mt-3 break-all text-sm font-medium text-gray-900">{normalizedEmail}</p>
            <Button href={mailtoHref} color="primary" size="lg" className="mt-4 w-full" iconLeading={Mail}>
              Abrir aplicativo de e-mail
            </Button>
          </>
        ) : (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4" role="status">
            <p className="text-sm font-semibold text-amber-900">Canal de e-mail ainda não configurado</p>
            <p className="mt-1 text-sm leading-5 text-amber-800">
              Nenhum endereço público de suporte foi definido neste ambiente. Não há mensagem registrada ou aguardando envio.
            </p>
          </div>
        )}
      </section>

      <DocumentSection title="Conteúdo, abuso ou risco">
        <div className="flex gap-3">
          <MessageCircleWarning aria-hidden className="mt-0.5 shrink-0 text-red-700" size={21} />
          <p>Use Denunciar no perfil, publicação, comentário ou mensagem correspondente. Isso preserva o contexto necessário e protege a identidade do denunciante.</p>
        </div>
        <p>Em uma emergência ou risco imediato, procure os serviços públicos de emergência da sua região. A ORHA não substitui atendimento de emergência.</p>
      </DocumentSection>

      <DocumentSection title="Conta e privacidade">
        <div className="flex gap-3">
          <LockKeyhole aria-hidden className="mt-0.5 shrink-0 text-violet-700" size={21} />
          <p>Recuperação de senha começa na tela de login. Exportação, desativação e exclusão ficam em Configurações &gt; Conta.</p>
        </div>
      </DocumentSection>

      <DocumentSection title="Envie somente o necessário">
        <div className="flex gap-3">
          <UserRoundCheck aria-hidden className="mt-0.5 shrink-0 text-emerald-700" size={21} />
          <p>Informe o @username e uma descrição objetiva. Nunca envie senha, código de confirmação, dados bancários ou cópias excessivas de conversas privadas.</p>
        </div>
        <p>O andamento do chamado fica visível na própria fila: aberto, em atendimento ou resolvido.</p>
      </DocumentSection>
    </InfoPageShell>
  );
}
