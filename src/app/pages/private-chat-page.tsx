import { useEffect, useRef, useState } from "react";
import { useDrag } from "@use-gesture/react";
import { Archive, BellOff, ChevronRight, Files, MoreHorizontal, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { Avatar } from "@/components/base/avatar/avatar";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import {
  ChatComposer,
  ChatHeader,
  ChatMessages,
  ChatProvider,
  type ChatMessageData,
  type ChatUser,
} from "@/components/ui/chat";
import { BrowserAudioRecorder } from "@/infrastructure/media/browser-audio-recorder";
import { useAuth } from "../auth/auth-context";
import { usePrototype } from "../prototype-context";

type PrivateChatPageProps = {
  conversationId: string;
  onBack: () => void;
};

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}

function ContactDetails({ name, initials, kind, onBack, onAnnounce }: {
  name: string;
  initials: string;
  kind: "friend" | "group";
  onBack: () => void;
  onAnnounce: (message: string) => void;
}) {
  return (
    <section className="contact-details-page" aria-label={`Dados de ${name}`}>
      <header className="contact-details-header">
        <button type="button" onClick={onBack} aria-label="Voltar para a conversa">‹</button>
        <h1>{kind === "group" ? "Dados do grupo" : "Dados do contato"}</h1>
        <span />
      </header>
      <main className="contact-details-content">
        <div className="contact-details-identity">
          <Avatar size="xl" initials={initials} contentClassName="avatar-transparent contact-details-avatar" />
          <h2>{name}</h2>
          <p>{kind === "group" ? "Espaço compartilhado da comunidade" : "Contato da sua rede no ORHA"}</p>
        </div>

        <div className="contact-details-actions">
          <button type="button" onClick={() => onAnnounce("O perfil do contato será aberto em seguida.")}><UserRound size={20} /><span>Perfil</span></button>
          <button type="button" onClick={() => onAnnounce("Mídias compartilhadas estarão disponíveis quando os anexos forem persistidos.")}><Files size={20} /><span>Mídias</span></button>
          <button type="button" onClick={() => onAnnounce("Notificações desta conversa silenciadas para teste.")}><BellOff size={20} /><span>Silenciar</span></button>
        </div>

        <section className="contact-details-card" aria-label="Informações da conversa">
          <button type="button" onClick={() => onAnnounce("Lista de mídias compartilhadas preparada.")}><Files size={19} /><span><strong>Mídias e arquivos</strong><small>Áudios, imagens e links da conversa</small></span><ChevronRight size={18} /></button>
          <button type="button" onClick={() => onAnnounce("Configurações de privacidade preparadas.")}><ShieldCheck size={19} /><span><strong>Privacidade e segurança</strong><small>Bloqueios e permissões da conversa</small></span><ChevronRight size={18} /></button>
        </section>

        <section className="contact-details-card contact-details-muted" aria-label="Ações da conversa">
          <button type="button" onClick={() => onAnnounce("Conversa arquivada para teste.")}><Archive size={19} /><span><strong>Arquivar conversa</strong><small>Você poderá encontrá-la depois</small></span><ChevronRight size={18} /></button>
          <button type="button" onClick={() => onAnnounce("A limpeza da conversa pedirá confirmação quando estiver conectada ao banco.")}><Trash2 size={19} /><span><strong>Limpar mensagens</strong><small>Remove mensagens apenas desta tela</small></span><ChevronRight size={18} /></button>
        </section>
      </main>
    </section>
  );
}

export function PrivateChatPage({ conversationId, onBack }: PrivateChatPageProps) {
  const { identity } = useAuth();
  const { conversations, conversationMessages, profile, sendMessage, sendVoiceMessage, announce } = usePrototype();
  const conversation = conversations.find((item) => item.id === conversationId);
  const [dragOffset, setDragOffset] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const recorderRef = useRef<BrowserAudioRecorder | null>(null);
  const recordingStartedAt = useRef(0);

  useEffect(() => () => recorderRef.current?.cancel(), []);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecordedSeconds((Date.now() - recordingStartedAt.current) / 1000), 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  const bindBackSwipe = useDrag(
    ({ first, last, movement: [movementX], velocity: [velocityX], direction: [directionX], initial: [initialX], cancel }) => {
      if (first && initialX > 28) { cancel(); return; }
      const offset = Math.min(Math.max(movementX, 0), 140);
      if (!last) { setDragOffset(offset); return; }
      setDragOffset(0);
      if (offset > 88 || (velocityX > 0.45 && directionX > 0)) onBack();
    },
    { axis: "x", filterTaps: true, threshold: 8 },
  );

  if (!conversation) return null;

  const currentUser: ChatUser = { id: identity?.profile.id ?? "local-user", name: profile.fullName, status: "online" };
  const messages: ChatMessageData[] = (conversationMessages[conversationId] ?? []).map((message) => ({
    id: message.id,
    senderId: message.mine ? currentUser.id : conversation.id,
    senderName: message.mine ? currentUser.name : conversation.name,
    text: message.content || undefined,
    voice: message.voice,
    timestamp: message.timestamp,
    status: message.mine ? "read" : "delivered",
  }));

  async function beginVoiceRecord() {
    try {
      const recorder = new BrowserAudioRecorder();
      await recorder.start();
      recorderRef.current = recorder;
      recordingStartedAt.current = Date.now();
      setRecordedSeconds(0);
      setRecording(true);
    } catch (error) {
      announce(error instanceof Error ? error.message : "Não foi possível acessar o microfone.");
    }
  }

  function cancelVoiceRecord() {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setRecording(false);
    setRecordedSeconds(0);
  }

  async function sendVoiceRecord() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    try {
      const blob = await recorder.stop();
      const duration = Math.max(1, (Date.now() - recordingStartedAt.current) / 1000);
      sendVoiceMessage(conversationId, { url: URL.createObjectURL(blob), duration });
      announce("Áudio enviado nesta conversa.");
    } catch (error) {
      announce(error instanceof Error ? error.message : "Não foi possível finalizar o áudio.");
    } finally {
      recorderRef.current = null;
      setRecording(false);
      setRecordedSeconds(0);
    }
  }

  return (
    <section {...bindBackSwipe()} className="private-chat-page" aria-label={`Conversa com ${conversation.name}`} style={{ transform: `translateX(${dragOffset}px)`, transition: dragOffset ? "none" : "transform 180ms ease-out" }}>
      <ChatProvider currentUser={currentUser} theme="lunar" dateFormat="time-only" onReactionAdd={(_messageId, emoji) => announce(`Reação ${emoji} adicionada para teste.`)} onReply={(message) => announce(`Respondendo a “${message.text ?? "mensagem"}”.`)} className="orha-private-chat">
        <ChatHeader
          title={conversation.name}
          subtitle={conversation.kind === "group" ? "Grupo" : "Disponível agora"}
          onBack={onBack}
          avatar={<Avatar size="sm" initials={conversation.initials} contentClassName="avatar-transparent private-chat-avatar" />}
          actions={<div className="private-chat-actions"><Dropdown.Root><button type="button" aria-label="Mais opções" className="private-chat-menu-trigger"><MoreHorizontal size={19} /></button><Dropdown.Popover className="private-chat-menu"><Dropdown.Menu selectionMode="none" onAction={(key) => { if (key === "details") setShowDetails(true); if (key === "mute") announce("Notificações silenciadas para teste."); if (key === "archive") announce("Conversa arquivada para teste."); }}><Dropdown.Item id="details" icon={UserRound}>Dados do contato</Dropdown.Item><Dropdown.Item id="mute" icon={BellOff}>Silenciar notificações</Dropdown.Item><Dropdown.Item id="archive" icon={Archive}>Arquivar conversa</Dropdown.Item></Dropdown.Menu></Dropdown.Popover></Dropdown.Root></div>}
        />
        <ChatMessages messages={messages} />
        <ChatComposer placeholder="Mensagem" onSend={(text) => sendMessage(conversationId, text)} onFileUpload={(files) => announce(`${files.length} anexo${files.length > 1 ? "s" : ""} preparado${files.length > 1 ? "s" : ""} para envio.`)} onVoiceRecord={() => void beginVoiceRecord()} voiceRecording={recording} voiceDurationLabel={formatDuration(recordedSeconds)} onVoiceCancel={cancelVoiceRecord} onVoiceSend={() => void sendVoiceRecord()} />
      </ChatProvider>
      {showDetails ? <ContactDetails name={conversation.name} initials={conversation.initials} kind={conversation.kind} onBack={() => setShowDetails(false)} onAnnounce={announce} /> : null}
    </section>
  );
}
