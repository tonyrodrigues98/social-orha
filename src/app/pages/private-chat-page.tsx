import { MoreHorizontal, Phone, Video } from "lucide-react";
import { Avatar } from "@/components/base/avatar/avatar";
import {
  ChatComposer,
  ChatHeader,
  ChatMessages,
  ChatProvider,
  type ChatMessageData,
  type ChatUser,
} from "@/components/ui/chat";
import { useAuth } from "../auth/auth-context";
import { usePrototype } from "../prototype-context";

type PrivateChatPageProps = {
  conversationId: string;
  onBack: () => void;
};

export function PrivateChatPage({ conversationId, onBack }: PrivateChatPageProps) {
  const { identity } = useAuth();
  const { conversations, conversationMessages, profile, sendMessage, announce } = usePrototype();
  const conversation = conversations.find((item) => item.id === conversationId);

  if (!conversation) return null;

  const currentUser: ChatUser = {
    id: identity?.profile.id ?? "local-user",
    name: profile.fullName,
    status: "online",
  };
  const initials = conversation.initials;
  const messages: ChatMessageData[] = (conversationMessages[conversationId] ?? []).map((message) => ({
    id: message.id,
    senderId: message.mine ? currentUser.id : conversation.id,
    senderName: message.mine ? currentUser.name : conversation.name,
    text: message.content,
    timestamp: message.timestamp,
    status: message.mine ? "read" : "delivered",
  }));

  return (
    <section className="private-chat-page" aria-label={`Conversa com ${conversation.name}`}>
      <ChatProvider
        currentUser={currentUser}
        theme="lunar"
        dateFormat="time-only"
        onReactionAdd={(_messageId, emoji) => announce(`Reação ${emoji} adicionada para teste.`)}
        onReply={(message) => announce(`Respondendo a “${message.text ?? "mensagem"}”.`)}
        className="orha-private-chat"
      >
        <ChatHeader
          title={conversation.name}
          subtitle={conversation.kind === "group" ? "Grupo" : "Disponível agora"}
          onBack={onBack}
          avatar={<Avatar size="sm" initials={initials} contentClassName="avatar-transparent private-chat-avatar" />}
          actions={(
            <div className="private-chat-actions">
              <button type="button" aria-label="Ligação de voz" onClick={() => announce("Chamadas entram na próxima integração.")}><Phone size={18} /></button>
              <button type="button" aria-label="Chamada de vídeo" onClick={() => announce("Chamadas entram na próxima integração.")}><Video size={18} /></button>
              <button type="button" aria-label="Mais opções" onClick={() => announce("Mais opções da conversa em breve.")}><MoreHorizontal size={19} /></button>
            </div>
          )}
        />
        <ChatMessages messages={messages} />
        <ChatComposer
          placeholder="Mensagem"
          onSend={(text) => sendMessage(conversationId, text)}
          onFileUpload={(files) => announce(`${files.length} anexo${files.length > 1 ? "s" : ""} preparado${files.length > 1 ? "s" : ""} para envio.`)}
          onVoiceRecord={() => announce("Gravação de áudio será conectada ao adaptador nativo.")}
        />
      </ChatProvider>
    </section>
  );
}
