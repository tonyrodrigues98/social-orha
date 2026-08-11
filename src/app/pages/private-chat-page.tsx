import { useState } from "react";
import { useDrag } from "@use-gesture/react";
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
  const [dragOffset, setDragOffset] = useState(0);
  const bindBackSwipe = useDrag(
    ({ first, last, movement: [movementX], velocity: [velocityX], direction: [directionX], initial: [initialX], cancel }) => {
      if (first && initialX > 28) {
        cancel();
        return;
      }

      const offset = Math.min(Math.max(movementX, 0), 140);
      if (!last) {
        setDragOffset(offset);
        return;
      }

      setDragOffset(0);
      if (offset > 88 || (velocityX > 0.45 && directionX > 0)) onBack();
    },
    { axis: "x", filterTaps: true, threshold: 8 },
  );

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
    <section
      {...bindBackSwipe()}
      className="private-chat-page"
      aria-label={`Conversa com ${conversation.name}`}
      style={{ transform: `translateX(${dragOffset}px)`, transition: dragOffset ? "none" : "transform 180ms ease-out" }}
    >
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
