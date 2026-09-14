import { useMemo, useState } from "react";
import { ChevronLeft, Headphones, Plus } from "lucide-react";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { Drawer } from "@/components/godui/drawer";
import {
  SupportTickets,
  type ChatMessageData,
  type SupportTicket as ChatSupportTicket,
  type TicketPriority,
  type TicketStatus,
} from "@/components/ui/chat";
import type { AppRole, UserIdentity } from "@/domain/identity";
import {
  supportCategoryLabels,
  useSupportActions,
  useSupportMessages,
  useSupportRealtime,
  useSupportTickets,
  type SupportTicketCategory,
  type SupportTicketPriority,
  type SupportTicketStatus,
} from "@/domains/support";

const operatorRoles: readonly AppRole[] = ["super_admin", "admin", "support"];

function toChatStatus(status: SupportTicketStatus): TicketStatus {
  return status === "in_progress" ? "in-progress" : status;
}

function fromChatStatus(status: TicketStatus): SupportTicketStatus {
  return status === "in-progress" ? "in_progress" : status;
}

function toChatPriority(priority: SupportTicketPriority): TicketPriority {
  return priority === "normal" ? "medium" : priority;
}

function fromChatPriority(priority: TicketPriority): SupportTicketPriority {
  return priority === "medium" ? "normal" : priority;
}

function formatCompactDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function SupportPage({
  identity,
  onBack,
}: {
  identity: UserIdentity;
  onBack: () => void;
}) {
  const isOperator = operatorRoles.includes(identity.role);
  const [filter, setFilter] = useState<SupportTicketStatus | "all">("all");
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<SupportTicketCategory>("technical");
  const [message, setMessage] = useState("");
  const tickets = useSupportTickets(filter);
  const messages = useSupportMessages(activeTicketId);
  const actions = useSupportActions();
  useSupportRealtime();

  const activeTicket = tickets.items.find((ticket) => ticket.id === activeTicketId) ?? null;
  const chatTickets = useMemo<ChatSupportTicket[]>(() => tickets.items.map((ticket) => ({
    id: ticket.id,
    displayId: `#${ticket.id.slice(0, 8)}`,
    subject: ticket.subject,
    customerName: ticket.requesterName,
    status: toChatStatus(ticket.status),
    priority: toChatPriority(ticket.priority),
    category: supportCategoryLabels[ticket.category],
    createdAt: formatCompactDate(ticket.createdAt),
    updatedAt: ticket.updatedAt,
    lastMessage: undefined,
    assignee: ticket.assigneeName ?? ticket.assignedTo ?? undefined,
  })), [tickets.items]);

  const chatMessages = useMemo<ChatMessageData[]>(() => messages.items.map((item) => ({
    id: item.id,
    senderId: item.senderId,
    senderName: item.senderName,
    text: item.body,
    timestamp: new Date(item.createdAt),
    status: "sent",
  })), [messages.items]);

  const createTicket = async () => {
    const created = await actions.create({ subject, category, message });
    setSubject("");
    setCategory("technical");
    setMessage("");
    setCreateOpen(false);
    setFilter("all");
    setActiveTicketId(created.id);
  };

  const chatActiveId = activeTicket?.id;
  const selectChatTicket = (chatId: string) => {
    if (!chatId) {
      setActiveTicketId(null);
      return;
    }
    const rawId = tickets.items.find((ticket) => ticket.id === chatId)?.id ?? null;
    setActiveTicketId(rawId);
  };

  return (
    <div className="page flex h-dvh min-h-0 flex-col overflow-hidden bg-white">
      <header className="z-20 shrink-0 border-b border-gray-100 bg-white px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="flex min-h-11 items-center gap-2">
          <button
            type="button"
            aria-label="Voltar"
            onClick={onBack}
            className="grid size-11 shrink-0 place-items-center rounded-full outline-none active:bg-gray-100 focus-visible:ring-2 focus-visible:ring-violet-600"
          >
            <ChevronLeft aria-hidden size={22} />
          </button>
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-violet-50 text-violet-700">
            <Headphones aria-hidden size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold tracking-tight text-gray-950">
              {isOperator ? "Fila de suporte" : "Suporte ORHA"}
            </h1>
            <p className="truncate text-xs text-gray-500">
              {isOperator ? "Atendimento privado e auditado" : "Seus chamados ficam salvos na sua conta"}
            </p>
          </div>
          <Button
            color="primary"
            size="sm"
            iconLeading={Plus}
            onPress={() => {
              actions.reset();
              setCreateOpen(true);
            }}
          >
            Novo
          </Button>
        </div>
      </header>

      {(tickets.error || messages.error || actions.hasError) && (
        <div className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-3" role="alert">
          <p className="text-sm text-red-800">{tickets.error ?? messages.error ?? actions.error}</p>
        </div>
      )}

      <main className="min-h-0 flex-1">
        {tickets.status === "loading" ? (
          <div className="space-y-3 p-4" aria-label="Carregando chamados">
            {Array.from({ length: 4 }, (_, index) => (
              <div className="h-20 animate-pulse rounded-2xl bg-gray-100" key={index} />
            ))}
          </div>
        ) : (
          <SupportTickets
            currentUser={{
              id: identity.profile.id,
              name: identity.profile.full_name?.trim() || "Membro ORHA",
            }}
            title={isOperator ? "Fila de atendimento" : "Meus chamados"}
            tickets={chatTickets}
            activeTicketId={chatActiveId}
            onSelectTicket={selectChatTicket}
            messages={chatMessages}
            onSend={(text) => {
              if (!activeTicketId || actions.isPending) return;
              void actions.reply({ ticketId: activeTicketId, message: text });
            }}
            statusFilter={filter === "in_progress" ? "in-progress" : filter}
            onStatusFilterChange={(next) => setFilter(next === "in-progress" ? "in_progress" : next)}
            onClaimTicket={isOperator ? (id) => {
              const ticketId = tickets.items.find((ticket) => ticket.id === id)?.id;
              if (ticketId) void actions.claim(ticketId);
            } : undefined}
            onTicketStatusChange={isOperator && activeTicket ? (_id, status) => {
              void actions.update({
                ticketId: activeTicket.id,
                status: fromChatStatus(status),
                priority: activeTicket.priority,
              });
            } : undefined}
            onTicketPriorityChange={isOperator && activeTicket ? (_id, priority) => {
              void actions.update({
                ticketId: activeTicket.id,
                status: activeTicket.status,
                priority: fromChatPriority(priority),
              });
            } : undefined}
            isUpdatingTicket={actions.isPending}
            hasMoreTickets={tickets.hasMore}
            isLoadingMoreTickets={tickets.isLoadingMore}
            onLoadMoreTickets={() => void tickets.loadMore()}
            hasMoreMessages={messages.hasMore}
            onLoadMoreMessages={messages.loadMore}
          />
        )}
      </main>

      <Drawer
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Novo chamado"
        className="max-h-[88dvh]"
      >
        <form
          className="space-y-4 pb-[max(8px,env(safe-area-inset-bottom))]"
          onSubmit={(event) => {
            event.preventDefault();
            void createTicket();
          }}
        >
          <p className="text-sm leading-5 text-gray-600">
            A conversa é privada entre você e a equipe autorizada de suporte. Não informe senha nem códigos de acesso.
          </p>
          <Input
            label="Assunto"
            placeholder="Resumo do que você precisa"
            value={subject}
            onChange={setSubject}
            maxLength={140}
            isRequired
          />
          <label className="block text-sm font-medium text-gray-700">
            Categoria
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as SupportTicketCategory)}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-base outline-none focus:ring-2 focus:ring-violet-600"
            >
              {Object.entries(supportCategoryLabels).map(([value, label]) => (
                <option value={value} key={value}>{label}</option>
              ))}
            </select>
          </label>
          <TextArea
            label="Como podemos ajudar?"
            placeholder="Descreva o problema e o resultado esperado"
            value={message}
            onChange={setMessage}
            rows={5}
            maxLength={4000}
            isRequired
          />
          {actions.hasError && <p className="text-sm text-red-700" role="alert">{actions.error}</p>}
          <div className="grid grid-cols-2 gap-2">
            <Button color="secondary" size="lg" onPress={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              color="primary"
              size="lg"
              isLoading={actions.isPending}
              isDisabled={subject.trim().length < 5 || message.trim().length < 10}
            >
              Enviar chamado
            </Button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
