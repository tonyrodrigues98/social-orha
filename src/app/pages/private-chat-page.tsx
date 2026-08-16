import { useEffect, useMemo, useRef, useState } from "react";
import { useDrag } from "@use-gesture/react";
import { Archive, BellOff, ChevronLeft, ChevronRight, Files, ShieldCheck, Trash2, UserRound } from "lucide-react";
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
import { BrowserAudioRecorder, createRecordedAudioUrl } from "@/infrastructure/media/browser-audio-recorder";
import { useAuth } from "../auth/auth-context";
import { usePrototype } from "../prototype-context";

type PrivateChatPageProps = {
  conversationId: string;
  onBack: () => void;
};

type RecordingPhase = "idle" | "starting" | "recording" | "stopping";

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

async function createWaveform(blob: Blob) {
  const context = new AudioContext();
  try {
    const data = await blob.arrayBuffer();
    const buffer = await context.decodeAudioData(data.slice(0));
    const samples = buffer.getChannelData(0);
    const bars = 48;
    const blockSize = Math.max(1, Math.floor(samples.length / bars));
    return Array.from({ length: bars }, (_, index) => {
      let peak = 0;
      const from = index * blockSize;
      const until = Math.min(samples.length, from + blockSize);
      for (let sample = from; sample < until; sample += 1) peak = Math.max(peak, Math.abs(samples[sample] ?? 0));
      return Math.min(1, Math.max(0.08, peak));
    });
  } finally {
    await context.close();
  }
}

function ContactDetails({ name, initials, kind, onBack, onAnnounce, backButtonRef }: {
  name: string;
  initials: string;
  kind: "friend" | "group";
  onBack: () => void;
  onAnnounce: (message: string) => void;
  backButtonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <section className="contact-details-page" aria-labelledby="contact-details-title">
      <header className="contact-details-header">
        <button
          ref={backButtonRef}
          type="button"
          onClick={onBack}
          aria-label="Voltar para a conversa"
          style={{ width: 44, height: 44, padding: 0 }}
        >
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <h1 id="contact-details-title">{kind === "group" ? "Dados do grupo" : "Dados do contato"}</h1>
        <span aria-hidden="true" />
      </header>
      <main className="contact-details-content">
        <div className="contact-details-identity">
          <Avatar size="xl" initials={initials} contentClassName="avatar-transparent contact-details-avatar" />
          <h2>{name}</h2>
          <p>{kind === "group" ? "Espaço compartilhado da comunidade" : "Contato da sua rede no ORHA"}</p>
        </div>

        <div className="contact-details-actions">
          <button type="button" onClick={() => onAnnounce("Abrindo o perfil do contato.")}><UserRound size={20} /><span>Perfil</span></button>
          <button type="button" onClick={() => onAnnounce("Abrindo mídias compartilhadas.")}><Files size={20} /><span>Mídias</span></button>
          <button type="button" onClick={() => onAnnounce("Notificações desta conversa foram silenciadas.")}><BellOff size={20} /><span>Silenciar</span></button>
        </div>

        <section className="contact-details-card" aria-label="Informações da conversa">
          <button type="button" onClick={() => onAnnounce("Abrindo mídias e arquivos.")}><Files size={19} /><span><strong>Mídias e arquivos</strong><small>Áudios, imagens e links da conversa</small></span><ChevronRight size={18} /></button>
          <button type="button" onClick={() => onAnnounce("Abrindo privacidade e segurança.")}><ShieldCheck size={19} /><span><strong>Privacidade e segurança</strong><small>Bloqueios e permissões da conversa</small></span><ChevronRight size={18} /></button>
        </section>

        <section className="contact-details-card contact-details-muted" aria-label="Ações da conversa">
          <button type="button" onClick={() => onAnnounce("Conversa arquivada.")}><Archive size={19} /><span><strong>Arquivar conversa</strong><small>Você poderá encontrá-la depois</small></span><ChevronRight size={18} /></button>
          <button type="button" onClick={() => onAnnounce("A limpeza de mensagens exige confirmação.")}><Trash2 size={19} /><span><strong>Limpar mensagens</strong><small>Remove mensagens apenas desta conversa</small></span><ChevronRight size={18} /></button>
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
  const [recordingPhase, setRecordingPhase] = useState<RecordingPhase>("idle");
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const [chatThemeRoot, setChatThemeRoot] = useState<HTMLDivElement | null>(null);
  const recorderRef = useRef<BrowserAudioRecorder | null>(null);
  const recordingStartedAt = useRef(0);
  const chatBackButtonRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const detailsBackButtonRef = useRef<HTMLButtonElement>(null);
  const restoreMenuFocusRef = useRef(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => chatBackButtonRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => () => recorderRef.current?.cancel(), []);

  useEffect(() => {
    if (recordingPhase !== "recording") return;
    const timer = window.setInterval(() => setRecordedSeconds((Date.now() - recordingStartedAt.current) / 1000), 1000);
    return () => window.clearInterval(timer);
  }, [recordingPhase]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (showDetails) detailsBackButtonRef.current?.focus({ preventScroll: true });
      else if (restoreMenuFocusRef.current) {
        restoreMenuFocusRef.current = false;
        menuButtonRef.current?.focus({ preventScroll: true });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showDetails]);

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

  const currentUser = useMemo<ChatUser>(() => ({
    id: identity?.profile.id ?? "local-user",
    name: profile.fullName,
    status: "online",
  }), [identity?.profile.id, profile.fullName]);
  const conversationMessageList = useMemo(
    () => conversationMessages[conversationId] ?? [],
    [conversationId, conversationMessages],
  );
  const messages = useMemo<ChatMessageData[]>(() => {
    if (!conversation) return [];
    return conversationMessageList.map((message) => ({
      id: message.id,
      senderId: message.mine ? currentUser.id : conversation.id,
      senderName: message.mine ? currentUser.name : conversation.name,
      text: message.content || undefined,
      voice: message.voice,
      timestamp: message.timestamp,
      status: message.mine ? "read" : "delivered",
    }));
  }, [conversation, conversationMessageList, currentUser.id, currentUser.name]);

  if (!conversation) return null;

  async function beginVoiceRecord() {
    if (recorderRef.current || recordingPhase !== "idle") return;
    const recorder = new BrowserAudioRecorder();
    recorderRef.current = recorder;
    setRecordingPhase("starting");
    try {
      await recorder.start();
      if (recorderRef.current !== recorder) return;
      recordingStartedAt.current = Date.now();
      setRecordedSeconds(0);
      setRecordingPhase("recording");
    } catch (error) {
      const wasCurrentRecorder = recorderRef.current === recorder;
      if (wasCurrentRecorder) {
        recorderRef.current = null;
        setRecordingPhase("idle");
      }
      if (wasCurrentRecorder && !isAbortError(error)) announce(error instanceof Error ? error.message : "Não foi possível acessar o microfone.");
    }
  }

  function cancelVoiceRecord() {
    if (recordingPhase === "stopping") return;
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setRecordingPhase("idle");
    setRecordedSeconds(0);
  }

  async function sendVoiceRecord() {
    const recorder = recorderRef.current;
    if (!recorder || recordingPhase !== "recording") return;
    setRecordingPhase("stopping");
    try {
      const blob = await recorder.stop();
      const duration = Math.max(1, (Date.now() - recordingStartedAt.current) / 1000);
      const waveform = await createWaveform(blob).catch(() => undefined);
      sendVoiceMessage(conversationId, { url: createRecordedAudioUrl(blob), duration, waveform });
      announce("Áudio enviado nesta conversa.");
    } catch (error) {
      if (!isAbortError(error)) announce(error instanceof Error ? error.message : "Não foi possível finalizar o áudio.");
    } finally {
      if (recorderRef.current === recorder) recorderRef.current = null;
      setRecordingPhase("idle");
      setRecordedSeconds(0);
    }
  }

  const gestureProps = showDetails ? {} : bindBackSwipe();

  return (
    <section
      {...gestureProps}
      className="private-chat-page"
      aria-label={showDetails ? `Dados de ${conversation.name}` : `Conversa com ${conversation.name}`}
      style={{ transform: `translateX(${showDetails ? 0 : dragOffset}px)`, transition: dragOffset ? "none" : "transform 180ms ease-out" }}
    >
      <ChatProvider
        currentUser={currentUser}
        theme="lunar"
        dateFormat="time-only"
        rootRef={setChatThemeRoot}
        onReactionAdd={(_messageId, emoji) => announce(`Reação ${emoji} adicionada.`)}
        onReply={(message) => announce(`Respondendo a “${message.text ?? "mensagem"}”.`)}
        className="orha-private-chat"
      >
        {showDetails ? (
          <ContactDetails
            name={conversation.name}
            initials={conversation.initials}
            kind={conversation.kind}
            backButtonRef={detailsBackButtonRef}
            onBack={() => {
              restoreMenuFocusRef.current = true;
              setShowDetails(false);
            }}
            onAnnounce={announce}
          />
        ) : (
          <>
            <ChatHeader
              title={conversation.name}
              subtitle={conversation.kind === "group" ? "Grupo" : "Disponível agora"}
              onBack={onBack}
              backLabel="Voltar para conversas"
              backButtonRef={chatBackButtonRef}
              avatar={<Avatar size="sm" initials={conversation.initials} contentClassName="avatar-transparent private-chat-avatar" />}
              actions={(
                <div className="private-chat-actions">
                  <Dropdown.Root>
                    <Dropdown.DotsButton
                      ref={menuButtonRef}
                      className="private-chat-menu-trigger"
                      aria-label="Mais opções da conversa"
                      style={{ width: 44, height: 44 }}
                    />
                    <Dropdown.Popover className="private-chat-menu" UNSTABLE_portalContainer={chatThemeRoot ?? undefined}>
                      <Dropdown.Menu
                        aria-label="Opções da conversa"
                        selectionMode="none"
                        onAction={(key) => {
                          if (key === "details") setShowDetails(true);
                          if (key === "mute") announce("Notificações silenciadas.");
                          if (key === "archive") announce("Conversa arquivada.");
                        }}
                      >
                        <Dropdown.Item id="details" textValue={conversation.kind === "group" ? "Dados do grupo" : "Dados do contato"} icon={UserRound}>
                          {conversation.kind === "group" ? "Dados do grupo" : "Dados do contato"}
                        </Dropdown.Item>
                        <Dropdown.Item id="mute" textValue="Silenciar notificações" icon={BellOff}>Silenciar notificações</Dropdown.Item>
                        <Dropdown.Item id="archive" textValue="Arquivar conversa" icon={Archive}>Arquivar conversa</Dropdown.Item>
                      </Dropdown.Menu>
                    </Dropdown.Popover>
                  </Dropdown.Root>
                </div>
              )}
            />
            <ChatMessages messages={messages} />
            <ChatComposer
              placeholder="Mensagem"
              disabled={recordingPhase === "starting"}
              onSend={(text) => sendMessage(conversationId, text)}
              onFileUpload={(files) => announce(`${files.length} anexo${files.length > 1 ? "s" : ""} preparado${files.length > 1 ? "s" : ""} para envio.`)}
              onVoiceRecord={() => void beginVoiceRecord()}
              voiceRecording={recordingPhase === "recording" || recordingPhase === "stopping"}
              voiceActionPending={recordingPhase === "stopping"}
              voiceDurationLabel={formatDuration(recordedSeconds)}
              onVoiceCancel={cancelVoiceRecord}
              onVoiceSend={() => void sendVoiceRecord()}
            />
          </>
        )}
      </ChatProvider>
    </section>
  );
}
