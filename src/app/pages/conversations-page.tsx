import { ChevronRight, Edit3, ShieldCheck, UserPlus } from "lucide-react";
import { Avatar } from "@/components/base/avatar/avatar";
import { conversations } from "../prototype-data";
import { NativeHeader } from "../components/native-header";

export function ConversationsPage() {
  return (
    <div className="page">
      <NativeHeader title="Conversas" subtitle="Seu espaço privado" />
      <main className="page-content">
        <section className="message-request-card">
          <span className="request-icon"><UserPlus size={20} /></span>
          <span><strong>2 solicitações de conversa</strong><small>Você decide quem pode falar com você</small></span>
          <ChevronRight size={18} />
        </section>

        <div className="conversation-filter" role="tablist" aria-label="Filtrar conversas">
          <button type="button" className="active">Todas</button>
          <button type="button">Amigos</button>
          <button type="button">Grupos</button>
        </div>

        <section className="conversation-list" aria-label="Conversas recentes">
          {conversations.map((conversation) => (
            <button type="button" className="conversation-row" key={conversation.name}>
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
        <button type="button" className="compose-button" aria-label="Nova conversa"><Edit3 size={21} /></button>
      </main>
    </div>
  );
}
