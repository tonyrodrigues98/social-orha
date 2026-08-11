import { useState } from "react";
import { ChevronRight, Edit3, ShieldCheck, UserPlus } from "lucide-react";
import { Avatar } from "@/components/base/avatar/avatar";
import { NativeHeader } from "../components/native-header";
import { usePrototype } from "../prototype-context";

export function ConversationsPage() {
  const { conversations, conversationRequests, openConversation, openDrawer } = usePrototype();
  const [filter, setFilter] = useState<"all" | "friend" | "group">("all");
  const visibleConversations = conversations.filter((conversation) => filter === "all" || conversation.kind === filter);
  return (
    <div className="page">
      <NativeHeader title="Conversas" subtitle="Seu espaço privado" />
      <main className="page-content">
        <button type="button" className="message-request-card" onClick={() => openDrawer({ type: "requests" })} aria-label={`${conversationRequests.length} solicitações pendentes`}>
          <span className="request-icon"><UserPlus size={20} /></span>
          <span><strong>2 solicitações de conversa</strong><small>Você decide quem pode falar com você</small></span>
          <ChevronRight size={18} />
        </button>

        <div className="conversation-filter" role="tablist" aria-label="Filtrar conversas">
          <button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Todas</button>
          <button type="button" className={filter === "friend" ? "active" : ""} onClick={() => setFilter("friend")}>Amigos</button>
          <button type="button" className={filter === "group" ? "active" : ""} onClick={() => setFilter("group")}>Grupos</button>
        </div>

        <section className="conversation-list" aria-label="Conversas recentes">
          {visibleConversations.map((conversation) => (
            <button type="button" className="conversation-row" key={conversation.id} onClick={() => openConversation(conversation.id)}>
              <span className="conversation-avatar" style={{ background: conversation.tone }}>
                <Avatar size="lg" initials={conversation.initials} status="online" contentClassName="avatar-transparent" />
              </span>
              <span className="conversation-copy">
                <span className="conversation-top"><strong>{conversation.name}</strong><time>{conversation.time}</time></span>
                <span className="conversation-preview">{conversation.message}</span>
              </span>
              {conversation.unread ? <span className="unread-count">{conversation.unread}</span> : null}
            </button>
          ))}
        </section>

        <aside className="privacy-note"><ShieldCheck size={17} /><span><strong>Conversas sob seu controle</strong> · pedidos não liberam amizade automaticamente.</span></aside>
        <button type="button" className="compose-button" aria-label="Nova conversa" onClick={() => openDrawer({ type: "compose" })}><Edit3 size={21} /></button>
      </main>
    </div>
  );
}
