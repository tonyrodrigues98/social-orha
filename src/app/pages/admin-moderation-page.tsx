import { useState } from "react";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import type { AppRole } from "@/domain/identity";
import {
  useModerationQueue,
  useModerationReportContext,
  useModerationReportAttachments,
  type ModerationReportAttachment,
  type ModerationActionType,
  type Report,
  type ReportStatus,
} from "@/domains/trust";

const moderatorRoles: readonly AppRole[] = ["super_admin", "admin", "moderator"];

const statusOptions: Array<{ value: ReportStatus | "all"; label: string }> = [
  { value: "open", label: "Abertas" },
  { value: "in_review", label: "Em análise" },
  { value: "resolved", label: "Resolvidas" },
  { value: "dismissed", label: "Descartadas" },
  { value: "all", label: "Todas" },
];

const actionOptions: Array<{ value: ModerationActionType; label: string }> = [
  { value: "dismiss", label: "Descartar denúncia" },
  { value: "warn", label: "Advertir" },
  { value: "hide_content", label: "Ocultar conteúdo" },
  { value: "remove_content", label: "Remover conteúdo" },
  { value: "restrict", label: "Restringir perfil" },
  { value: "suspend", label: "Suspender perfil" },
  { value: "ban", label: "Banir perfil" },
];

function actionsForReport(report: Report) {
  return report.targetType === "profile"
    ? actionOptions.filter((item) => item.value !== "hide_content" && item.value !== "remove_content")
    : actionOptions;
}

const reportLabels: Record<Report["category"], string> = {
  harassment: "Assédio",
  hate: "Ódio",
  sexual_content: "Conteúdo sexual",
  violence: "Violência",
  spam: "Spam",
  impersonation: "Falsa identidade",
  privacy: "Privacidade",
  other: "Outro",
};

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentPreview({ attachment }: { attachment: ModerationReportAttachment }) {
  if (attachment.mimeType.startsWith("image/")) {
    return (
      <img
        src={attachment.signedUrl}
        alt="Anexo privado do item denunciado"
        width={attachment.width ?? 1200}
        height={attachment.height ?? 900}
        className="mt-2 max-h-72 w-full rounded-xl bg-gray-100 object-contain"
      />
    );
  }
  if (attachment.mimeType.startsWith("audio/")) {
    return (
      <audio
        controls
        controlsList="nodownload"
        preload="metadata"
        src={attachment.signedUrl}
        className="mt-2 w-full"
      >
        Seu navegador não consegue reproduzir este áudio.
      </audio>
    );
  }
  if (attachment.mimeType.startsWith("video/")) {
    return (
      <video
        controls
        controlsList="nodownload"
        preload="metadata"
        src={attachment.signedUrl}
        width={attachment.width ?? 1280}
        height={attachment.height ?? 720}
        className="mt-2 max-h-72 w-full rounded-xl bg-black object-contain"
      >
        Seu navegador não consegue reproduzir este vídeo.
      </video>
    );
  }
  return (
    <a
      href={attachment.signedUrl}
      target="_blank"
      rel="noreferrer"
      className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-gray-950 px-4 text-sm font-semibold text-white"
    >
      Abrir arquivo privado
    </a>
  );
}

function ReportAttachments({ reportId, attachmentIds }: { reportId: string; attachmentIds: string[] }) {
  const attachments = useModerationReportAttachments(reportId);
  return (
    <div className="mt-3 space-y-2">
      {attachmentIds.map((attachmentId, index) => {
        const loaded = attachments.items[attachmentId];
        return (
          <div className="rounded-xl border border-amber-200 bg-white p-2" key={attachmentId}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-gray-700">Anexo privado {index + 1}</span>
              <Button
                color="secondary"
                size="sm"
                isDisabled={Boolean(attachments.pendingId && attachments.pendingId !== attachmentId)}
                isLoading={attachments.pendingId === attachmentId}
                onPress={() => void attachments.load(attachmentId).catch(() => undefined)}
              >
                {loaded ? "Renovar por 60 s" : "Autorizar por 60 s"}
              </Button>
            </div>
            {loaded && (
              <>
                <p className="mt-1 text-xs text-gray-500">
                  {loaded.mimeType} · {formatFileSize(loaded.byteSize)} · URL temporária e leitura auditada
                </p>
                <AttachmentPreview attachment={loaded} />
              </>
            )}
          </div>
        );
      })}
      {attachments.error && <p className="text-xs text-red-700" role="alert">{attachments.error}</p>}
    </div>
  );
}

function ReportCard({ report, onSelect }: { report: Report; onSelect: (report: Report) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(report)}
      className="w-full rounded-3xl border border-gray-200 bg-white p-4 text-left outline-none transition-shadow active:bg-gray-50 focus-visible:ring-2 focus-visible:ring-violet-600"
    >
      <span className="flex items-center justify-between gap-3">
        <strong className="text-sm text-gray-950">{reportLabels[report.category]}</strong>
        <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">{report.status}</span>
      </span>
      <span className="mt-2 block text-sm text-gray-600">
        {report.targetType} · {report.targetId.slice(0, 8)}…
      </span>
      {report.details && <span className="mt-2 line-clamp-2 block text-sm leading-5 text-gray-700">{report.details}</span>}
      <time className="mt-3 block text-xs text-gray-500" dateTime={report.createdAt}>
        {new Date(report.createdAt).toLocaleString("pt-BR")}
      </time>
    </button>
  );
}

export function AdminModerationPage({
  role,
  onBack,
}: {
  role: AppRole;
  onBack: () => void;
}) {
  const [status, setStatus] = useState<ReportStatus | "all">("open");
  const [selected, setSelected] = useState<Report | null>(null);
  const [actionType, setActionType] = useState<ModerationActionType>("warn");
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const queue = useModerationQueue(status);
  const contextQuery = useModerationReportContext(selected?.id ?? null);
  const permitted = moderatorRoles.includes(role);

  const selectReport = (report: Report) => {
    setSelected(report);
    setActionType(report.targetType === "profile" ? "warn" : "hide_content");
    setReason("");
    setExpiresAt("");
    setActionError(null);
  };

  const apply = async () => {
    if (!selected) return;
    setIsApplying(true);
    setActionError(null);
    try {
      await queue.applyAction({
        reportId: selected.id,
        actionType,
        reason,
        expiresAt:
          (actionType === "restrict" || actionType === "suspend") && expiresAt
            ? new Date(expiresAt).toISOString()
            : null,
      });
      setSelected(null);
      setReason("");
      setExpiresAt("");
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Não foi possível aplicar a ação.");
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="page min-h-dvh bg-gray-50">
      <header className="sticky top-0 z-20 border-b border-gray-100 bg-white px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="flex min-h-11 items-center gap-2">
          <button
            type="button"
            aria-label="Voltar"
            onClick={onBack}
            className="grid size-11 place-items-center rounded-full outline-none active:bg-gray-100 focus-visible:ring-2 focus-visible:ring-violet-600"
          >
            <ChevronLeft aria-hidden size={22} />
          </button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-950">Moderação</h1>
            <p className="text-xs text-gray-500">Ações auditadas e autorizadas no servidor</p>
          </div>
        </div>
      </header>

      {!permitted ? (
        <main className="grid min-h-[70dvh] place-items-center px-8 text-center">
          <div>
            <ShieldCheck aria-hidden className="mx-auto text-gray-400" size={36} />
            <h2 className="mt-4 text-lg font-semibold text-gray-950">Acesso não autorizado</h2>
            <p className="mt-1 text-sm leading-5 text-gray-500">
              A função desta conta não permite acessar a fila de moderação.
            </p>
          </div>
        </main>
      ) : (
        <main className="space-y-4 px-4 py-5 pb-[max(32px,env(safe-area-inset-bottom))]">
          <label className="block text-sm font-medium text-gray-700">
            Estado da denúncia
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as ReportStatus | "all")}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-base outline-none focus:ring-2 focus:ring-violet-600"
            >
              {statusOptions.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
            </select>
          </label>

          {queue.error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4" role="alert">
              <p className="text-sm text-red-800">{queue.error}</p>
              <Button color="secondary-destructive" size="sm" className="mt-3" onPress={() => void queue.reload()}>
                Tentar novamente
              </Button>
            </div>
          )}

          {queue.status === "loading" && <div className="h-52 animate-pulse rounded-3xl bg-gray-100" aria-label="Carregando fila" />}
          {queue.status === "ready" && queue.items.length === 0 && (
            <div className="rounded-3xl border border-gray-200 bg-white px-6 py-10 text-center">
              <ShieldCheck aria-hidden className="mx-auto text-emerald-600" size={32} />
              <h2 className="mt-3 font-semibold text-gray-950">Fila vazia</h2>
              <p className="mt-1 text-sm text-gray-500">Não há denúncias reais neste estado.</p>
            </div>
          )}
          <div className="space-y-3">
            {queue.items.map((report) => <ReportCard report={report} onSelect={selectReport} key={report.id} />)}
          </div>
          {queue.nextCursor && (
            <Button color="secondary" size="md" className="w-full" isLoading={queue.isLoadingMore} onPress={() => void queue.loadMore()}>
              Carregar mais
            </Button>
          )}

          {selected && (
            <section className="rounded-3xl border border-violet-200 bg-white p-4 shadow-lg" aria-label="Aplicar ação de moderação">
              <h2 className="font-semibold text-gray-950">Decisão sobre a denúncia</h2>
              <p className="mt-1 text-sm text-gray-500">
                O contexto abaixo é limitado ao item denunciado e sua leitura é auditada.
              </p>
              {selected.details && (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                  <strong className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                    Relato enviado
                  </strong>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-amber-950">
                    {selected.details}
                  </p>
                </div>
              )}
              {contextQuery.status === "loading" && (
                <div className="mt-4 h-24 animate-pulse rounded-2xl bg-gray-100" aria-label="Carregando contexto da denúncia" />
              )}
              {contextQuery.error && (
                <div className="mt-4 rounded-2xl bg-red-50 p-3" role="alert">
                  <p className="text-sm text-red-800">{contextQuery.error}</p>
                  <Button color="secondary-destructive" size="sm" className="mt-2" onPress={() => void contextQuery.reload()}>
                    Tentar novamente
                  </Button>
                </div>
              )}
              {contextQuery.context && (
                <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
                    <span>{contextQuery.context.contentKind ?? contextQuery.context.targetType}</span>
                    {contextQuery.context.contentCreatedAt && (
                      <time dateTime={contextQuery.context.contentCreatedAt}>
                        {new Date(contextQuery.context.contentCreatedAt).toLocaleString("pt-BR")}
                      </time>
                    )}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-5 text-gray-800">
                    {contextQuery.context.contentText?.trim() || "O item não possui texto visível."}
                  </p>
                  {contextQuery.context.attachmentIds.length > 0 && (
                    <ReportAttachments
                      key={contextQuery.context.reportId}
                      reportId={contextQuery.context.reportId}
                      attachmentIds={contextQuery.context.attachmentIds}
                    />
                  )}
                </div>
              )}
              <label className="mt-4 block text-sm font-medium text-gray-700">
                Ação
                <select
                  value={actionType}
                  onChange={(event) => {
                    const nextAction = event.target.value as ModerationActionType;
                    setActionType(nextAction);
                    if (nextAction !== "restrict" && nextAction !== "suspend") setExpiresAt("");
                  }}
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-base outline-none focus:ring-2 focus:ring-violet-600"
                >
                  {actionsForReport(selected).map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
                </select>
              </label>
              {(actionType === "restrict" || actionType === "suspend") && (
                <Input
                  label="Término da restrição (opcional)"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={setExpiresAt}
                  className="mt-4"
                />
              )}
              <TextArea
                label="Motivo obrigatório"
                placeholder="Descreva a evidência e a justificativa da decisão"
                value={reason}
                onChange={setReason}
                rows={4}
                className="mt-4"
                isRequired
              />
              {actionError && <p className="mt-3 text-sm text-red-700" role="alert">{actionError}</p>}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button color="secondary" size="md" onPress={() => setSelected(null)}>Cancelar</Button>
                <Button
                  color="primary"
                  size="md"
                  isDisabled={contextQuery.status !== "ready"}
                  isLoading={isApplying}
                  onPress={() => void apply()}
                >
                  Confirmar ação
                </Button>
              </div>
            </section>
          )}
        </main>
      )}
    </div>
  );
}
