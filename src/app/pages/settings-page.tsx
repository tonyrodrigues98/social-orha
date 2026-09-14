import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ChartNoAxesCombined,
  Download,
  FileText,
  LockKeyhole,
  LogOut,
  Mail,
  Shield,
  ShieldCheck,
  Trash2,
  UserRoundX,
} from "lucide-react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Toggle } from "@/components/base/toggle/toggle";
import {
  useNotificationPreferences,
  type NotificationPreferences,
  type NotificationPreferencesUpdate,
} from "@/domains/notifications";
import {
  useAccountLifecycle,
  useAccountAccess,
  useAccountSecurity,
  useBlockedProfiles,
  type AccountLifecycleKind,
  type AccountLifecycleRequest,
} from "@/domains/trust";
import {
  SETTINGS_INFO_PATHS,
  type SettingsInfoPath,
} from "../settings/settings-info-routes";
import { SettingsInfoLink } from "../settings/settings-info-link";
import { buildLaunchNotificationPreferencesUpdate } from "../settings/notification-settings-policy";
import { useAuth } from "../auth/auth-context";
import { useAnalytics } from "../analytics/analytics-context";
import {
  useOwnProfileSettingsQuery,
  useUpdateOwnSettingsMutation,
} from "../profile/profile-queries";

export type SettingsSection = "notifications" | "privacy" | "blocked" | "security" | "account" | "support";

const sections: Array<{ value: SettingsSection; label: string }> = [
  { value: "notifications", label: "Notificações" },
  { value: "privacy", label: "Dados" },
  { value: "blocked", label: "Bloqueados" },
  { value: "security", label: "Segurança" },
  { value: "account", label: "Conta" },
  { value: "support", label: "Ajuda" },
];

function NotificationPreferencesForm({
  preferences,
  status,
  error,
  onSave,
}: {
  preferences: NotificationPreferences;
  status: "loading" | "ready" | "saving" | "error";
  error: string | null;
  onSave: (input: NotificationPreferencesUpdate) => Promise<NotificationPreferences>;
}) {
  const [draft, setDraft] = useState<NotificationPreferencesUpdate>({
    socialEnabled: preferences.socialEnabled,
    messagesEnabled: preferences.messagesEnabled,
    communityEnabled: preferences.communityEnabled,
    systemEnabled: true,
    emailEnabled: false,
    pushEnabled: false,
    quietHoursStart: preferences.quietHoursStart,
    quietHoursEnd: preferences.quietHoursEnd,
  });
  const [saved, setSaved] = useState(false);

  const toggle = (field: keyof NotificationPreferencesUpdate) => (value: boolean) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setSaved(false);
  };

  return (
    <section className="space-y-4">
      <div className="rounded-3xl border border-gray-200 bg-white px-4">
        <div className="border-b border-gray-100 py-4">
          <Toggle
            size="md"
            label="Atividade social"
            hint="Amizades, comentários e reações"
            isSelected={draft.socialEnabled}
            onChange={toggle("socialEnabled")}
          />
        </div>
        <div className="border-b border-gray-100 py-4">
          <Toggle
            size="md"
            label="Mensagens"
            hint="Solicitações e atividade nas conversas"
            isSelected={draft.messagesEnabled}
            onChange={toggle("messagesEnabled")}
          />
        </div>
        <div className="border-b border-gray-100 py-4">
          <Toggle
            size="md"
            label="Comunidades"
            hint="Publicações e atualizações das suas comunidades"
            isSelected={draft.communityEnabled}
            onChange={toggle("communityEnabled")}
          />
        </div>
        <div className="py-4" role="note" aria-label="Avisos obrigatórios de sistema e segurança">
          <p className="text-sm font-semibold text-gray-900">Sistema e segurança</p>
          <p className="mt-1 text-sm text-gray-600">
            Avisos críticos sobre sua conta e ações de moderação permanecem sempre ativos.
          </p>
        </div>
      </div>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      {saved && <p className="text-sm text-emerald-700" role="status">Preferências salvas.</p>}
      <Button
        color="primary"
        size="lg"
        className="w-full"
        isLoading={status === "saving"}
        onPress={() => void onSave(buildLaunchNotificationPreferencesUpdate(draft))
          .then(() => setSaved(true))
          .catch(() => setSaved(false))}
      >
        Salvar preferências
      </Button>
    </section>
  );
}

function NotificationSettings() {
  const query = useNotificationPreferences();
  if (query.status === "loading") {
    return <div className="h-80 animate-pulse rounded-3xl bg-gray-100" aria-label="Carregando preferências" />;
  }
  if (!query.preferences) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-4" role="alert">
        <p className="text-sm text-red-800">{query.error ?? "Preferências indisponíveis."}</p>
        <Button color="secondary-destructive" size="sm" className="mt-3" onPress={() => void query.reload()}>
          Tentar novamente
        </Button>
      </div>
    );
  }
  return (
    <NotificationPreferencesForm
      key={query.preferences.updatedAt}
      preferences={query.preferences}
      status={query.status}
      error={query.error}
      onSave={query.save}
    />
  );
}

function AnalyticsConsentForm({
  enabled,
  consentUpdatedAt,
  configured,
  active,
  isSaving,
  onSave,
}: {
  enabled: boolean;
  consentUpdatedAt: string | null;
  configured: boolean;
  active: boolean;
  isSaving: boolean;
  onSave: (enabled: boolean) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(enabled);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section className="space-y-4" aria-labelledby="analytics-consent-title">
      <div className="rounded-3xl border border-gray-200 bg-white p-4">
        <span className="grid size-11 place-items-center rounded-full bg-violet-50 text-violet-700">
          <ChartNoAxesCombined aria-hidden size={20} />
        </span>
        <h2 id="analytics-consent-title" className="mt-3 font-semibold text-gray-950">
          Ajudar a melhorar a ORHA
        </h2>
        <p className="mt-1 text-sm leading-5 text-gray-600">
          Autorize métricas técnicas e de uso para encontrarmos falhas e melhorarmos os fluxos.
          É opcional e permanece desativado até você escolher ativar.
        </p>
        <div className="mt-4 border-t border-gray-100 pt-4">
          <Toggle
            size="md"
            label="Compartilhar métricas de uso"
            hint="Nunca inclui e-mail, textos, pesquisas, mensagens, arquivos ou conteúdo do perfil"
            isSelected={draft}
            onChange={(value) => {
              setDraft(value);
              setMessage(null);
            }}
          />
        </div>
      </div>

      <div className="rounded-2xl bg-gray-100 p-4 text-sm leading-5 text-gray-700" role="note">
        <strong className="block text-gray-950">Estado neste ambiente</strong>
        <span>
          {!configured
            ? "O serviço de métricas ainda não foi configurado; nenhuma informação é enviada. Sua escolha fica salva para você controlar."
            : active
              ? "Métricas consentidas estão ativas nesta sessão."
              : "Nenhuma métrica está sendo enviada nesta sessão."}
        </span>
        {consentUpdatedAt ? (
          <small className="mt-2 block text-gray-500">
            Escolha atualizada em {new Date(consentUpdatedAt).toLocaleString("pt-BR")}.
          </small>
        ) : null}
      </div>

      {message ? <p className="text-sm text-emerald-700" role="status">{message}</p> : null}
      <Button
        color="primary"
        size="lg"
        className="w-full"
        isLoading={isSaving}
        isDisabled={draft === enabled}
        onPress={() => void onSave(draft).then(() => {
          setMessage(draft ? "Consentimento salvo." : "Métricas desativadas.");
        }).catch(() => setMessage(null))}
      >
        Salvar escolha
      </Button>
    </section>
  );
}

function PrivacyAndDataSettings() {
  const auth = useAuth();
  const analytics = useAnalytics();
  const profileId = auth.user?.id ?? "";
  const query = useOwnProfileSettingsQuery(profileId);
  const mutation = useUpdateOwnSettingsMutation(profileId);

  if (query.isLoading) {
    return <div className="h-72 animate-pulse rounded-3xl bg-gray-100" aria-label="Carregando controles de dados" />;
  }
  if (!query.data) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-4" role="alert">
        <p className="text-sm text-red-800">Não foi possível carregar seus controles de dados.</p>
        <Button color="secondary-destructive" size="sm" className="mt-3" onPress={() => void query.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <>
      <AnalyticsConsentForm
        key={`${query.data.analytics_enabled}:${query.data.analytics_consent_updated_at ?? "unset"}`}
        enabled={query.data.analytics_enabled}
        consentUpdatedAt={query.data.analytics_consent_updated_at}
        configured={analytics.configured}
        active={analytics.active}
        isSaving={mutation.isPending}
        onSave={(analyticsEnabled) => mutation.mutateAsync({ analytics_enabled: analyticsEnabled })}
      />
      {mutation.error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          Não foi possível salvar sua escolha. Tente novamente.
        </p>
      ) : null}
    </>
  );
}

function BlockedSettings() {
  const query = useBlockedProfiles();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (query.status === "loading") {
    return <div className="h-48 animate-pulse rounded-3xl bg-gray-100" aria-label="Carregando pessoas bloqueadas" />;
  }
  return (
    <section>
      <div className="mb-4 flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-amber-900">
        <Shield aria-hidden className="mt-0.5 shrink-0" size={20} />
        <p className="text-sm leading-5">
          Pessoas bloqueadas não podem encontrar você, enviar solicitações ou iniciar conversas.
        </p>
      </div>
      {(query.error || actionError) && (
        <p className="mb-3 rounded-2xl bg-red-50 p-3 text-sm text-red-800" role="alert">
          {actionError ?? query.error}
        </p>
      )}
      {query.items.length === 0 && query.status === "ready" ? (
        <div className="rounded-3xl border border-gray-200 bg-white px-6 py-10 text-center">
          <UserRoundX aria-hidden className="mx-auto text-gray-400" size={30} />
          <h2 className="mt-3 font-semibold text-gray-950">Nenhuma pessoa bloqueada</h2>
          <p className="mt-1 text-sm text-gray-500">Seus bloqueios persistentes aparecerão aqui.</p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-gray-100 overflow-hidden rounded-3xl border border-gray-200 bg-white">
            {query.items.map((block) => {
              const profile = block.blockedProfile;
              return (
                <div className="flex min-h-16 items-center gap-3 px-4 py-3" key={block.id}>
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-gray-100 text-sm font-semibold text-gray-700">
                    {(profile?.fullName ?? profile?.username ?? "?").slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-sm text-gray-950">{profile?.fullName ?? "Perfil indisponível"}</strong>
                    {profile?.username && <small className="text-gray-500">@{profile.username}</small>}
                  </span>
                  <Button
                    color="secondary"
                    size="sm"
                    isLoading={pendingId === block.blockedProfileId}
                    onPress={() => {
                      setPendingId(block.blockedProfileId);
                      setActionError(null);
                      void query
                        .unblock(block.blockedProfileId)
                        .catch(() => setActionError("Não foi possível desbloquear esta pessoa."))
                        .finally(() => setPendingId(null));
                    }}
                  >
                    Desbloquear
                  </Button>
                </div>
              );
            })}
          </div>
          {query.nextCursor && (
            <Button
              color="secondary"
              size="md"
              className="mt-3 w-full"
              isLoading={query.isLoadingMore}
              onPress={() => void query.loadMore()}
            >
              Carregar mais
            </Button>
          )}
        </>
      )}
    </section>
  );
}

function SecuritySettings({ onSignedOut }: { onSignedOut: () => void }) {
  const account = useAccountSecurity();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const savePassword = async () => {
    setMessage(null);
    if (password !== confirmation) {
      setMessage("As senhas não coincidem.");
      return;
    }
    const passwordForReauthentication = currentPassword;
    const nextPassword = password;
    setCurrentPassword("");
    setPassword("");
    setConfirmation("");
    try {
      await account.changePassword(passwordForReauthentication, nextPassword);
      setMessage("Senha alterada com segurança.");
    } catch {
      // O hook já expõe o erro tipado e seguro.
    }
  };

  return (
    <section className="space-y-4">
      <div className="rounded-3xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-full bg-violet-50 text-violet-700">
            <LockKeyhole aria-hidden size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-950">Conta autenticada</h2>
            <p className="truncate text-sm text-gray-500">{account.summary?.email ?? "Carregando…"}</p>
          </div>
        </div>
        {account.summary && (
          <dl className="mt-4 grid gap-2 border-t border-gray-100 pt-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">E-mail confirmado</dt>
              <dd className="font-medium text-gray-900">{account.summary.emailConfirmed ? "Sim" : "Não"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Último acesso</dt>
              <dd className="font-medium text-gray-900">
                {account.summary.lastSignInAt ? new Date(account.summary.lastSignInAt).toLocaleString("pt-BR") : "Não informado"}
              </dd>
            </div>
          </dl>
        )}
      </div>

      <form
        className="space-y-3 rounded-3xl border border-gray-200 bg-white p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void savePassword();
        }}
      >
        <div>
          <h2 className="font-semibold text-gray-950">Alterar senha</h2>
          <p className="text-sm text-gray-500">Use pelo menos 12 caracteres.</p>
        </div>
        <Input
          label="Senha atual"
          type="password"
          value={currentPassword}
          onChange={setCurrentPassword}
          autoComplete="current-password"
          isRequired
        />
        <Input
          label="Nova senha"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          isRequired
        />
        <Input
          label="Confirmar nova senha"
          type="password"
          value={confirmation}
          onChange={setConfirmation}
          autoComplete="new-password"
          isRequired
        />
        {(account.error || message) && (
          <p
            className={`text-sm ${message?.includes("alterada") ? "text-emerald-700" : "text-red-700"}`}
            role={account.error || !message?.includes("alterada") ? "alert" : "status"}
          >
            {account.error ?? message}
          </p>
        )}
        <Button color="primary" size="md" className="w-full" type="submit" isLoading={account.status === "saving"}>
          Atualizar senha
        </Button>
      </form>

      <div className="rounded-3xl border border-gray-200 bg-white p-4">
        <h2 className="font-semibold text-gray-950">Encerrar sessões</h2>
        <p className="mt-1 text-sm leading-5 text-gray-500">
          Desconecta esta conta de todos os dispositivos autenticados.
        </p>
        <Button
          color="secondary-destructive"
          size="md"
          className="mt-4 w-full"
          iconLeading={LogOut}
          onPress={() =>
            void account
              .signOutEverywhere()
              .then(onSignedOut)
              .catch(() => setMessage("Não foi possível encerrar as sessões agora."))
          }
        >
          Sair de todos os dispositivos
        </Button>
      </div>
    </section>
  );
}

const lifecycleLabels: Record<AccountLifecycleRequest["status"], string> = {
  pending: "Pendente",
  processing: "Em processamento",
  completed: "Concluída",
  cancelled: "Cancelada",
  failed: "Falhou",
};

const lifecycleKindLabels: Record<AccountLifecycleKind, string> = {
  export: "Exportação dos dados",
  deactivate: "Desativação da conta",
  delete: "Exclusão da conta",
};

function AccountSettings() {
  const lifecycle = useAccountLifecycle();
  const accountAccess = useAccountAccess();
  const [selectedKind, setSelectedKind] = useState<Exclude<AccountLifecycleKind, "export"> | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const activeRequests = lifecycle.requests.filter((request) =>
    request.status === "pending" || request.status === "processing",
  );
  const activeExport = activeRequests.some((request) => request.kind === "export");
  const activeDestructiveRequest = activeRequests.find(
    (request) => request.kind === "deactivate" || request.kind === "delete",
  );

  const requestExport = async () => {
    setMessage(null);
    try {
      const created = await lifecycle.request("export");
      if (!created?.exportArtifact?.downloadUrl) {
        throw new Error("A exportação não retornou um arquivo privado.");
      }
      const download = document.createElement("a");
      download.href = created.exportArtifact.downloadUrl;
      download.download = "orha-dados.json";
      download.rel = "noopener noreferrer";
      document.body.append(download);
      download.click();
      download.remove();
      setMessage("Exportação concluída. O download privado foi iniciado.");
    } catch {
      setMessage(null);
    }
  };

  const submitDestructiveRequest = async () => {
    if (!selectedKind) return;
    const requiredText = selectedKind === "delete" ? "EXCLUIR" : "DESATIVAR";
    if (confirmation.trim().toUpperCase() !== requiredText) {
      setMessage(`Digite ${requiredText} para confirmar.`);
      return;
    }
    const passwordForReauthentication = currentPassword;
    setCurrentPassword("");
    setMessage(null);
    try {
      await lifecycle.request(selectedKind, passwordForReauthentication);
      await accountAccess.reload();
      setMessage(
        selectedKind === "delete"
          ? "Exclusão agendada. Você tem 30 dias para cancelar."
          : "Conta desativada. A solicitação pode ser cancelada enquanto estiver pendente.",
      );
      setSelectedKind(null);
      setConfirmation("");
    } catch {
      setMessage(null);
    }
  };

  const cancel = async (request: AccountLifecycleRequest) => {
    setPendingId(request.id);
    setMessage(null);
    try {
      await lifecycle.cancel(request.id);
      await accountAccess.reload();
      setMessage("Solicitação cancelada e estado da conta reconciliado.");
    } catch {
      setMessage(null);
    } finally {
      setPendingId(null);
    }
  };

  if (lifecycle.status === "loading") {
    return <div className="h-72 animate-pulse rounded-3xl bg-gray-100" aria-label="Carregando solicitações da conta" />;
  }

  return (
    <section className="space-y-4">
      {accountAccess.summary && (
        <div
          className={`rounded-3xl border p-4 ${
            accountAccess.summary.effectiveStatus === "active" && accountAccess.summary.accessEnabled
              ? "border-emerald-200 bg-emerald-50"
              : "border-amber-200 bg-amber-50"
          }`}
        >
          <h2 className="font-semibold text-gray-950">
            {accountAccess.summary.effectiveStatus === "active" && accountAccess.summary.accessEnabled
              ? "Conta ativa"
              : "Acesso social restrito"}
          </h2>
          {(!accountAccess.summary.accessEnabled || accountAccess.summary.effectiveStatus !== "active")
            && accountAccess.summary.publicReason && (
            <p className="mt-1 text-sm leading-5 text-gray-700">{accountAccess.summary.publicReason}</p>
          )}
          {accountAccess.summary.effectiveStatus !== "active" && accountAccess.summary.restrictedUntil && (
            <p className="mt-2 text-xs text-gray-600">
              Revisão prevista para {new Date(accountAccess.summary.restrictedUntil).toLocaleString("pt-BR")}.
            </p>
          )}
        </div>
      )}
      {accountAccess.error && (
        <div className="rounded-2xl bg-red-50 p-3" role="alert">
          <p className="text-sm text-red-800">{accountAccess.error}</p>
          <Button color="secondary-destructive" size="sm" className="mt-2" onPress={() => void accountAccess.reload()}>
            Tentar novamente
          </Button>
        </div>
      )}
      {(lifecycle.error || message) && (
        <p
          className={`rounded-2xl p-3 text-sm ${
            lifecycle.error || message?.startsWith("Digite ")
              ? "bg-red-50 text-red-800"
              : "bg-emerald-50 text-emerald-800"
          }`}
          role={lifecycle.error || message?.startsWith("Digite ") ? "alert" : "status"}
        >
          {lifecycle.error ?? message}
        </p>
      )}

      <div className="rounded-3xl border border-gray-200 bg-white p-4">
        <span className="grid size-11 place-items-center rounded-full bg-violet-50 text-violet-700">
          <Download aria-hidden size={20} />
        </span>
        <h2 className="mt-3 font-semibold text-gray-950">Baixar seus dados</h2>
        <p className="mt-1 text-sm leading-5 text-gray-500">
          Gera um arquivo privado com seus dados e links temporários para suas mídias.
        </p>
        <Button
          color="secondary"
          size="md"
          className="mt-4 w-full"
          isDisabled={activeExport}
          isLoading={lifecycle.status === "saving" && !selectedKind}
          onPress={() => void requestExport()}
        >
          {activeExport ? "Exportação em andamento" : "Solicitar exportação"}
        </Button>
      </div>

      <div className="rounded-3xl border border-red-200 bg-white p-4">
        <span className="grid size-11 place-items-center rounded-full bg-red-50 text-red-700">
          <Trash2 aria-hidden size={20} />
        </span>
        <h2 className="mt-3 font-semibold text-gray-950">Desativação e exclusão</h2>
        <p className="mt-1 text-sm leading-5 text-gray-500">
          A desativação é imediata. A exclusão possui janela de arrependimento de 30 dias e pode ser cancelada antes do processamento final.
        </p>
        {!activeDestructiveRequest && !selectedKind && (
          <div className="mt-4 grid gap-2">
            <Button color="secondary" size="md" onPress={() => setSelectedKind("deactivate")}>
              Desativar conta
            </Button>
            <Button color="secondary-destructive" size="md" onPress={() => setSelectedKind("delete")}>
              Solicitar exclusão
            </Button>
          </div>
        )}
        {selectedKind && (
          <form
            className="mt-4 space-y-3 border-t border-red-100 pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submitDestructiveRequest();
            }}
          >
            <Input
              label={`Digite ${selectedKind === "delete" ? "EXCLUIR" : "DESATIVAR"} para confirmar`}
              value={confirmation}
              onChange={setConfirmation}
              autoComplete="off"
              isRequired
            />
            <Input
              label="Senha atual"
              type="password"
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="current-password"
              isRequired
            />
            <div className="grid grid-cols-2 gap-2">
              <Button color="secondary" size="md" onPress={() => setSelectedKind(null)}>
                Voltar
              </Button>
              <Button color="primary-destructive" size="md" type="submit" isLoading={lifecycle.status === "saving"}>
                Confirmar
              </Button>
            </div>
          </form>
        )}
      </div>

      {lifecycle.requests.length > 0 && (
        <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white">
          <h2 className="border-b border-gray-100 px-4 py-3 font-semibold text-gray-950">Solicitações da conta</h2>
          <div className="divide-y divide-gray-100">
            {lifecycle.requests.map((request) => (
              <div className="px-4 py-3" key={request.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong className="block text-sm text-gray-950">{lifecycleKindLabels[request.kind]}</strong>
                    <time className="text-xs text-gray-500" dateTime={request.requestedAt}>
                      {new Date(request.requestedAt).toLocaleString("pt-BR")}
                    </time>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                    {lifecycleLabels[request.status]}
                  </span>
                </div>
                {request.scheduledFor && (
                  <p className="mt-2 text-xs text-gray-500">
                    Processamento previsto para {new Date(request.scheduledFor).toLocaleDateString("pt-BR")}.
                  </p>
                )}
                {request.status === "pending" && (
                  <Button
                    color="link-destructive"
                    size="sm"
                    className="mt-2"
                    isLoading={pendingId === request.id}
                    onPress={() => void cancel(request)}
                  >
                    Cancelar solicitação
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

const informationLinks = [
  {
    path: SETTINGS_INFO_PATHS.terms,
    title: "Termos de Uso",
    description: "Idade mínima, convivência, conteúdo e moderação",
    icon: FileText,
  },
  {
    path: SETTINGS_INFO_PATHS.privacy,
    title: "Política de Privacidade",
    description: "Dados tratados, visibilidade, retenção e seus controles",
    icon: ShieldCheck,
  },
  {
    path: SETTINGS_INFO_PATHS.help,
    title: "Central de Ajuda",
    description: "Acesso, amizades, conversas, segurança e conta",
    icon: CircleHelp,
  },
  {
    path: SETTINGS_INFO_PATHS.contact,
    title: "Contato",
    description: "Canais disponíveis, denúncias e solicitações de privacidade",
    icon: Mail,
  },
] as const;

function SupportSettings({
  onNavigate,
}: {
  onNavigate?: (path: SettingsInfoPath) => void;
}) {
  return (
    <section aria-labelledby="settings-support-title">
      <div className="mb-4 rounded-2xl bg-violet-50 p-4">
        <h2 id="settings-support-title" className="font-semibold text-gray-950">
          Informação e suporte
        </h2>
        <p className="mt-1 text-sm leading-5 text-gray-600">
          Consulte as regras do produto e escolha um canal real para cada necessidade.
        </p>
      </div>

      <nav
        aria-label="Informação e suporte"
        className="divide-y divide-gray-100 overflow-hidden rounded-3xl border border-gray-200 bg-white"
      >
        {informationLinks.map((item) => {
          const Icon = item.icon;
          return (
            <SettingsInfoLink
              key={item.path}
              path={item.path}
              onNavigate={onNavigate}
              className="flex min-h-[72px] items-center gap-3 px-4 py-3 outline-none active:bg-gray-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-600"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gray-100 text-gray-700">
                <Icon aria-hidden size={20} />
              </span>
              <span className="min-w-0 flex-1 text-left">
                <strong className="block text-sm font-semibold text-gray-950">{item.title}</strong>
                <span className="mt-0.5 block text-xs leading-5 text-gray-500">{item.description}</span>
              </span>
              <ChevronRight aria-hidden className="shrink-0 text-gray-400" size={19} />
            </SettingsInfoLink>
          );
        })}
      </nav>
    </section>
  );
}

export function SettingsPage({
  onBack,
  onSignedOut,
  onNavigate,
  initialSection = "notifications",
}: {
  onBack: () => void;
  onSignedOut: () => void;
  onNavigate?: (path: SettingsInfoPath) => void;
  initialSection?: SettingsSection;
}) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  return (
    <div className="page min-h-dvh bg-gray-50">
      <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/95 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex min-h-11 items-center gap-2">
          <button
            type="button"
            aria-label="Voltar"
            onClick={onBack}
            className="grid size-11 place-items-center rounded-full outline-none active:bg-gray-100 focus-visible:ring-2 focus-visible:ring-violet-600"
          >
            <ChevronLeft aria-hidden size={22} />
          </button>
          <h1 className="text-xl font-semibold tracking-tight text-gray-950">Configurações</h1>
        </div>
        <div className="mt-3 flex gap-1 overflow-x-auto" role="group" aria-label="Seções de configuração">
          {sections.map((item) => (
            <button
              type="button"
              aria-pressed={section === item.value}
              key={item.value}
              onClick={() => setSection(item.value)}
              className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-violet-600 ${
                section === item.value ? "bg-gray-950 text-white" : "bg-gray-100 text-gray-600"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>
      <main className="px-4 py-5 pb-[max(32px,env(safe-area-inset-bottom))]">
        {section === "notifications" && <NotificationSettings />}
        {section === "privacy" && <PrivacyAndDataSettings />}
        {section === "blocked" && <BlockedSettings />}
        {section === "security" && <SecuritySettings onSignedOut={onSignedOut} />}
        {section === "account" && <AccountSettings />}
        {section === "support" && <SupportSettings onNavigate={onNavigate} />}
      </main>
    </div>
  );
}
