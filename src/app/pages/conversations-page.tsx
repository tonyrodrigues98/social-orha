import { useState } from "react";
import { ChevronRight, Edit3, ShieldCheck, UserPlus } from "lucide-react";
import { Tab, TabList, TabPanel, TabPanels, Tabs } from "react-aria-components";
import { Avatar } from "@/components/base/avatar/avatar";
import { NativeHeader } from "../components/native-header";
import { usePrototype } from "../prototype-context";

export function ConversationsPage() {
  const { conversations, conversationRequests, openConversation, openDrawer } =
    usePrototype();
  const [filter, setFilter] = useState<"all" | "friend" | "group">("all");
  const filters = [
    { id: "all", label: "Todas" },
    { id: "friend", label: "Amigos" },
    { id: "group", label: "Grupos" },
  ] as const;

  const renderConversations = (kind: typeof filter) =>
    conversations
      .filter((conversation) => kind === "all" || conversation.kind === kind)
      .map((conversation) => (
        <button
          type="button"
          className="conversation-row"
          key={conversation.id}
          onClick={() => openConversation(conversation.id)}
        >
          <span
            className="conversation-avatar"
            style={{ background: conversation.tone }}
          >
            <Avatar
              size="lg"
              initials={conversation.initials}
              status="online"
              contentClassName="avatar-transparent"
            />
          </span>
          <span className="conversation-copy">
            <span className="conversation-top">
              <strong>{conversation.name}</strong>
              <time>{conversation.time}</time>
            </span>
            <span className="conversation-preview">{conversation.message}</span>
          </span>
          {conversation.unread ? (
            <span
              className="unread-count"
              aria-label={`${conversation.unread} mensagens não lidas`}
            >
              {conversation.unread}
            </span>
          ) : null}
        </button>
      ));

  return (
    <div className="page">
      <NativeHeader title="Conversas" subtitle="Seu espaço privado" />
      <main className="page-content">
        <button
          type="button"
          className="message-request-card"
          onClick={() => openDrawer({ type: "requests" })}
          aria-label={`${conversationRequests.length} solicitações pendentes`}
        >
          <span className="request-icon">
            <UserPlus size={20} />
          </span>
          <span>
            <strong>
              {conversationRequests.length}{" "}
              {conversationRequests.length === 1
                ? "solicitação de conversa"
                : "solicitações de conversa"}
            </strong>
            <small>Você decide quem pode falar com você</small>
          </span>
          <ChevronRight size={18} />
        </button>

        <Tabs
          selectedKey={filter}
          onSelectionChange={(key) => setFilter(key as typeof filter)}
        >
          <TabList
            className="conversation-filter"
            aria-label="Filtrar conversas"
          >
            {filters.map((item) => (
              <Tab
                id={item.id}
                key={item.id}
                className={({ isSelected }) =>
                  `inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border px-[13px] py-2 text-[11px] font-[620] outline-none focus-visible:ring-2 focus-visible:ring-[#6760d8] focus-visible:ring-offset-2 ${isSelected ? "border-[#242426] bg-[#242426] text-white" : "border-[var(--orha-hairline)] bg-white text-[var(--orha-subtle)]"}`
                }
              >
                {item.label}
              </Tab>
            ))}
          </TabList>
          <TabPanels className="contents">
            {filters.map((item) => (
              <TabPanel
                id={item.id}
                key={item.id}
                className="conversation-list outline-none"
              >
                {renderConversations(item.id)}
              </TabPanel>
            ))}
          </TabPanels>
        </Tabs>

        <aside className="privacy-note">
          <ShieldCheck size={17} />
          <span>
            <strong>Conversas sob seu controle</strong> · pedidos não liberam
            amizade automaticamente.
          </span>
        </aside>
        <button
          type="button"
          className="compose-button"
          aria-label="Nova conversa"
          onClick={() => openDrawer({ type: "compose" })}
        >
          <Edit3 size={21} />
        </button>
      </main>
    </div>
  );
}
