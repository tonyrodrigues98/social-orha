import { useEffect, useMemo, useRef, useState } from "react";
import { useDrag } from "@use-gesture/react";
import {
  Archive,
  BellOff,
  ChevronLeft,
  ChevronRight,
  Crown,
  Files,
  LogOut,
  Search,
  ShieldCheck,
  ShieldMinus,
  ShieldPlus,
  Star,
  Trash2,
  UserMinus,
  UserPlus,
  UserRound,
  X,
} from "lucide-react";
import { Button, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { Avatar } from "@/components/base/avatar/avatar";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import {
  ChatComposer,
  ChatForwardDialog,
  ChatHeader,
  ChatMessages,
  ChatProvider,
  ChatSearch,
  type ChatMessageData,
  type ChatUser,
  type SearchResult,
} from "@/components/ui/chat";
import {
  createClientMessageId,
  flattenMessagePages,
  type ConversationParticipant,
  type Message,
  useConversationQuery,
  useConversationRealtime,
  useConversationsQuery,
  useDeleteMessageMutation,
  useClearConversationMutation,
  useFavoriteConversationMutation,
  useForwardMessageMutation,
  useGroupLifecycleMutation,
  useMessagesQuery,
  useMessagingServices,
  usePreferencesMutation,
  usePreferencesQuery,
  useReactionMutation,
  useReceiptMutation,
  useSendMessageMutation,
  useUpdateGroupMemberMutation,
} from "@/domains/messaging";
import { useProfiles } from "@/domains/social";
import { BrowserAudioRecorder } from "@/infrastructure/media/browser-audio-recorder";
import { loadLocalImageDimensions } from "@/infrastructure/media/profile-image-validation";
import { useAuth } from "../auth/auth-context";
import { useAppUi } from "../ui-state-context";

type PrivateChatPageProps = { conversationId: string; onBack: () => void };
type RecordingPhase = "idle" | "starting" | "recording" | "stopping";
type GroupAction = "invite" | "remove" | "promote" | "demote";

const ALLOWED_MIME_KIND = new Map<string, "image" | "audio">([
  ["image/jpeg", "image"], ["image/png", "image"], ["image/webp", "image"], ["image/avif", "image"],
  ["audio/webm", "audio"], ["audio/mp4", "audio"], ["audio/mpeg", "audio"], ["audio/ogg", "audio"], ["audio/wav", "audio"],
]);

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function normalizedMime(value: string) {
  return value.toLocaleLowerCase("en-US").split(";", 1)[0]?.trim() ?? "";
}

async function inspectAudio(blob: Blob) {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData((await blob.arrayBuffer()).slice(0));
    const samples = buffer.getChannelData(0);
    const bars = 64;
    const blockSize = Math.max(1, Math.floor(samples.length / bars));
    const waveform = Array.from({ length: bars }, (_, index) => {
      let peak = 0;
      for (let sample = index * blockSize; sample < Math.min(samples.length, (index + 1) * blockSize); sample += 1) {
        peak = Math.max(peak, Math.abs(samples[sample] ?? 0));
      }
      return Math.min(1, Math.max(0.025, peak));
    });
    return { durationSeconds: buffer.duration, waveform };
  } finally {
    await context.close();
  }
}

async function createWaveform(blob: Blob) {
  return (await inspectAudio(blob)).waveform;
}

function ContactDetails({
  name,
  initials,
  kind,
  participants,
  currentUserId,
  viewerRole,
  onBack,
  onAnnounce,
  onMute,
  onArchive,
  onGroupAction,
  onTransferOwnership,
  onLeaveGroup,
  onCloseGroup,
  groupActionPending,
  inviteSearch,
  onInviteSearchChange,
  inviteCandidates,
  backButtonRef,
}: {
  name: string;
  initials: string;
  kind: "direct" | "group";
  participants: ConversationParticipant[];
  currentUserId: string;
  viewerRole: "owner" | "admin" | "member";
  onBack: () => void;
  onAnnounce: (message: string) => void;
  onMute: () => void;
  onArchive: () => void;
  onGroupAction: (memberId: string, action: GroupAction) => void;
  onTransferOwnership: (memberId: string) => void;
  onLeaveGroup: () => void;
  onCloseGroup: () => void;
  groupActionPending: boolean;
  inviteSearch: string;
  onInviteSearchChange: (value: string) => void;
  inviteCandidates: Array<{ id: string; fullName: string; username: string }>;
  backButtonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const canManage = kind === "group" && (viewerRole === "owner" || viewerRole === "admin");
  return (
    <section className="contact-details-page" aria-labelledby="contact-details-title">
      <header className="contact-details-header">
        <button ref={backButtonRef} type="button" onClick={onBack} aria-label="Voltar para a conversa" className="flex size-11 items-center justify-center"><ChevronLeft size={22} aria-hidden="true" /></button>
        <h1 id="contact-details-title">{kind === "group" ? "Dados do grupo" : "Dados do contato"}</h1><span aria-hidden="true" />
      </header>
      <main className="contact-details-content">
        <div className="contact-details-identity"><Avatar size="xl" initials={initials} contentClassName="avatar-transparent contact-details-avatar" /><h2>{name}</h2><p>{kind === "group" ? "Espaço compartilhado da comunidade" : "Contato da sua rede no ORHA"}</p></div>
        <div className="contact-details-actions">
          <button type="button" onClick={() => onAnnounce("Abrindo o perfil do contato.")}><UserRound size={20} /><span>Perfil</span></button>
          <button type="button" onClick={() => onAnnounce("Abrindo mídias compartilhadas.")}><Files size={20} /><span>Mídias</span></button>
          <button type="button" onClick={onMute}><BellOff size={20} /><span>Silenciar</span></button>
        </div>
        <section className="contact-details-card" aria-label="Informações da conversa">
          <button type="button" onClick={() => onAnnounce("Abrindo mídias compartilhadas.")}><Files size={19} /><span><strong>Mídias compartilhadas</strong><small>Áudios, imagens e links</small></span><ChevronRight size={18} /></button>
          <button type="button" onClick={() => onAnnounce("Abrindo privacidade e segurança.")}><ShieldCheck size={19} /><span><strong>Privacidade e segurança</strong><small>Bloqueios e permissões da conversa</small></span><ChevronRight size={18} /></button>
        </section>

        {kind === "group" ? (
          <section className="rounded-3xl bg-white p-4" aria-labelledby="group-members-title">
            <h3 id="group-members-title" className="mb-3 text-[16px] font-bold">Participantes</h3>
            <div className="grid gap-2">
              {participants.filter((participant) => participant.status === "active" || participant.status === "invited").map((participant) => {
                const manageable = canManage && participant.userId !== currentUserId && participant.role !== "owner";
                return <article key={participant.userId} className="flex min-h-14 items-center gap-3 rounded-2xl border border-[var(--orha-hairline)] px-3"><Avatar size="sm" src={participant.avatarUrl ?? undefined} initials={participant.displayName.slice(0, 2).toLocaleUpperCase("pt-BR")} contentClassName="avatar-transparent" /><span className="min-w-0 flex-1"><strong className="block truncate text-[14px]">{participant.displayName}</strong><small className="text-[12px] text-[var(--orha-subtle)]">{participant.status === "invited" ? "Convite pendente" : participant.role === "owner" ? "Responsável" : participant.role === "admin" ? "Administrador" : "Membro"}</small></span>{manageable ? <span className="flex gap-1">{viewerRole === "owner" && participant.status === "active" ? <button type="button" disabled={groupActionPending} onClick={() => onTransferOwnership(participant.userId)} className="flex size-11 items-center justify-center rounded-full bg-[#f3f3f5]" aria-label={`Transferir responsabilidade para ${participant.displayName}`}><Crown size={17} /></button> : null}{viewerRole === "owner" && (participant.role === "admin" ? <button type="button" disabled={groupActionPending} onClick={() => onGroupAction(participant.userId, "demote")} className="flex size-11 items-center justify-center rounded-full bg-[#f3f3f5]" aria-label={`Remover ${participant.displayName} da administração`}><ShieldMinus size={17} /></button> : <button type="button" disabled={groupActionPending} onClick={() => onGroupAction(participant.userId, "promote")} className="flex size-11 items-center justify-center rounded-full bg-[#f3f3f5]" aria-label={`Tornar ${participant.displayName} administrador`}><ShieldPlus size={17} /></button>)}<button type="button" disabled={groupActionPending} onClick={() => onGroupAction(participant.userId, "remove")} className="flex size-11 items-center justify-center rounded-full bg-[#fff0f0] text-red-700" aria-label={`Remover ${participant.displayName} do grupo`}><UserMinus size={17} /></button></span> : null}</article>;
              })}
            </div>
            {canManage ? <div className="mt-4"><label className="block text-[13px] font-semibold">Adicionar pessoa<input value={inviteSearch} onChange={(event) => onInviteSearchChange(event.target.value)} placeholder="Nome ou @username" className="mt-1 min-h-11 w-full rounded-2xl border border-[var(--orha-hairline)] px-4 text-[16px] outline-none focus:ring-2 focus:ring-[#6760d8]" /></label>{inviteSearch.trim().length >= 2 ? <div className="mt-2 grid gap-1">{inviteCandidates.slice(0, 5).map((candidate) => <button key={candidate.id} type="button" disabled={groupActionPending} onClick={() => onGroupAction(candidate.id, "invite")} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-left hover:bg-[#f3f3f5]"><UserPlus size={17} /><span className="flex-1"><strong className="block text-[13px]">{candidate.fullName}</strong><small>@{candidate.username}</small></span><span className="text-[12px] font-semibold">Convidar</span></button>)}</div> : null}</div> : null}
          </section>
        ) : null}

        {kind === "group" ? <section className="contact-details-card" aria-label="Ciclo do grupo">
          {viewerRole !== "owner" ? <button type="button" disabled={groupActionPending} onClick={onLeaveGroup}><LogOut size={19} /><span><strong>Sair do grupo</strong><small>Você deixará de receber novas mensagens</small></span><ChevronRight size={18} /></button> : null}
          {viewerRole === "owner" ? <button type="button" disabled={groupActionPending} onClick={onCloseGroup} className="text-red-700"><Trash2 size={19} /><span><strong>Encerrar grupo</strong><small>Finaliza o grupo para todos os participantes</small></span><ChevronRight size={18} /></button> : null}
        </section> : null}

        <section className="contact-details-card contact-details-muted" aria-label="Ações da conversa"><button type="button" onClick={onArchive}><Archive size={19} /><span><strong>Arquivar conversa</strong><small>Você poderá encontrá-la depois</small></span><ChevronRight size={18} /></button></section>
      </main>
    </section>
  );
}

function PrivateChatState({ label, onBack, onRetry }: { label: string; onBack: () => void; onRetry?: () => void }) {
  return <section className="private-chat-page" aria-live="polite" style={{ background: "#fff" }}><header className="contact-details-header"><button type="button" onClick={onBack} aria-label="Voltar para conversas" className="flex size-11 items-center justify-center"><ChevronLeft size={22} aria-hidden="true" /></button><h1>Conversa</h1><span aria-hidden="true" /></header><div role={onRetry ? "alert" : "status"} className="grid min-h-[60vh] place-items-center gap-3 p-6 text-center"><p>{label}</p>{onRetry ? <button type="button" className="prototype-panel-button secondary" onClick={onRetry}>Tentar novamente</button> : null}</div></section>;
}

export function PrivateChatPage({ conversationId, onBack }: PrivateChatPageProps) {
  const { identity, user } = useAuth();
  const { announce, navigate } = useAppUi();
  const { repository } = useMessagingServices();
  const userId = user?.id ?? "";
  const conversationQuery = useConversationQuery(conversationId, userId);
  const conversationsQuery = useConversationsQuery(userId);
  const messagesQuery = useMessagesQuery(conversationId, userId);
  const preferencesQuery = usePreferencesQuery(conversationId, userId);
  const preferencesMutation = usePreferencesMutation(conversationId, userId);
  const favoriteConversationMutation = useFavoriteConversationMutation(conversationId, userId);
  const clearConversationMutation = useClearConversationMutation(conversationId, userId);
  const groupLifecycleMutation = useGroupLifecycleMutation();
  const sendMessageMutation = useSendMessageMutation();
  const reactionMutation = useReactionMutation();
  const receiptMutation = useReceiptMutation();
  const deleteMessageMutation = useDeleteMessageMutation();
  const forwardMessageMutation = useForwardMessageMutation();
  const updateGroupMemberMutation = useUpdateGroupMemberMutation();
  const realtime = useConversationRealtime(conversationId, userId);

  const conversation = conversationQuery.data ?? null;
  const domainMessages = useMemo(() => {
    const clearedBefore = preferencesQuery.data?.clearedBefore;
    if (!clearedBefore) return flattenMessagePages(messagesQuery.data?.pages);
    const watermark = Date.parse(clearedBefore);
    return flattenMessagePages(messagesQuery.data?.pages).filter((message) => Date.parse(message.createdAt) > watermark);
  }, [messagesQuery.data?.pages, preferencesQuery.data?.clearedBefore]);
  const allConversations = conversationsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const [dragOffset, setDragOffset] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState<ChatMessageData | null>(null);
  const [forwardError, setForwardError] = useState<string | null>(null);
  const [deleteMessageId, setDeleteMessageId] = useState<string | null>(null);
  const [clearConversationOpen, setClearConversationOpen] = useState(false);
  const [recordingPhase, setRecordingPhase] = useState<RecordingPhase>("idle");
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const [replyToMessageId, setReplyToMessageId] = useState<string | null>(null);
  const [chatThemeRoot, setChatThemeRoot] = useState<HTMLDivElement | null>(null);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [inviteSearch, setInviteSearch] = useState("");
  const [documentVisibility, setDocumentVisibility] = useState<DocumentVisibilityState>(() => document.visibilityState);
  const profilesQuery = useProfiles(inviteSearch);
  const recorderRef = useRef<BrowserAudioRecorder | null>(null);
  const recordingStartedAt = useRef(0);
  const markedReceiptsRef = useRef(new Set<string>());
  const forwardClientIdsRef = useRef(new Map<string, string>());
  const chatBackButtonRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const detailsBackButtonRef = useRef<HTMLButtonElement>(null);
  const restoreMenuFocusRef = useRef(false);
  const swipeEligibleRef = useRef(false);

  useEffect(() => {
    if (!conversation) return;
    const frame = window.requestAnimationFrame(() => chatBackButtonRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [conversation]);
  useEffect(() => () => recorderRef.current?.cancel(), []);
  useEffect(() => {
    if (recordingPhase !== "recording") return;
    const timer = window.setInterval(() => setRecordedSeconds((Date.now() - recordingStartedAt.current) / 1000), 250);
    return () => window.clearInterval(timer);
  }, [recordingPhase]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (showDetails) detailsBackButtonRef.current?.focus({ preventScroll: true });
      else if (restoreMenuFocusRef.current) { restoreMenuFocusRef.current = false; menuButtonRef.current?.focus({ preventScroll: true }); }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showDetails]);

  useEffect(() => {
    const handleVisibility = () => setDocumentVisibility(document.visibilityState);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);
  useEffect(() => {
    if (!userId) return;
    const kind = documentVisibility === "visible" && preferencesQuery.data?.readReceiptsEnabled !== false ? "read" : "delivered";
    for (const message of domainMessages) {
      if (message.senderId === userId || message.deletedAt) continue;
      const alreadyMarked = kind === "read"
        ? message.receipts.some((receipt) => receipt.userId === userId && receipt.kind === "read")
        : message.receipts.some((receipt) => receipt.userId === userId);
      const key = `${message.id}:${kind}`;
      if (alreadyMarked || markedReceiptsRef.current.has(key)) continue;
      markedReceiptsRef.current.add(key);
      receiptMutation.mutate({ conversationId, messageId: message.id, userId, kind }, { onError: () => markedReceiptsRef.current.delete(key) });
    }
  }, [conversationId, documentVisibility, domainMessages, preferencesQuery.data?.readReceiptsEnabled, receiptMutation, userId]);

  const bindBackSwipe = useDrag(({ event, first, last, movement: [movementX], velocity: [velocityX], direction: [directionX], initial: [initialX] }) => {
    if (first) {
      const target = event.target;
      const startedOnControl = target instanceof Element && Boolean(target.closest("button, a, input, textarea, select, [role='menuitem'], [role='menu'], [role='dialog']"));
      swipeEligibleRef.current = initialX <= 28 && !startedOnControl;
    }
    if (!swipeEligibleRef.current) { if (last) swipeEligibleRef.current = false; return; }
    const offset = Math.min(Math.max(movementX, 0), 140);
    if (!last) { setDragOffset(offset); return; }
    swipeEligibleRef.current = false; setDragOffset(0);
    if (offset > 88 || (velocityX > 0.45 && directionX > 0)) onBack();
  }, { axis: "x", threshold: 8, pointer: { capture: false } });

  const currentUser = useMemo<ChatUser>(() => ({ id: userId, name: identity?.profile.full_name || "Você", status: "online" }), [identity?.profile.full_name, userId]);
  const messages = useMemo<ChatMessageData[]>(() => domainMessages.map((message) => mapChatMessage(message, conversation?.participants ?? [])), [conversation?.participants, domainMessages]);
  const typingUsers = useMemo(() => realtime.typingUserIds.map((id) => conversation?.participants.find((participant) => participant.userId === id)).filter((participant): participant is ConversationParticipant => Boolean(participant)).map((participant) => ({ id: participant.userId, name: participant.displayName, avatar: participant.avatarUrl ?? undefined })), [conversation?.participants, realtime.typingUserIds]);
  const remoteParticipantIds = new Set((conversation?.participants ?? []).filter((participant) => participant.userId !== userId).map((participant) => participant.userId));
  const remoteOnlineCount = realtime.presentUserIds.filter((id) => remoteParticipantIds.has(id)).length;
  const subtitle = conversation?.kind === "group" ? `${remoteOnlineCount} online` : remoteOnlineCount ? "Disponível agora" : "Offline";
  const inviteCandidates = profilesQuery.items.filter((profile) => profile.id !== userId && !(conversation?.participants.some((participant) => participant.userId === profile.id) ?? false));

  if (!userId) return <PrivateChatState label="Sua sessão não está disponível." onBack={onBack} />;
  if (conversationQuery.isPending) return <PrivateChatState label="Carregando conversa…" onBack={onBack} />;
  if (conversationQuery.isError) return <PrivateChatState label="Não foi possível carregar esta conversa." onBack={onBack} onRetry={() => void conversationQuery.refetch()} />;
  if (!conversation) return <PrivateChatState label="Esta conversa não existe ou você não tem acesso a ela." onBack={onBack} />;

  const initials = conversation.title.slice(0, 2).toLocaleUpperCase("pt-BR");

  async function beginVoiceRecord() {
    if (recorderRef.current || recordingPhase !== "idle") return;
    const recorder = new BrowserAudioRecorder(); recorderRef.current = recorder; setRecordingPhase("starting");
    try { await recorder.start(); if (recorderRef.current !== recorder) return; recordingStartedAt.current = Date.now(); setRecordedSeconds(0); setRecordingPhase("recording"); }
    catch (error) { const current = recorderRef.current === recorder; if (current) { recorderRef.current = null; setRecordingPhase("idle"); } if (current && !isAbortError(error)) announce(error instanceof Error ? error.message : "Não foi possível acessar o microfone."); }
  }
  function cancelVoiceRecord() { if (recordingPhase === "stopping") return; recorderRef.current?.cancel(); recorderRef.current = null; setRecordingPhase("idle"); setRecordedSeconds(0); }
  async function sendVoiceRecord() {
    const recorder = recorderRef.current; if (!recorder || recordingPhase !== "recording") return; setRecordingPhase("stopping");
    try {
      const blob = await recorder.stop(); const durationSeconds = Math.max(0.1, (Date.now() - recordingStartedAt.current) / 1000); const waveform = await createWaveform(blob).catch(() => undefined); const mimeType = normalizedMime(blob.type) || "audio/webm";
      await sendMessageMutation.mutateAsync({ conversationId, senderId: userId, senderName: currentUser.name, clientMessageId: createClientMessageId(), kind: "audio", replyToMessageId, media: [{ kind: "audio", blob, fileName: `audio-${Date.now()}.${mimeType === "audio/mp4" ? "m4a" : mimeType === "audio/ogg" ? "ogg" : mimeType === "audio/wav" ? "wav" : "webm"}`, mimeType, durationSeconds, waveform }] });
      setReplyToMessageId(null); announce("Áudio enviado nesta conversa.");
    } catch (error) { if (!isAbortError(error)) announce(error instanceof Error ? error.message : "Não foi possível enviar o áudio."); }
    finally { if (recorderRef.current === recorder) recorderRef.current = null; setRecordingPhase("idle"); setRecordedSeconds(0); }
  }

  async function submitComposer({ text, files }: { text: string; files: File[] }) {
    if (files.length > 1) { announce("Envie somente uma imagem ou um áudio por mensagem."); return; }
    try {
      const media = await Promise.all(files.map(async (file) => {
        const mimeType = normalizedMime(file.type);
        const kind = ALLOWED_MIME_KIND.get(mimeType);
        if (!kind) throw new Error("Formato de mídia não permitido.");
        if (kind === "image") {
          const dimensions = await loadLocalImageDimensions(file);
          return {
            kind,
            blob: file,
            fileName: file.name,
            mimeType,
            width: dimensions.width,
            height: dimensions.height,
          };
        }
        const inspection = await inspectAudio(file);
        return {
          kind,
          blob: file,
          fileName: file.name,
          mimeType,
          durationSeconds: inspection.durationSeconds,
          waveform: inspection.waveform,
        };
      }));
      const kind = media.length === 0 ? "text" : media[0]!.kind;
      sendMessageMutation.mutate({ conversationId, senderId: userId, senderName: currentUser.name, clientMessageId: createClientMessageId(), kind, body: text || null, replyToMessageId, media }, { onError: () => announce("Não foi possível enviar a mensagem.") });
      setReplyToMessageId(null);
    } catch {
      announce("Não foi possível ler a mídia selecionada. Escolha outro arquivo.");
    }
  }

  const muteConversation = () => { setChatMenuOpen(false); const notificationsEnabled = preferencesQuery.data?.notificationsEnabled === false; preferencesMutation.mutate({ notificationsEnabled, mutedUntil: null }, { onSuccess: () => announce(notificationsEnabled ? "Notificações ativadas." : "Notificações silenciadas."), onError: () => announce("Não foi possível atualizar as notificações.") }); };
  const archiveConversation = () => { setChatMenuOpen(false); preferencesMutation.mutate({ archivedAt: new Date().toISOString() }, { onSuccess: () => announce("Conversa arquivada."), onError: () => announce("Não foi possível arquivar a conversa.") }); };
  const favoriteConversation = () => {
    setChatMenuOpen(false);
    const favorited = !preferencesQuery.data?.favoritedAt;
    favoriteConversationMutation.mutate(favorited, {
      onSuccess: () => announce(favorited ? "Conversa adicionada aos favoritos." : "Conversa removida dos favoritos."),
      onError: () => announce("Não foi possível atualizar os favoritos."),
    });
  };
  const groupAction = (memberId: string, action: GroupAction) => updateGroupMemberMutation.mutate({ userId, conversationId, memberId, action }, { onSuccess: () => { setInviteSearch(""); announce(action === "invite" ? "Convite enviado." : "Participantes atualizados."); }, onError: () => announce("Não foi possível atualizar o grupo.") });
  const transferOwnership = (newOwnerId: string) => {
    if (!window.confirm("Transferir a responsabilidade deste grupo?")) return;
    groupLifecycleMutation.mutate({ action: "transfer", userId, conversationId, newOwnerId }, { onSuccess: () => announce("Responsabilidade transferida."), onError: () => announce("Não foi possível transferir a responsabilidade.") });
  };
  const leaveGroup = () => {
    if (!window.confirm("Sair deste grupo?")) return;
    groupLifecycleMutation.mutate({ action: "leave", userId, conversationId }, { onSuccess: () => { announce("Você saiu do grupo."); onBack(); }, onError: () => announce("Não foi possível sair do grupo.") });
  };
  const closeGroup = () => {
    if (!window.confirm("Encerrar este grupo para todos? Esta ação não pode ser desfeita.")) return;
    groupLifecycleMutation.mutate({ action: "close", userId, conversationId }, { onSuccess: () => { announce("Grupo encerrado."); onBack(); }, onError: () => announce("Não foi possível encerrar o grupo.") });
  };
  const overlayOpen = showSearch || Boolean(forwardingMessage) || Boolean(deleteMessageId) || clearConversationOpen;
  const gestureProps = showDetails || chatMenuOpen || overlayOpen ? {} : bindBackSwipe();

  async function locateSearchResult(result: SearchResult) {
    let attempts = 0;
    let loaded = domainMessages.some((message) => message.id === result.messageId);
    let hasMore = Boolean(messagesQuery.hasNextPage);
    while (!loaded && hasMore && attempts < 20) {
      attempts += 1;
      const next = await messagesQuery.fetchNextPage();
      loaded = flattenMessagePages(next.data?.pages).some((message) => message.id === result.messageId);
      hasMore = Boolean(next.hasNextPage);
    }
    window.requestAnimationFrame(() => {
      const escape = CSS.escape(result.messageId);
      const element = document.querySelector<HTMLElement>(`[data-message-id="${escape}"]`);
      if (!element) { announce("A mensagem está fora do histórico carregado."); return; }
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      element.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" }); element.focus({ preventScroll: true });
      element.animate([{ outline: "2px solid #6760d8" }, { outline: "2px solid transparent" }], { duration: reduced ? 1 : 1400 });
    });
  }

  return (
    <section {...gestureProps} className="private-chat-page" aria-label={showDetails ? `Dados de ${conversation.title}` : `Conversa com ${conversation.title}`} style={{ transform: `translateX(${showDetails ? 0 : dragOffset}px)`, transition: dragOffset ? "none" : "transform 180ms ease-out" }}>
      <ChatProvider currentUser={currentUser} theme="lunar" dateFormat="time-only" rootRef={setChatThemeRoot} onReactionAdd={(messageId, emoji) => reactionMutation.mutate({ conversationId, messageId, userId, emoji, active: true }, { onError: () => announce("Esta reação não está disponível.") })} onReactionRemove={(messageId, emoji) => reactionMutation.mutate({ conversationId, messageId, userId, emoji, active: false })} onReply={(message) => { setReplyToMessageId(message.id); announce(`Respondendo a “${message.text ?? "mensagem"}”.`); }} onDelete={setDeleteMessageId} onForward={(message) => { setForwardError(null); setForwardingMessage(message); }} onReport={(message) => navigate({ type: "report", targetType: "message", targetId: message.id })} className="orha-private-chat">
        {showDetails ? <ContactDetails name={conversation.title} initials={initials} kind={conversation.kind} participants={conversation.participants} currentUserId={userId} viewerRole={conversation.viewerRole} backButtonRef={detailsBackButtonRef} onBack={() => { restoreMenuFocusRef.current = true; setShowDetails(false); }} onAnnounce={announce} onMute={muteConversation} onArchive={archiveConversation} onGroupAction={groupAction} onTransferOwnership={transferOwnership} onLeaveGroup={leaveGroup} onCloseGroup={closeGroup} groupActionPending={updateGroupMemberMutation.isPending || groupLifecycleMutation.isPending} inviteSearch={inviteSearch} onInviteSearchChange={setInviteSearch} inviteCandidates={inviteCandidates} /> : <>
          <ChatHeader title={conversation.title} subtitle={subtitle} onBack={onBack} backLabel="Voltar para conversas" backButtonRef={chatBackButtonRef} avatar={<Avatar size="sm" src={conversation.avatarUrl ?? undefined} initials={initials} contentClassName="avatar-transparent private-chat-avatar" />} actions={<div className="private-chat-actions"><button type="button" onClick={() => setShowSearch(true)} className="flex size-11 items-center justify-center rounded-full" aria-label="Pesquisar mensagens"><Search size={20} /></button><Dropdown.Root isOpen={chatMenuOpen} onOpenChange={setChatMenuOpen}><Dropdown.DotsButton ref={menuButtonRef} className="private-chat-menu-trigger" aria-label="Mais opções da conversa" style={{ width: 44, height: 44 }} /><Dropdown.Popover className="private-chat-menu" UNSTABLE_portalContainer={chatThemeRoot ?? undefined}><Dropdown.Menu aria-label="Opções da conversa" selectionMode="none"><Dropdown.Item id="details" textValue={conversation.kind === "group" ? "Dados do grupo" : "Dados do contato"} icon={UserRound} onAction={() => { setChatMenuOpen(false); setShowDetails(true); }}>{conversation.kind === "group" ? "Dados do grupo" : "Dados do contato"}</Dropdown.Item><Dropdown.Item id="favorite" textValue={preferencesQuery.data?.favoritedAt ? "Remover dos favoritos" : "Favoritar conversa"} icon={Star} onAction={favoriteConversation}>{preferencesQuery.data?.favoritedAt ? "Remover dos favoritos" : "Favoritar conversa"}</Dropdown.Item><Dropdown.Item id="mute" textValue={preferencesQuery.data?.notificationsEnabled === false ? "Ativar notificações" : "Silenciar notificações"} icon={BellOff} onAction={muteConversation}>{preferencesQuery.data?.notificationsEnabled === false ? "Ativar notificações" : "Silenciar notificações"}</Dropdown.Item><Dropdown.Item id="archive" textValue="Arquivar conversa" icon={Archive} onAction={archiveConversation}>Arquivar conversa</Dropdown.Item><Dropdown.Item id="clear" textValue="Limpar conversa para mim" icon={Trash2} onAction={() => { setChatMenuOpen(false); setClearConversationOpen(true); }}>Limpar conversa para mim</Dropdown.Item></Dropdown.Menu></Dropdown.Popover></Dropdown.Root></div>} />
          {messagesQuery.isPending ? <div className="chat-messages grid flex-1 place-items-center" role="status">Carregando mensagens…</div> : messagesQuery.isError ? <div className="prototype-empty" role="alert"><p>Não foi possível carregar as mensagens.</p><button type="button" className="prototype-panel-button secondary" onClick={() => void messagesQuery.refetch()}>Tentar novamente</button></div> : messages.length === 0 ? <div className="chat-messages grid flex-1 place-items-center p-6 text-center"><p>Nenhuma mensagem ainda. Comece esta conversa quando quiser.</p></div> : <ChatMessages messages={messages} typingUsers={typingUsers} hasMore={Boolean(messagesQuery.hasNextPage)} onLoadMore={async () => { await messagesQuery.fetchNextPage(); }} />}
          <ChatComposer placeholder={replyToMessageId ? "Escreva sua resposta" : "Mensagem"} disabled={recordingPhase === "starting" || messagesQuery.isError || sendMessageMutation.isPending} onSubmit={submitComposer} onTyping={realtime.setTyping} onVoiceRecord={() => void beginVoiceRecord()} voiceRecording={recordingPhase === "recording" || recordingPhase === "stopping"} voiceActionPending={recordingPhase === "stopping"} voiceDurationLabel={formatDuration(recordedSeconds)} onVoiceCancel={cancelVoiceRecord} onVoiceSend={() => void sendVoiceRecord()} />
        </>}

        {forwardingMessage ? <ChatForwardDialog message={forwardingMessage} conversations={allConversations.filter((item) => item.viewerStatus === "active" && !item.preferences?.archivedAt).map((item) => ({ id: item.id, title: item.title, avatar: item.avatarUrl ?? undefined }))} pending={forwardMessageMutation.isPending} error={forwardError} onCancel={() => { if (!forwardMessageMutation.isPending) { forwardClientIdsRef.current.clear(); setForwardingMessage(null); } }} onForward={(targetConversationIds) => { const clientMessageIds = targetConversationIds.map((targetId) => { const key = `${forwardingMessage.id}:${targetId}`; const existing = forwardClientIdsRef.current.get(key); if (existing) return existing; const created = createClientMessageId(); forwardClientIdsRef.current.set(key, created); return created; }); forwardMessageMutation.mutate({ userId, sourceMessageId: forwardingMessage.id, targetConversationIds, clientMessageIds }, { onSuccess: () => { forwardClientIdsRef.current.clear(); setForwardingMessage(null); announce("Mensagem encaminhada."); }, onError: (error) => setForwardError(error instanceof Error ? error.message : "Não foi possível encaminhar.") }); }} /> : null}
        {showSearch ? <ChatSearch onClose={() => setShowSearch(false)} onSearch={async (query) => { const page = await repository.searchMessages({ userId, query, conversationId, limit: 30 }); return page.items.map(({ message, conversationTitle }) => ({ messageId: message.id, conversationId: message.conversationId, conversationName: conversationTitle, senderName: message.senderName, snippet: message.body || (message.kind === "audio" ? "Mensagem de áudio" : message.kind === "image" ? "Imagem" : "Arquivo"), timestamp: new Date(message.createdAt) })); }} onSelect={(result) => void locateSearchResult(result)} /> : null}
        <DeleteMessageDialog isOpen={Boolean(deleteMessageId)} pending={deleteMessageMutation.isPending} onCancel={() => setDeleteMessageId(null)} onConfirm={() => { if (!deleteMessageId) return; deleteMessageMutation.mutate({ conversationId, messageId: deleteMessageId, userId }, { onSuccess: () => { setDeleteMessageId(null); announce("Mensagem excluída."); }, onError: () => announce("Não foi possível excluir a mensagem.") }); }} />
        <ClearConversationDialog isOpen={clearConversationOpen} pending={clearConversationMutation.isPending} onCancel={() => setClearConversationOpen(false)} onConfirm={() => { clearConversationMutation.mutate(undefined, { onSuccess: () => { setReplyToMessageId(null); setClearConversationOpen(false); announce("Conversa limpa somente para você."); }, onError: () => announce("Não foi possível limpar a conversa.") }); }} />
      </ChatProvider>
    </section>
  );
}

function mapChatMessage(message: Message, participants: ConversationParticipant[]): ChatMessageData {
  const images = message.deletedAt ? [] : message.media.filter((item) => item.kind === "image" && item.signedUrl).map((item) => ({ url: item.signedUrl!, width: item.width ?? 1200, height: item.height ?? 1200, alt: item.fileName }));
  const audio = message.deletedAt ? undefined : message.media.find((item) => item.kind === "audio" && item.signedUrl);
  const files = message.deletedAt ? [] : message.media.filter((item) => item.kind === "file" && item.signedUrl).map((item) => ({ name: item.fileName, size: item.sizeBytes, type: item.mimeType, url: item.signedUrl! }));
  return { id: message.id, senderId: message.senderId, senderName: message.senderName, senderAvatar: message.senderAvatarUrl ?? undefined, text: message.body ?? undefined, images: images.length ? images : undefined, files: files.length ? files : undefined, voice: audio ? { url: audio.signedUrl!, duration: audio.durationSeconds ?? 0, waveform: audio.waveform ?? undefined } : undefined, timestamp: new Date(message.createdAt), status: message.deliveryState, deletedAt: message.deletedAt ? new Date(message.deletedAt) : undefined, isForwarded: Boolean(message.forwardedFromMessageId), isSystem: message.kind === "system", systemEvent: message.kind === "system" ? message.body ?? "Atualização da conversa" : undefined, replyTo: message.replyTo ? { id: message.replyTo.id, senderName: message.replyTo.senderName, text: message.replyTo.body || (message.replyTo.kind === "audio" ? "Mensagem de áudio" : message.replyTo.kind === "image" ? "Imagem" : "Arquivo") } : undefined, reactions: message.reactions, isEdited: Boolean(message.editedAt), readBy: message.receipts.filter((receipt) => receipt.kind === "read").map((receipt) => ({ userId: receipt.userId, name: participants.find((participant) => participant.userId === receipt.userId)?.displayName ?? "Pessoa ORHA" })) };
}

function DeleteMessageDialog({ isOpen, pending, onCancel, onConfirm }: { isOpen: boolean; pending: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <ModalOverlay isOpen={isOpen} isDismissable={!pending} onOpenChange={(open) => { if (!open && !pending) onCancel(); }} className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"><Modal className="w-full max-w-sm rounded-t-[28px] bg-white p-5 outline-none sm:rounded-[28px]"><Dialog role="alertdialog" className="outline-none">{({ close }) => <><header className="flex items-center justify-between"><Heading slot="title" className="text-[19px] font-bold">Excluir mensagem?</Heading><Button className="flex size-11 items-center justify-center rounded-full bg-[#f3f3f5]" isDisabled={pending} onPress={() => { close(); onCancel(); }} aria-label="Fechar"><X size={18} /></Button></header><p className="mt-2 text-[14px] text-[var(--orha-subtle)]">A mensagem será removida para todas as pessoas desta conversa.</p><div className="mt-5 grid grid-cols-2 gap-2"><button type="button" disabled={pending} onClick={onCancel} className="min-h-11 rounded-full border border-[var(--orha-hairline)] font-semibold">Cancelar</button><button type="button" disabled={pending} onClick={onConfirm} className="min-h-11 rounded-full bg-red-600 font-semibold text-white disabled:opacity-50">{pending ? "Excluindo…" : "Excluir"}</button></div></>}</Dialog></Modal></ModalOverlay>;
}

function ClearConversationDialog({ isOpen, pending, onCancel, onConfirm }: { isOpen: boolean; pending: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <ModalOverlay isOpen={isOpen} isDismissable={!pending} onOpenChange={(open) => { if (!open && !pending) onCancel(); }} className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"><Modal className="w-full max-w-sm rounded-t-[28px] bg-white p-5 outline-none sm:rounded-[28px]"><Dialog role="alertdialog" className="outline-none"><header className="flex items-center justify-between"><Heading slot="title" className="text-[19px] font-bold">Limpar esta conversa?</Heading><Button className="flex size-11 items-center justify-center rounded-full bg-[#f3f3f5]" isDisabled={pending} onPress={onCancel} aria-label="Fechar"><X size={18} /></Button></header><p className="mt-2 text-[14px] text-[var(--orha-subtle)]">As mensagens atuais deixarão de aparecer somente para você. A outra pessoa ou o grupo continuará com o histórico.</p><div className="mt-5 grid grid-cols-2 gap-2"><button type="button" disabled={pending} onClick={onCancel} className="min-h-11 rounded-full border border-[var(--orha-hairline)] font-semibold">Cancelar</button><button type="button" disabled={pending} onClick={onConfirm} className="min-h-11 rounded-full bg-red-600 font-semibold text-white disabled:opacity-50">{pending ? "Limpando…" : "Limpar para mim"}</button></div></Dialog></Modal></ModalOverlay>;
}
