import { useDeferredValue, useState } from "react";
import { MessageCirclePlus, Search, ShieldCheck, Star, UserRoundPlus, UsersRound, X } from "lucide-react";
import {
  Button,
  Dialog,
  Heading,
  Modal,
  ModalOverlay,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
} from "react-aria-components";
import { Avatar } from "@/components/base/avatar/avatar";
import {
  useConversationRequestMutation,
  useConversationRequestsQuery,
  useConversationsQuery,
  useCreateGroupMutation,
  useRespondConversationRequestMutation,
  useRespondGroupInvitationMutation,
  type ConversationRequest,
} from "@/domains/messaging";
import { useProfiles, type SocialProfile } from "@/domains/social";
import { useAuth } from "../auth/auth-context";
import { NativeHeader } from "../components/native-header";
import { useAppUi } from "../ui-state-context";

type SetupMode = "direct" | "group";

export function ConversationsPage() {
  const { user } = useAuth();
  const { announce, openConversation } = useAppUi();
  const userId = user?.id ?? "";
  const [filter, setFilter] = useState<"all" | "friend" | "group">("all");
  const [showRequests, setShowRequests] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const conversationsQuery = useConversationsQuery(
    userId,
    filter === "friend" ? "direct" : filter === "group" ? "group" : undefined,
  );
  const requestsQuery = useConversationRequestsQuery(userId);
  const respondRequest = useRespondConversationRequestMutation();
  const respondInvitation = useRespondGroupInvitationMutation();
  const conversations = (conversationsQuery.data?.pages.flatMap((page) => page.items) ?? [])
    .filter((conversation) => !conversation.preferences?.archivedAt)
    .sort((first, second) => {
      const firstFavorite = first.preferences?.favoritedAt ? 1 : 0;
      const secondFavorite = second.preferences?.favoritedAt ? 1 : 0;
      return secondFavorite - firstFavorite || Date.parse(second.updatedAt) - Date.parse(first.updatedAt);
    });
  const incomingRequests = (requestsQuery.data?.pages.flatMap((page) => page.items) ?? [])
    .filter((request) => request.recipient.userId === userId);
  const filters = [
    { id: "all", label: "Todas" },
    { id: "friend", label: "Amigos" },
    { id: "group", label: "Grupos" },
  ] as const;

  function respondToRequest(requestId: string, accept: boolean) {
    respondRequest.mutate({ userId, requestId, accept }, {
      onSuccess: (request) => {
        announce(accept ? "Solicitação aceita." : "Solicitação recusada.");
        if (accept && request.conversationId) {
          setShowRequests(false);
          openConversation(request.conversationId);
        }
      },
      onError: () => announce("Não foi possível responder à solicitação."),
    });
  }

  const renderConversations = () => {
    if (conversationsQuery.isPending) return <p className="prototype-empty" role="status">Carregando suas conversas…</p>;
    if (conversationsQuery.isError) {
      return (
        <div className="prototype-empty" role="alert">
          <p>Não foi possível carregar suas conversas.</p>
          <button type="button" className="prototype-panel-button secondary" onClick={() => void conversationsQuery.refetch()}>
            Tentar novamente
          </button>
        </div>
      );
    }
    if (!conversations.length) return <p className="prototype-empty">Você ainda não tem conversas nesta categoria.</p>;

    return (
      <>
        {conversations.map((conversation) => conversation.viewerStatus === "invited" ? (
          <article key={conversation.id} className="conversation-row" aria-label={`Convite para o grupo ${conversation.title}`}>
            <span className="conversation-avatar"><Avatar size="lg" initials={initials(conversation.title)} contentClassName="avatar-transparent" /></span>
            <span className="conversation-copy">
              <span className="conversation-top"><strong>{conversation.title}</strong><span>Convite</span></span>
              <span className="conversation-preview">Você foi convidado para participar deste grupo.</span>
              <span className="mt-2 flex gap-2">
                <button type="button" className="min-h-11 rounded-full bg-[#242426] px-4 text-[13px] font-semibold text-white" disabled={respondInvitation.isPending} onClick={() => respondInvitation.mutate({ userId, conversationId: conversation.id, accept: true }, { onSuccess: () => announce("Você entrou no grupo."), onError: () => announce("Não foi possível aceitar o convite.") })}>Aceitar</button>
                <button type="button" className="min-h-11 rounded-full border border-[var(--orha-hairline)] bg-white px-4 text-[13px] font-semibold" disabled={respondInvitation.isPending} onClick={() => respondInvitation.mutate({ userId, conversationId: conversation.id, accept: false }, { onSuccess: () => announce("Convite recusado."), onError: () => announce("Não foi possível recusar o convite.") })}>Recusar</button>
              </span>
            </span>
          </article>
        ) : (
          <button type="button" className="conversation-row" key={conversation.id} onClick={() => openConversation(conversation.id)}>
            <span className="conversation-avatar">
              <Avatar size="lg" src={conversation.avatarUrl ?? undefined} initials={initials(conversation.title)} contentClassName="avatar-transparent" />
            </span>
            <span className="conversation-copy">
              <span className="conversation-top">
                <strong className="flex items-center gap-1.5">{conversation.preferences?.favoritedAt ? <Star size={14} fill="currentColor" aria-label="Conversa favorita" /> : null}{conversation.title}</strong>
                <time dateTime={conversation.updatedAt}>{formatConversationTime(conversation.updatedAt)}</time>
              </span>
              <span className="conversation-preview">{conversationPreview(conversation.lastMessage)}</span>
            </span>
            {conversation.unreadCount ? <span className="unread-count" aria-label={`${conversation.unreadCount} mensagens não lidas`}>{conversation.unreadCount}</span> : null}
          </button>
        ))}
        {conversationsQuery.hasNextPage ? (
          <button type="button" className="prototype-panel-button secondary" disabled={conversationsQuery.isFetchingNextPage} onClick={() => void conversationsQuery.fetchNextPage()}>
            {conversationsQuery.isFetchingNextPage ? "Carregando…" : "Carregar conversas anteriores"}
          </button>
        ) : null}
      </>
    );
  };

  return (
    <div className="page">
      <NativeHeader title="Conversas" subtitle="Seu espaço privado" />
      <main className="page-content">
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button type="button" className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--orha-hairline)] bg-white px-3 text-[13px] font-semibold" onClick={() => setShowRequests(true)}>
            <UserRoundPlus size={17} aria-hidden="true" /> Solicitações {incomingRequests.length ? `(${incomingRequests.length})` : ""}
          </button>
          <button type="button" className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#242426] px-3 text-[13px] font-semibold text-white" onClick={() => setShowSetup(true)}>
            <MessageCirclePlus size={17} aria-hidden="true" /> Nova conversa
          </button>
        </div>

        <Tabs selectedKey={filter} onSelectionChange={(key) => setFilter(key as typeof filter)}>
          <TabList className="conversation-filter" aria-label="Filtrar conversas">
            {filters.map((item) => (
              <Tab id={item.id} key={item.id} className={({ isSelected }) => `inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border px-[13px] py-2 text-[11px] font-[620] outline-none focus-visible:ring-2 focus-visible:ring-[#6760d8] focus-visible:ring-offset-2 ${isSelected ? "border-[#242426] bg-[#242426] text-white" : "border-[var(--orha-hairline)] bg-white text-[var(--orha-subtle)]"}`}>
                {item.label}
              </Tab>
            ))}
          </TabList>
          <TabPanels className="contents">
            {filters.map((item) => <TabPanel id={item.id} key={item.id} className="conversation-list outline-none">{item.id === filter ? renderConversations() : null}</TabPanel>)}
          </TabPanels>
        </Tabs>

        <aside className="privacy-note"><ShieldCheck size={17} /><span><strong>Conversas sob seu controle</strong> · pedidos não liberam amizade automaticamente.</span></aside>
      </main>

      <RequestsDialog
        isOpen={showRequests}
        onOpenChange={setShowRequests}
        requests={incomingRequests}
        loading={requestsQuery.isPending}
        error={requestsQuery.isError}
        pending={respondRequest.isPending}
        onRespond={respondToRequest}
        onRetry={() => void requestsQuery.refetch()}
      />
      <ConversationSetupDialog isOpen={showSetup} onOpenChange={setShowSetup} userId={userId} onCreated={(conversationId) => { setShowSetup(false); openConversation(conversationId); }} />
    </div>
  );
}

function RequestsDialog({ isOpen, onOpenChange, requests, loading, error, pending, onRespond, onRetry }: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  requests: Pick<ConversationRequest, "id" | "requester" | "openingMessage">[];
  loading: boolean;
  error: boolean;
  pending: boolean;
  onRespond: (requestId: string, accept: boolean) => void;
  onRetry: () => void;
}) {
  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={onOpenChange} isDismissable className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <Modal className="max-h-[85dvh] w-full max-w-md overflow-auto rounded-t-[28px] bg-white p-5 outline-none sm:rounded-[28px]">
        <Dialog className="outline-none">
          {({ close }) => <>
            <header className="mb-4 flex items-center justify-between"><Heading slot="title" className="text-[20px] font-bold">Solicitações de conversa</Heading><Button className="flex size-11 items-center justify-center rounded-full bg-[#f3f3f5]" onPress={close} aria-label="Fechar"><X size={19} /></Button></header>
            {loading ? <p role="status">Carregando solicitações…</p> : error ? <div className="py-8 text-center" role="alert"><p className="text-[14px]">Não foi possível carregar as solicitações.</p><button type="button" className="mt-3 min-h-11 rounded-full border border-[var(--orha-hairline)] px-4 font-semibold" onClick={onRetry}>Tentar novamente</button></div> : requests.length === 0 ? <p className="py-8 text-center text-[14px] text-[var(--orha-subtle)]">Nenhuma solicitação pendente.</p> : (
              <div className="grid gap-3">{requests.map((request) => <article key={request.id} className="rounded-2xl border border-[var(--orha-hairline)] p-4"><strong className="block">{request.requester.displayName}</strong>{request.requester.username ? <span className="text-[13px] text-[var(--orha-subtle)]">@{request.requester.username}</span> : null}{request.openingMessage ? <p className="mt-2 text-[14px]">{request.openingMessage}</p> : null}<div className="mt-3 grid grid-cols-2 gap-2"><button type="button" disabled={pending} className="min-h-11 rounded-full bg-[#242426] px-4 text-[13px] font-semibold text-white disabled:opacity-50" onClick={() => onRespond(request.id, true)}>Aceitar</button><button type="button" disabled={pending} className="min-h-11 rounded-full border border-[var(--orha-hairline)] px-4 text-[13px] font-semibold disabled:opacity-50" onClick={() => onRespond(request.id, false)}>Recusar</button></div></article>)}</div>
            )}
          </>}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function ConversationSetupDialog({ isOpen, onOpenChange, userId, onCreated }: { isOpen: boolean; onOpenChange: (open: boolean) => void; userId: string; onCreated: (conversationId: string) => void }) {
  const { announce } = useAppUi();
  const [mode, setMode] = useState<SetupMode>("direct");
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [openingMessage, setOpeningMessage] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const deferredSearch = useDeferredValue(search);
  const profilesQuery = useProfiles(deferredSearch);
  const requestConversation = useConversationRequestMutation();
  const createGroup = useCreateGroupMutation();
  const profiles = profilesQuery.items.filter((profile) => profile.id !== userId);
  const pending = requestConversation.isPending || createGroup.isPending;

  function toggleProfile(profile: SocialProfile) {
    if (mode === "direct") setSelectedIds([profile.id]);
    else setSelectedIds((current) => current.includes(profile.id) ? current.filter((id) => id !== profile.id) : [...current, profile.id].slice(0, 49));
  }

  function submit() {
    if (mode === "direct") {
      const targetUserId = selectedIds[0];
      if (!targetUserId) return announce("Escolha uma pessoa.");
      requestConversation.mutate({ userId, targetUserId, openingMessage }, {
        onSuccess: (request) => {
          if (request.conversationId) onCreated(request.conversationId);
          else { announce("Solicitação de conversa enviada."); onOpenChange(false); }
        },
        onError: () => announce("Não foi possível iniciar esta conversa."),
      });
      return;
    }
    if (!title.trim() || !selectedIds.length) return announce("Informe o nome e escolha participantes.");
    createGroup.mutate({ userId, title, memberIds: selectedIds }, {
      onSuccess: (conversation) => onCreated(conversation.id),
      onError: () => announce("Não foi possível criar o grupo."),
    });
  }

  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={onOpenChange} isDismissable className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <Modal className="max-h-[90dvh] w-full max-w-md overflow-auto rounded-t-[28px] bg-white p-5 outline-none sm:rounded-[28px]">
        <Dialog className="outline-none">{({ close }) => <>
          <header className="mb-4 flex items-center justify-between"><Heading slot="title" className="text-[20px] font-bold">Nova conversa</Heading><Button className="flex size-11 items-center justify-center rounded-full bg-[#f3f3f5]" onPress={close} aria-label="Fechar"><X size={19} /></Button></header>
          <div className="mb-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de conversa">
            <button type="button" role="radio" aria-checked={mode === "direct"} className={`min-h-11 rounded-2xl px-3 text-[13px] font-semibold ${mode === "direct" ? "bg-[#242426] text-white" : "bg-[#f3f3f5]"}`} onClick={() => { setMode("direct"); setSelectedIds([]); }}><UserRoundPlus className="mr-2 inline" size={17} />Pessoa</button>
            <button type="button" role="radio" aria-checked={mode === "group"} className={`min-h-11 rounded-2xl px-3 text-[13px] font-semibold ${mode === "group" ? "bg-[#242426] text-white" : "bg-[#f3f3f5]"}`} onClick={() => { setMode("group"); setSelectedIds([]); }}><UsersRound className="mr-2 inline" size={17} />Grupo</button>
          </div>
          {mode === "group" ? <label className="mb-3 block text-[13px] font-semibold">Nome do grupo<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} className="mt-1 min-h-11 w-full rounded-2xl border border-[var(--orha-hairline)] px-4 text-[16px] outline-none focus:ring-2 focus:ring-[#6760d8]" /></label> : null}
          <label className="mb-3 block text-[13px] font-semibold">Pesquisar pessoas<span className="mt-1 flex min-h-11 items-center gap-2 rounded-2xl border border-[var(--orha-hairline)] px-3"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[16px] outline-none" placeholder="Nome ou @username" /></span></label>
          <div className="max-h-64 overflow-y-auto rounded-2xl border border-[var(--orha-hairline)]" aria-label="Pessoas disponíveis">
            {profilesQuery.status === "loading" ? <p className="p-4" role="status">Carregando pessoas…</p> : profilesQuery.status === "error" ? <div className="p-4" role="alert"><p className="text-[14px]">Não foi possível carregar pessoas.</p><button type="button" className="mt-2 min-h-11 rounded-full border border-[var(--orha-hairline)] px-4 font-semibold" onClick={() => void profilesQuery.reload()}>Tentar novamente</button></div> : profiles.length === 0 ? <p className="p-4 text-[14px] text-[var(--orha-subtle)]">Nenhuma pessoa encontrada.</p> : profiles.map((profile) => {
              const selected = selectedIds.includes(profile.id);
              return <button key={profile.id} type="button" aria-pressed={selected} className={`flex min-h-14 w-full items-center gap-3 border-b border-[var(--orha-hairline)] px-3 text-left last:border-0 ${selected ? "bg-[#eeecff]" : "bg-white"}`} onClick={() => toggleProfile(profile)}><Avatar size="sm" initials={initials(profile.fullName)} contentClassName="avatar-transparent" /><span className="min-w-0 flex-1"><strong className="block truncate text-[14px]">{profile.fullName}</strong><small className="text-[12px] text-[var(--orha-subtle)]">@{profile.username}</small></span><span aria-hidden="true" className={`size-5 rounded-full border ${selected ? "border-[#6760d8] bg-[#6760d8]" : "border-[#b7b7bd]"}`} /></button>;
            })}
          </div>
          {mode === "direct" ? <label className="mt-3 block text-[13px] font-semibold">Mensagem de apresentação (opcional)<textarea value={openingMessage} onChange={(event) => setOpeningMessage(event.target.value)} maxLength={1000} rows={3} className="mt-1 w-full resize-none rounded-2xl border border-[var(--orha-hairline)] p-3 text-[16px] outline-none focus:ring-2 focus:ring-[#6760d8]" /></label> : <p className="mt-3 text-[13px] text-[var(--orha-subtle)]">{selectedIds.length} participante(s) selecionado(s).</p>}
          <button type="button" disabled={pending} onClick={submit} className="mt-4 min-h-12 w-full rounded-full bg-[#242426] px-4 text-[14px] font-semibold text-white disabled:opacity-50">{pending ? "Aguarde…" : mode === "direct" ? "Continuar" : "Criar grupo"}</button>
        </>}</Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("pt-BR");
}

function conversationPreview(message: { kind: "text" | "image" | "audio" | "file" | "system"; body: string | null } | null) {
  if (!message) return "Conversa iniciada";
  if (message.kind === "audio") return "Mensagem de áudio";
  if (message.kind === "image") return message.body || "Imagem";
  if (message.kind === "file") return message.body || "Arquivo";
  if (message.kind === "system") return message.body || "Atualização da conversa";
  return message.body || "Mensagem";
}

function formatConversationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const sameDay = date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
  return new Intl.DateTimeFormat("pt-BR", sameDay ? { hour: "2-digit", minute: "2-digit", hour12: false } : { day: "2-digit", month: "2-digit" }).format(date);
}
