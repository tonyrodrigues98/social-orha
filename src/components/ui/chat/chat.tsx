"use client"

import * as React from "react"
import WaveSurfer from "wavesurfer.js"
import { useVirtualizer } from "@tanstack/react-virtual"
import { cn } from "@/lib/utils"
import {
  Check,
  CheckCheck,
  ArrowUp,
  ChevronDown,
  Clock,
  AlertCircle,
  Reply,
  SmilePlus,
  MoreHorizontal,
  Pin,
  Pencil,
  Trash2,
  X,
  Paperclip,
  Image as ImageIcon,
  Upload,
  Plus,
  Play,
  Pause,
  Mic,
} from "lucide-react"
import { createPortal } from "react-dom"
import type {
  ChatUser,
  ChatConfig,
  ChatMessageData,
  MessageGroup,
  TypingUser,
  ChatTheme,
} from "./types"
import {
  groupMessages,
  useAutoScroll,
  useAutoResize,
  useTypingIndicator,
  formatTimestamp,
} from "./hooks"
import { displayHostname, sanitizeFileName, sanitizeUrl, validateFile } from "./security"

// â”€â”€â”€ Context â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ChatContext = React.createContext<ChatConfig | null>(null)

function useChatContext() {
  const ctx = React.useContext(ChatContext)
  if (!ctx)
    throw new Error("Chat components must be wrapped in <ChatProvider>")
  return ctx
}

// â”€â”€â”€ ChatProvider â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface ChatProviderProps {
  currentUser: ChatUser
  theme?: ChatTheme
  dateFormat?: "relative" | "absolute" | "time-only"
  messageGroupingInterval?: number
  onReactionAdd?: (messageId: string, emoji: string) => void
  onReactionRemove?: (messageId: string, emoji: string) => void
  onReply?: (message: ChatMessageData) => void
  onEdit?: (message: ChatMessageData) => void
  onDelete?: (messageId: string) => void
  onPin?: (messageId: string) => void
  children: React.ReactNode
  style?: React.CSSProperties
  className?: string
  rootRef?: React.Ref<HTMLDivElement>
}

function ChatProvider({
  currentUser,
  theme = "lunar",
  dateFormat = "relative",
  messageGroupingInterval = 120,
  onReactionAdd,
  onReactionRemove,
  onReply,
  onEdit,
  onDelete,
  onPin,
  children,
  style,
  className,
  rootRef,
}: ChatProviderProps) {
  const config = React.useMemo<ChatConfig>(
    () => ({
      currentUser,
      dateFormat,
      messageGroupingInterval,
      onReactionAdd,
      onReactionRemove,
      onReply,
      onEdit,
      onDelete,
      onPin,
    }),
    [currentUser, dateFormat, messageGroupingInterval, onReactionAdd, onReactionRemove, onReply, onEdit, onDelete, onPin]
  )

  return (
    <ChatContext.Provider value={config}>
      <div ref={rootRef} data-chat-theme={theme} style={style} className={className}>
        {children}
      </div>
    </ChatContext.Provider>
  )
}

// â”€â”€â”€ Quick emoji picker (6 common reactions) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const QUICK_REACTIONS = ["\u{1F44D}", "\u{2764}\u{FE0F}", "\u{1F602}", "\u{1F62E}", "\u{1F64F}", "\u{1F525}"]

function QuickReactionPicker({
  onSelect,
  onClose,
}: {
  onSelect: (emoji: string) => void
  onClose: () => void
}) {
  return (
    <div
      className="chat-toolbar-enter flex items-center gap-0.5 rounded-[10px] border border-[var(--chat-border-strong)] bg-[var(--chat-bg-sidebar)] p-1 shadow-[var(--chat-shadow-toolbar)]"
      onMouseLeave={onClose}
    >
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => {
            onSelect(emoji)
            onClose()
          }}
          className="flex size-8 items-center justify-center rounded-lg text-lg transition-transform hover:scale-125 hover:bg-[var(--chat-accent-soft)]"
          aria-label={`React with ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}

// â”€â”€â”€ ChatMessageActions (hover toolbar) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface ChatMessageActionsProps {
  message: ChatMessageData
  isOutgoing: boolean
}

function ChatMessageActions({ message, isOutgoing }: ChatMessageActionsProps) {
  const { onReply, onReactionAdd, onEdit, onDelete, onPin } = useChatContext()
  const [showReactions, setShowReactions] = React.useState(false)
  const [showMore, setShowMore] = React.useState(false)

  return (
    <div
      className={cn(
        "chat-toolbar-enter pointer-events-none absolute -top-3 z-10 flex items-center gap-0.5 rounded-lg border border-[var(--chat-border-strong)] bg-[var(--chat-bg-sidebar)] p-0.5 opacity-0 shadow-[var(--chat-shadow-toolbar)] transition-opacity group-hover/message:pointer-events-auto group-hover/message:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100",
        isOutgoing ? "right-0" : "left-10"
      )}
    >
      {/* Reply */}
      <button
        type="button"
        onClick={() => onReply?.(message)}
        className="flex size-11 items-center justify-center rounded-md text-[var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-accent-soft)] hover:text-[var(--chat-text-primary)]"
        aria-label="Responder"
      >
        <Reply className="size-3.5" />
      </button>

      {/* React â€” opens quick picker */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowReactions(!showReactions)}
          className="flex size-11 items-center justify-center rounded-md text-[var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-accent-soft)] hover:text-[var(--chat-text-primary)]"
          aria-label="Adicionar reaÃ§Ã£o"
        >
          <SmilePlus className="size-3.5" />
        </button>
        {showReactions && (
          <div className="absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2">
            <QuickReactionPicker
              onSelect={(emoji) =>
                onReactionAdd?.(message.id, emoji)
              }
              onClose={() => setShowReactions(false)}
            />
          </div>
        )}
      </div>

      {/* More â€” dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowMore(!showMore)}
          className="flex size-11 items-center justify-center rounded-md text-[var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-accent-soft)] hover:text-[var(--chat-text-primary)]"
          aria-label="Mais aÃ§Ãµes"
        >
          <MoreHorizontal className="size-3.5" />
        </button>
        {showMore && (
          <div
            className={cn(
              "chat-toolbar-enter absolute top-full z-20 mt-1 w-40 overflow-hidden rounded-lg border border-[var(--chat-border-strong)] bg-[var(--chat-bg-sidebar)] py-1 shadow-[var(--chat-shadow-toolbar)]",
              isOutgoing ? "right-0" : "left-0"
            )}
            onMouseLeave={() => setShowMore(false)}
          >
            {isOutgoing && (
              <button
                type="button"
                onClick={() => {
                  onEdit?.(message)
                  setShowMore(false)
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-accent-soft)] hover:text-[var(--chat-text-primary)]"
              >
                <Pencil className="size-3.5" />
                Editar
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onPin?.(message.id)
                setShowMore(false)
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-accent-soft)] hover:text-[var(--chat-text-primary)]"
            >
              <Pin className="size-3.5" />
              {message.isPinned ? "Desafixar" : "Fixar"}
            </button>
            {isOutgoing && (
              <button
                type="button"
                onClick={() => {
                  onDelete?.(message.id)
                  setShowMore(false)
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--chat-red)] transition-colors hover:bg-red-500/10"
              >
                <Trash2 className="size-3.5" />
                Excluir
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// â”€â”€â”€ ChatMessageReply (quoted reply inside bubble) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ChatMessageReply({
  replyTo,
  isOutgoing,
}: {
  replyTo: NonNullable<ChatMessageData["replyTo"]>
  isOutgoing: boolean
}) {
  // Outgoing bubbles set text color via --chat-bubble-outgoing-text which may
  // be white (Lunar, Midnight) or dark (Aurora, Ember).  Using `text-inherit`
  // + opacity lets the reply quote inherit that color and stay visible against
  // the bubble background regardless of theme.
  return (
    <div
      className={cn(
        "mb-1.5 flex items-start gap-2 rounded-lg border-l-2 px-2.5 py-1.5",
        isOutgoing
          ? "border-[var(--chat-bubble-outgoing-text)]/30 bg-[var(--chat-bubble-outgoing-text)]/10"
          : "border-[var(--chat-accent)] bg-[var(--chat-accent-soft)]"
      )}
    >
      <div className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-[12px] font-semibold",
            isOutgoing ? "text-inherit opacity-80" : "text-[var(--chat-accent)]"
          )}
        >
          {replyTo.senderName}
        </span>
        <span
          className={cn(
            "block truncate text-[12px]",
            isOutgoing ? "text-inherit opacity-60" : "text-[var(--chat-text-secondary)]"
          )}
        >
          {replyTo.text}
        </span>
      </div>
    </div>
  )
}

// â”€â”€â”€ ChatMessage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface ChatMessageProps {
  message: ChatMessageData
  isOutgoing: boolean
  position: "solo" | "first" | "middle" | "last"
  showSender?: boolean
  showAvatar?: boolean
  className?: string
}

// â”€â”€â”€ Voice Message â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ChatVoiceMessage({ voice, isOutgoing }: { voice: NonNullable<ChatMessageData["voice"]>; isOutgoing: boolean }) {
  const [playing, setPlaying] = React.useState(false)
  const [progress, setProgress] = React.useState(0)
  const [waveStatus, setWaveStatus] = React.useState<"loading" | "ready" | "error">("loading")
  const waveformRef = React.useRef<HTMLDivElement>(null)
  const playerRef = React.useRef<WaveSurfer | null>(null)
  const fallbackAudioRef = React.useRef<HTMLAudioElement>(null)
  const fallbackWave = React.useMemo(() => voice.waveform ?? [0.28, 0.52, 0.73, 0.4, 0.87, 0.59, 0.33, 0.67, 0.46, 0.78, 0.36, 0.6, 0.82, 0.49, 0.3, 0.68], [voice.waveform])

  const totalMins = Math.floor(voice.duration / 60)
  const totalSecs = Math.floor(voice.duration % 60)
  const elapsed = progress * voice.duration
  const elapsedMins = Math.floor(elapsed / 60)
  const elapsedSecs = Math.floor(elapsed % 60)
  const timeLabel = playing || progress > 0
    ? `${elapsedMins}:${elapsedSecs.toString().padStart(2, "0")}`
    : `${totalMins}:${totalSecs.toString().padStart(2, "0")}`

  React.useEffect(() => {
    if (!waveformRef.current) return
    setWaveStatus("loading")
    const player = WaveSurfer.create({
      container: waveformRef.current,
      url: voice.url,
      peaks: voice.waveform ? [voice.waveform] : undefined,
      duration: voice.duration,
      height: 32,
      barWidth: 3,
      barGap: 2,
      barRadius: 3,
      cursorWidth: 0,
      waveColor: isOutgoing ? "rgba(255,255,255,0.36)" : "#7564a8",
      progressColor: isOutgoing ? "#ffffff" : "#3f3760",
      normalize: true,
    })
    playerRef.current = player
    const offReady = player.on("ready", () => setWaveStatus("ready"))
    const offDecode = player.on("decode", () => setWaveStatus("ready"))
    const offError = player.on("error", () => setWaveStatus("error"))
    const offTime = player.on("timeupdate", (time) => {
      const duration = player.getDuration() || voice.duration
      setProgress(duration ? Math.min(1, time / duration) : 0)
    })
    const offPlay = player.on("play", () => setPlaying(true))
    const offPause = player.on("pause", () => setPlaying(false))
    const offFinish = player.on("finish", () => { setPlaying(false); setProgress(0) })
    return () => {
      offReady(); offDecode(); offError(); offTime(); offPlay(); offPause(); offFinish()
      player.destroy()
      playerRef.current = null
    }
  }, [isOutgoing, voice.duration, voice.url, voice.waveform])

  const toggle = () => {
    if (waveStatus === "error") {
      const audio = fallbackAudioRef.current
      if (!audio) return
      if (audio.paused) void audio.play()
      else audio.pause()
      return
    }
    void playerRef.current?.playPause()
  }

  const seekTo = (nextProgress: number) => {
    const clampedProgress = Math.min(1, Math.max(0, nextProgress))
    if (waveStatus === "error") {
      const audio = fallbackAudioRef.current
      if (audio?.duration) audio.currentTime = audio.duration * clampedProgress
    } else {
      playerRef.current?.seekTo(clampedProgress)
    }
    setProgress(clampedProgress)
  }

  return (
    <div className="mt-1.5 flex min-w-[220px] items-center gap-3" role="group" aria-label="Mensagem de Ã¡udio">
      <button
        type="button"
        onClick={toggle}
        className="flex size-11 shrink-0 items-center justify-center rounded-full transition-colors"
        style={{ background: isOutgoing ? "rgba(255,255,255,0.20)" : "var(--chat-accent)" }}
        aria-label={playing ? "Pausar Ã¡udio" : "Reproduzir Ã¡udio"}
      >
        {playing ? (
          <Pause className="w-4 h-4" style={{ color: "white" }} fill="white" />
        ) : (
          <Play className="w-4 h-4 ml-0.5" style={{ color: "white" }} fill="white" />
        )}
      </button>
      <div className="relative h-8 min-w-0 flex-1 overflow-hidden" aria-label="Forma de onda do Ã¡udio">
        <div ref={waveformRef} className={cn("chat-real-waveform absolute inset-0 cursor-pointer", waveStatus === "error" && "invisible pointer-events-none")} />
        {waveStatus === "error" && (
          <div className="absolute inset-0 flex items-center gap-[2px] overflow-hidden" aria-label="PrÃ©via da forma de onda indisponÃ­vel">
    ×N»ÚÚ$z{-®éÜj×U&V6÷&BÀ¢fö–6U&V6÷&F–ærÒfÇ6RÀ¢fö–6TGW&F–öäÆ&VÂÒ#£"À¢fö–6T7F–öåVæF–ærÒfÇ6RÀ¢öåfö–6T6æ6VÂÀ¢öåfö–6U6VæBÀ¢Æ6V†öÆFW"Ò$ÖW76vR"À¢F—6&ÆVBÒfÇ6RÀ¢&WÇ––æuFòÀ¢öä6æ6VÅ&WÇ’À¢6Æ74æÖRÀ§Ó¢6†D6ö×÷6W%&÷2’°¢6öç7B·fÇVRÂ6WEfÇVUÒÒ&V7BçW6U7FFR‚""¢6öç7B¶f–ÆW2Â6WDf–ÆW5ÒÒ&V7BçW6U7FFSÄf–ÆU&Wf–Wt—FVÕµÓâ…µÒ¢6öç7B¶—4G&vv–ærÂ6WD—4G&vv–æuÒÒ&V7BçW6U7FFR†fÇ6R¢6öç7B·6†÷tGF6„ÖVçRÂ6WE6†÷tGF6„ÖVçUÒÒ&V7BçW6U7FFR†fÇ6R¢6öç7B¶GF6†ÖVçDW'&÷"Â6WDGF6†ÖVçDW'&÷%ÒÒ&V7BçW6U7FFR‚""¢6öç7B²FW‡F&V&VbÂ&W6—¦RÒÒW6TWFõ&W6—¦R‡²Ö…&÷w3¢bÒ¢6öç7B²†æFÆT¶W”F÷vã¢†æFÆUG—–æt¶W”F÷vâÂ7F÷G—–ærÒĞ¢W6UG—–æt–æF–6F÷"‡²öåG—–æt6†ævS¢öåG—–ærÒ¢6öç7Bf–ÆT–çWE&VbÒ&V7BçW6U&VcÄ…DÔÄ–çWDVÆVÖVçCâ†çVÆÂ¢6öç7B–ÖvT–çWE&VbÒ&V7BçW6U&VcÄ…DÔÄ–çWDVÆVÖVçCâ†çVÆÂ¢6öç7BGF6…&ö÷E&VbÒ&V7BçW6U&VcÄ…DÔÄF—dVÆVÖVçCâ†çVÆÂ¢6öç7BGF6…G&–vvW%&VbÒ&V7BçW6U&VcÄ…DÔÄ'WGFöäVÆVÖVçCâ†çVÆÂ¢6öç7BGF6„ÖVçU&VbÒ&V7BçW6U&VcÄ…DÔÄF—dVÆVÖVçCâ†çVÆÂ¢6öç7BGF6„ÖVçT–BÒ&V7BçW6T–B‚¢6öç7B†46öçFVçBÒfÇVRçG&–Ò‚’æÆVæwF‚âÇÂf–ÆW2æÆVæwF‚â  ¢6öç7BFDf–ÆW2Ò&V7BçW6T6ÆÆ&6²‚†æWtf–ÆW3¢f–ÆTÆ—7BÂf–ÆUµÒ’Óâ°¢6öç7B6æF–FFW2Ò'&’æg&öÒ†æWtf–ÆW2¢6öç7BWfÇVFVBÒ6æF–FFW2æÖ‚†f–ÆR’Óâ‡²f–ÆRÂfÆ–FF–öã¢fÆ–FFTf–ÆR†f–ÆR’Ò’¢6öç7B'"ÒWfÇVFVBæf–ÇFW"‚†—FVÒ’Óâ—FVÒçfÆ–FF–öâçfÆ–B’æÖ‚†—FVÒ’Óâ—FVÒæf–ÆR’ç6Æ–6RƒÂ¢6öç7B&V¦V7FVBÒWfÇVFVBæf–æB‚†—FVÒ’Óâ—FVÒçfÆ–FF–öâçfÆ–B“òæf–ÆP¢6WDGF6†ÖVçDW'&÷"€¢&V¦V7FV@¢òG·6æ—F—¦Tf–ÆTæÖR‡&V¦V7FVBææÖR—Òì:6ò:’W&Ö—F–Fò÷RW†6VFRòÆ–Ö—FRFR#RÔ"æ ¢¢6æF–FFW2æÆVæwF‚â ¢ò$Vçf–RæòÜ:†–ÖòæW†÷2÷"ÖVç6vVÒâ ¢¢" ¢¢–b†'"æÆVæwF‚ÓÓÒ’&WGW&à¢6öç7B—FV×3¢f–ÆU&Wf–Wt—FVÕµÒÒ'"æÖ‚†b’Óâ‡°¢f–ÆS¢bÀ¢–C¢G¶bææÖWÒÒG´FFRææ÷r‚—ÒÒG´ÖF‚ç&æFöÒ‚—ÖÀ¢&öw&W73¢VæFVf–æVBÀ¢Ò’ ¢òòvVæW&FR–ÖvR&Wf–Ww0¢—FV×2æf÷$V6‚‚†—FVÒ’Óâ°¢–b†—FVÒæf–ÆRçG—Rç7F'G5v—F‚‚&–ÖvRò"’’°¢6öç7B&VFW"ÒæWrf–ÆU&VFW"‚¢&VFW"æöæÆöBÒ†R’Óâ°¢6WDf–ÆW2‚‡&Wb’Óà¢&WbæÖ‚†b’Óâbæ–BÓÓÒ—FVÒæ–Bò²ââæbÂ&Wf–Ws¢RçF&vWCòç&W7VÇB27G&–ærÒ¢b¢¢Ğ¢&VFW"ç&VD4FFU$Â†—FVÒæf–ÆR¢Ğ¢Ò ¢6WDf–ÆW2‚‡&Wb’Óâ²ââç&WbÂââæ—FV×5Ò¢öäf–ÆUWÆöCòâ†'"¢ÒÂ¶öäf–ÆUWÆöEÒ ¢&V7BçW6TVffV7B‚‚’Óâ°¢–b‚6†÷tGF6„ÖVçR’&WGW&à¢6öç7Bfö7W5F–ÖW"Òv–æF÷rç6WEF–ÖV÷WB‚‚’Óâ°¢GF6„ÖVçU&Vbæ7W'&VçCòçVW'•6VÆV7F÷#Ä…DÔÄ'WGFöäVÆVÖVçCâ‚%·&öÆSÒvÖVçV—FVÒuÒ"“òæfö7W2‚¢ÒÂ¢6öç7B†æFÆUö–çFW$F÷vâÒ†WfVçC¢ö–çFW$WfVçB’Óâ°¢–b†GF6…&ö÷E&Vbæ7W'&VçCòæ6öçF–ç2†WfVçBçF&vWB2æöFR’’&WGW&à¢6WE6†÷tGF6„ÖVçR†fÇ6R¢Ğ¢6öç7B†æFÆT¶W”F÷vâÒ†WfVçC¢¶W–&ö&DWfVçB’Óâ°¢–b†WfVçBæ¶W’ÓÒ$W66R"’&WGW&à¢WfVçBç&WfVçDFVfVÇB‚¢6WE6†÷tGF6„ÖVçR†fÇ6R¢GF6…G&–vvW%&Vbæ7W'&VçCòæfö7W2‚¢Ğ¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚'ö–çFW&F÷vâ"Â†æFÆUö–çFW$F÷vâ¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚&¶W–F÷vâ"Â†æFÆT¶W”F÷vâ¢&WGW&â‚’Óâ°¢v–æF÷ræ6ÆV%F–ÖV÷WB†fö7W5F–ÖW"¢Fö7VÖVçBç&VÖ÷fTWfVçDÆ—7FVæW"‚'ö–çFW&F÷vâ"Â†æFÆUö–çFW$F÷vâ¢Fö7VÖVçBç&VÖ÷fTWfVçDÆ—7FVæW"‚&¶W–F÷vâ"Â†æFÆT¶W”F÷vâ¢Ğ¢ÒÂ·6†÷tGF6„ÖVçUÒ ¢6öç7B†æFÆTGF6„ÖVçT¶W”F÷vâÒ&V7BçW6T6ÆÆ&6²‚†WfVçC¢&V7Bä¶W–&ö&DWfVçCÄ…DÔÄF—dVÆVÖVçCâ’Óâ°¢6öç7B—FV×2Ò'&’æg&öÒ†WfVçBæ7W'&VçEF&vWBçVW'•6VÆV7F÷$ÆÃÄ…DÔÄ'WGFöäVÆVÖVçCâ‚%·&öÆSÒvÖVçV—FVÒuÒ"’¢6öç7B7W'&VçD–æFW‚Ò—FV×2æ–æFW„öb†Fö7VÖVçBæ7F—fTVÆVÖVçB2…DÔÄ'WGFöäVÆVÖVçB¢–b†WfVçBæ¶W’ÓÓÒ$'&÷tF÷vâ"’°¢WfVçBç&WfVçDFVfVÇB‚¢—FV×5²†7W'&VçD–æFW‚²’R—FV×2æÆVæwF…Óòæfö7W2‚¢ÒVÇ6R–b†WfVçBæ¶W’ÓÓÒ$'&÷uW"’°¢WfVçBç&WfVçDFVfVÇB‚¢—FV×5²†7W'&VçD–æFW‚Ò²—FV×2æÆVæwF‚’R—FV×2æÆVæwF…Óòæfö7W2‚¢ÒVÇ6R–b†WfVçBæ¶W’ÓÓÒ$†öÖR"’°¢WfVçBç&WfVçDFVfVÇB‚¢—FV×5³Óòæfö7W2‚¢ÒVÇ6R–b†WfVçBæ¶W’ÓÓÒ$VæB"’°¢WfVçBç&WfVçDFVfVÇB‚¢—FV×2æB‚Ó“òæfö7W2‚¢Ğ¢ÒÂµÒ ¢6öç7B&VÖ÷fTf–ÆRÒ&V7BçW6T6ÆÆ&6²‚†–C¢7G&–ær’Óâ°¢6WDf–ÆW2‚‡&Wb’Óâ&Wbæf–ÇFW"‚†b’Óâbæ–BÓÒ–B’¢ÒÂµÒ ¢6öç7B†æFÆU6VæBÒ&V7BçW6T6ÆÆ&6²‚‚’Óâ°¢6öç7BG&–ÖÖVBÒfÇVRçG&–Ò‚¢–b‚‚G&–ÖÖVBbbf–ÆW2æÆVæwF‚ÓÓÒ’ÇÂF—6&ÆVB’&WGW&à¢–b‡G&–ÖÖVB’öå6VæCòâ‡G&–ÖÖVB¢6WEfÇVR‚""¢6WDf–ÆW2…µÒ¢7F÷G—–ær‚¢–b‡FW‡F&V&Vbæ7W'&VçB’FW‡F&V&Vbæ7W'&VçBç7G–ÆRæ†V–v‡BÒ&WFò ¢ÒÂ·fÇVRÂf–ÆW2ÂF—6&ÆVBÂöå6VæBÂFW‡F&V&VbÂ7F÷G—–æuÒ ¢6öç7B†æFÆT¶W”F÷vâÒ&V7BçW6T6ÆÆ&6²€¢†S¢&V7Bä¶W–&ö&DWfVçB’Óâ°¢†æFÆUG—–æt¶W”F÷vâ‚¢–b†Ræ¶W’ÓÓÒ$VçFW""bbRç6†–gD¶W’’²Rç&WfVçDFVfVÇB‚“²†æFÆU6VæB‚’Ğ¢–b†Ræ¶W’ÓÓÒ$W66R"bb&WÇ––æuFò’öä6æ6VÅ&WÇ“òâ‚¢ÒÀ¢¶†æFÆU6VæBÂ†æFÆUG—–æt¶W”F÷vâÂ&WÇ––æuFòÂöä6æ6VÅ&WÇ•Ğ¢ ¢òò7FRWÆö@¢6öç7B†æFÆU7FRÒ&V7BçW6T6ÆÆ&6²€¢†S¢&V7Bä6Æ—&ö&DWfVçB’Óâ°¢6öç7B—FV×2ÒRæ6Æ—&ö&DFFòæ—FV×0¢–b‚—FV×2’&WGW&à¢6öç7B–ÖvTf–ÆW3¢f–ÆUµÒÒµĞ¢f÷"†6öç7B—FVÒöb'&’æg&öÒ†—FV×2’’°¢–b†—FVÒçG—Rç7F'G5v—F‚‚&–ÖvRò"’’°¢6öç7Bf–ÆRÒ—FVÒævWD4f–ÆR‚¢–b†f–ÆR’–ÖvTf–ÆW2çW6‚†f–ÆR¢Ğ¢Ğ¢–b†–ÖvTf–ÆW2æÆVæwF‚â’°¢FDf–ÆW2†–ÖvTf–ÆW2¢6WE6†÷tGF6„ÖVçR†fÇ6R¢Ğ¢ÒÀ¢¶FDf–ÆW5Ğ¢ ¢òòG&rÖæBÖG&÷†æFÆW'2†öâF†R6ö×÷6W"6öçF–æW"¢6öç7B†æFÆTG&t÷fW"Ò&V7BçW6T6ÆÆ&6²‚†S¢&V7BäG&tWfVçB’Óâ°¢Rç&WfVçDFVfVÇB‚¢6WD—4G&vv–ær‡G'VR¢ÒÂµÒ¢6öç7B†æFÆTG&tÆVfRÒ&V7BçW6T6ÆÆ&6²‚†S¢&V7BäG&tWfVçB’Óâ°¢Rç&WfVçDFVfVÇB‚¢6WD—4G&vv–ær†fÇ6R¢ÒÂµÒ¢6öç7B†æFÆTG&÷Ò&V7BçW6T6ÆÆ&6²€¢†S¢&V7BäG&tWfVçB’Óâ°¢Rç&WfVçDFVfVÇB‚¢6WD—4G&vv–ær†fÇ6R¢–b†RæFFG&ç6fW"æf–ÆW2æÆVæwF‚â’°¢FDf–ÆW2†RæFFG&ç6fW"æf–ÆW2¢6WE6†÷tGF6„ÖVçR†fÇ6R¢Ğ¢ÒÀ¢¶FDf–ÆW5Ğ¢ ¢&WGW&â€¢ÆF—`¢6Æ74æÖS×¶6â‚&6†BÖ6ö×÷6W"7F–6·’&÷GFöÒÓ¢Ó&VÆF—fR"Â6Æ74æÖR—Ğ¢öäG&t÷fW#×¶†æFÆTG&t÷fW'Ğ¢öäG&tÆVfS×¶†æFÆTG&tÆVfWĞ¢öäG&÷×¶†æFÆTG&÷Ğ¢à¢²ò¢G&÷÷fW&Æ’¢÷Ğ¢¶—4G&vv–ærbb€¢ÆF—b6Æ74æÖSÒ&6†BÖG&÷Ö÷fW&Æ’#à¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚Ö6öÂ—FV×2Ö6VçFW"vÓ"#à¢ÅWÆöB6Æ74æÖSÒ'6—¦RÓ‚FW‡BÕ·f"‚ÒÖ6†BÖ66VçB•Ò"óà¢Ç7â6Æ74æÖSÒ'FW‡BÕ³G…ÒföçBÖÖVF—VÒFW‡BÕ·f"‚ÒÖ6†BÖ66VçB•Ò#äG&÷f–ÆW2FòWÆöCÂ÷7ãà¢ÂöF—cà¢ÂöF—cà¢—Ğ ¢²ò¢&WÇ’&Wf–Wr&"¢÷Ğ¢·&WÇ––æuFòbb€¢Ä6†E&WÇ•&Wf–Wr&WÇ––æuFó×·&WÇ––æuF÷Òöä6æ6VÃ×²‚’Óâöä6æ6VÅ&WÇ“òâ‚—Òóà¢—Ğ ¢¶GF6†ÖVçDW'&÷"bb€¢ÆF—b&öÆSÒ&ÆW'B"6Æ74æÖSÒ&&÷&FW"×B&÷&FW"Õ·f"‚ÒÖ6†BÖ&÷&FW"•Ò&rÕ·f"‚ÒÖ6†BÖ&rÖ6ö×÷6W"•Ò‚ÓB’Ó"FW‡BÕ³7…ÒföçBÖÖVF—VÒFW‡BÕ·f"‚ÒÖ6†B×&VB•Ò#à¢¶GF6†ÖVçDW'&÷'Ğ¢ÂöF—cà¢—Ğ ¢²ò¢f–ÆR&Wf–Wr7G&—¢÷Ğ¢¶f–ÆW2æÆVæwF‚âbb€¢ÆF—b6Æ74æÖSÒ&fÆW‚vÓ2÷fW&fÆ÷r×‚ÖWFò&÷&FW"×B&÷&FW"Õ·f"‚ÒÖ6†BÖ&÷&FW"•Ò&rÕ·f"‚ÒÖ6†BÖ&rÖ6ö×÷6W"•Ò‚ÓBBÓ2"Ó"&6¶G&÷Ö&ÇW"Õ³#…Ò#à¢¶f–ÆW2æÖ‚†b’Óâ€¢Ä6†Df–ÆU&Wf–Wr¶W“×¶bæ–GÒ—FVÓ×¶gÒöå&VÖ÷fS×²‚’Óâ&VÖ÷fTf–ÆR†bæ–B—Òóà¢’—Ğ¢ÂöF—cà¢—Ğ ¢²ò¢6ö×÷6W"&öG’(	Bg&÷7FVBvÆ72¢÷Ğ¢ÆF—b6Æ74æÖSÒ&&÷&FW"×B&÷&FW"Õ·f"‚ÒÖ6†BÖ&÷&FW"•Ò&rÕ·f"‚ÒÖ6†BÖ&rÖ6ö×÷6W"•Ò‚Ó2’Ó"&6¶G&÷Ö&ÇW"Õ³#…Ò&6¶G&÷×6GW&FRÕ³ƒUÒ#à¢ÆF—b6Æ74æÖSÒ&×‚ÖWFòÖ‚×rÓ7†Â#à¢·fö–6U&V6÷&F–ærò€¢ÆF—b6Æ74æÖSÒ&fÆW‚Ö–âÖ‚Ó—FV×2Ö6VçFW"vÓ2&÷VæFVBÕ³#'…Ò&÷&FW"&÷&FW"Õ·f"‚ÒÖ6†BÖ&÷&FW"•Ò&rÕ·f"‚ÒÖ6†BÖ&r×6–FV&"•Ò‚Ó2#à¢Æ'WGFöâG—SÒ&'WGFöâ"öä6Æ–6³×¶öåfö–6T6æ6VÇÒF—6&ÆVC×·fö–6T7F–öåVæF–æwÒ6Æ74æÖSÒ&Ö–âÖ‚Ó‚ÓFW‡BÕ³7…ÒföçB×6VÖ–&öÆBFW‡BÕ·f"‚ÒÖ6†B×FW‡B×6V6öæF'’•ÒF—6&ÆVC¦÷6—G’ÓS"&–ÖÆ&VÃÒ$6æ6VÆ"w&f:|:6ò#ä6æ6VÆ#Âö'WGFöãà¢Ç7â6Æ74æÖSÒ&fÆW‚fÆW‚Ó—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"vÓ"FW‡BÕ³G…ÒföçB×6VÖ–&öÆBFW‡BÕ·f"‚ÒÖ6†B×FW‡B×&–Ö'’•Ò#ãÇ7â6Æ74æÖSÒ'6—¦RÓ"&÷VæFVBÖgVÆÂ&r×&VBÓSæ–ÖFR×VÇ6R"óç·fö–6T7F–öåVæF–ærò$Vçf–æFò:VF–ş(
b"¢w&fæFòG·fö–6TGW&F–öäÆ&VÇÖÓÂ÷7ãà¢Æ'WGFöâG—SÒ&'WGFöâ"öä6Æ–6³×¶öåfö–6U6VæGÒF—6&ÆVC×·fö–6T7F–öåVæF–æwÒ6Æ74æÖSÒ&fÆW‚6—¦RÓ—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖgVÆÂ&rÕ·f"‚ÒÖ6†BÖ66VçB•ÒFW‡B×v†—FRF—6&ÆVC¦÷6—G’ÓS"&–ÖÆ&VÃÒ$Vçf–":VF–ò#ãÄ'&÷uW6Æ74æÖSÒ'6—¦RÓB"7G&ö¶Uv–GFƒ×³"ãWÒóãÂö'WGFöãà¢ÂöF—cà¢’¢€¢Ãà¢²ò¢–çWB&÷r¢÷Ğ¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2ÖVæBvÓ"#à¢²ò¢²'WGFöâv—F‚GF6†ÖVçB÷÷WB¢÷Ğ¢ÆF—b&Vc×¶GF6…&ö÷E&VgÒ6Æ74æÖSÒ'&VÆF—fR#à¢Æ'WGFöà¢&Vc×¶GF6…G&–vvW%&VgĞ¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óâ6WE6†÷tGF6„ÖVçR‚6†÷tGF6„ÖVçR—Ğ¢6Æ74æÖS×¶6â€¢&fÆW‚6—¦RÓ—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖgVÆÂ&÷&FW"&÷&FW"Õ·f"‚ÒÖ6†BÖ&÷&FW"•Ò&rÕ·f"‚ÒÖ6†BÖ&r×6–FV&"•ÒFW‡BÕ·f"‚ÒÖ6†B×FW‡B×FW'F–'’•ÒG&ç6—F–öâÖÆÂ†÷fW#¦&rÕ·f"‚ÒÖ6†BÖ66VçB×6ögB•Ò†÷fW#§FW‡BÕ·f"‚ÒÖ6†B×FW‡B×6V6öæF'’•Ò"À¢6†÷tGF6„ÖVçRbb'&÷FFRÓCR&rÕ·f"‚ÒÖ6†BÖ66VçB×6ögB•ÒFW‡BÕ·f"‚ÒÖ6†BÖ66VçB•Ò ¢—Ğ¢&–ÖÆ&VÃ×·6†÷tGF6„ÖVçRò$fV6†"÷:|;VW2FRæW†ò"¢$'&—"÷:|;VW2FRæW†ò'Ğ¢&–Ö†7÷WÒ&ÖVçR ¢&–ÖW‡æFVC×·6†÷tGF6„ÖVçWĞ¢&–Ö6öçG&öÇ3×·6†÷tGF6„ÖVçRòGF6„ÖVçT–B¢VæFVf–æVGĞ¢à¢ÅÇW26Æ74æÖSÒ'6—¦RÓR"óà¢Âö'WGFöãà ¢²ò¢÷÷WBÖVçR¢÷Ğ¢·6†÷tGF6„ÖVçRbb€¢ÆF—b&Vc×¶GF6„ÖVçU&VgÒ–C×¶GF6„ÖVçT–GÒ&öÆSÒ&ÖVçR"&–ÖÆ&VÃÒ$÷:|;VW2FRæW†ò"öä¶W”F÷vã×¶†æFÆTGF6„ÖVçT¶W”F÷vçÒ6Æ74æÖSÒ&6†B×FööÆ&"ÖVçFW"'6öÇWFR&÷GFöÒÖgVÆÂÆVgBÓ¢Ó#Ö"Ó"rÓC‚÷fW&fÆ÷rÖ†–FFVâ&÷VæFVB×†Â&÷&FW"&÷&FW"Õ·f"‚ÒÖ6†BÖ&÷&FW"×7G&öær•Ò&rÕ·f"‚ÒÖ6†BÖ&r×6–FV&"•Ò’Ó6†F÷rÕ·f"‚ÒÖ6†B×6†F÷r×FööÆ&"•Ò#à¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢&öÆSÒ&ÖVçV—FVÒ ¢öä6Æ–6³×²‚’Óâ°¢f–ÆT–çWE&Vbæ7W'&VçCòæ6Æ–6²‚¢6WE6†÷tGF6„ÖVçR†fÇ6R¢v–æF÷rç&WVW7Dæ–ÖF–öäg&ÖR‚‚’ÓâGF6…G&–vvW%&Vbæ7W'&VçCòæfö7W2‚’¢×Ğ¢6Æ74æÖSÒ&fÆW‚Ö–âÖ‚ÓrÖgVÆÂ—FV×2Ö6VçFW"vÓ"ãR‚Ó2’Ó"FW‡BÕ³7…ÒFW‡BÕ·f"‚ÒÖ6†B×FW‡B×6V6öæF'’•ÒG&ç6—F–öâÖ6öÆ÷'2†÷fW#¦&rÕ·f"‚ÒÖ6†BÖ66VçB×6ögB•Ò†÷fW#§FW‡BÕ·f"‚ÒÖ6†B×FW‡B×&–Ö'’•Ò ¢à¢ÅW&6Æ—6Æ74æÖSÒ'6—¦RÓB"óà¢æW†"'V—fğ¢Âö'WGFöãà¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢&öÆSÒ&ÖVçV—FVÒ ¢öä6Æ–6³×²‚’Óâ°¢–ÖvT–çWE&Vbæ7W'&VçCòæ6Æ–6²‚¢6WE6†÷tGF6„ÖVçR†fÇ6R¢v–æF÷rç&WVW7Dæ–ÖF–öäg&ÖR‚‚’ÓâGF6…G&–vvW%&Vbæ7W'&VçCòæfö7W2‚’¢×Ğ¢6Æ74æÖSÒ&fÆW‚Ö–âÖ‚ÓrÖgVÆÂ—FV×2Ö6VçFW"vÓ"ãR‚Ó2’Ó"FW‡BÕ³7…ÒFW‡BÕ·f"‚ÒÖ6†B×FW‡B×6V6öæF'’•ÒG&ç6—F–öâÖ6öÆ÷'2†÷fW#¦&rÕ·f"‚ÒÖ6†BÖ66VçB×6ögB•Ò†÷fW#§FW‡BÕ·f"‚ÒÖ6†B×FW‡B×&–Ö'’•Ò ¢à¢Ä–ÖvT–6öâ6Æ74æÖSÒ'6—¦RÓB"óà¢f÷Fò÷Rl:ÖFVğ¢Âö'WGFöãà¢ÂöF—cà¢—Ğ¢ÂöF—cà ¢²ò¢†–FFVâf–ÆR–çWG2¢÷Ğ¢Æ–çWB&Vc×¶f–ÆT–çWE&VgÒG—SÒ&f–ÆR"×VÇF—ÆR6Æ74æÖSÒ&†–FFVâ"öä6†ævS×²†R’Óâ²–b†RçF&vWBæf–ÆW2’FDf–ÆW2†RçF&vWBæf–ÆW2“²RçF&vWBçfÇVRÒ""×Òóà¢Æ–çWB&Vc×¶–ÖvT–çWE&VgÒG—SÒ&f–ÆR"66WCÒ&–ÖvRò¢"×VÇF—ÆR6Æ74æÖSÒ&†–FFVâ"öä6†ævS×²†R’Óâ²–b†RçF&vWBæf–ÆW2’FDf–ÆW2†RçF&vWBæf–ÆW2“²RçF&vWBçfÇVRÒ""×Òóà ¢ÆF—b6Æ74æÖSÒ'&VÆF—fRfÆW‚fÆW‚Ó—FV×2ÖVæB&÷VæFVBÕ³#'…Ò&÷&FW"&÷&FW"Õ·f"‚ÒÖ6†BÖ&÷&FW"•Ò&rÕ·f"‚ÒÖ6†BÖ&r×6–FV&"•Ò#à¢ÇFW‡F&V¢&Vc×·FW‡F&V&VgĞ¢fÇVS×·fÇVWĞ¢öä6†ævS×²†R’Óâ²6WEfÇVR†RçF&vWBçfÇVR“²&W6—¦R‚’×Ğ¢öä¶W”F÷vã×¶†æFÆT¶W”F÷vçĞ¢öå7FS×¶†æFÆU7FWĞ¢Æ6V†öÆFW#×·Æ6V†öÆFW'Ğ¢F—6&ÆVC×¶F—6&ÆVGĞ¢&÷w3×³Ğ¢6Æ74æÖSÒ&fÆW‚Ó&W6—¦RÖæöæR&r×G&ç7&VçB’Õ³…ÒÂÓB"Ó"FW‡BÕ³g…ÒÆVF–ærÕ³#'…ÒG&6¶–ærÕ²ÓãVÕÒFW‡BÕ·f"‚ÒÖ6†B×FW‡B×&–Ö'’•ÒÆ6V†öÆFW#§FW‡BÕ·f"‚ÒÖ6†B×FW‡B×FW'F–'’•Òfö7W3¦÷WFÆ–æRÖæöæRF—6&ÆVC¦÷6—G’ÓS ¢7G–ÆS×·²÷fW&fÆ÷s¢&†–FFVâ"ÂÖ„†V–v‡C¢#c‚"×Ğ¢óà ¢²†46öçFVçBbböåfö–6U&V6÷&Bò€¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×¶öåfö–6U&V6÷&GĞ¢F—6&ÆVC×¶F—6&ÆVGĞ¢6Æ74æÖSÒ&'6öÇWFR&÷GFöÒÓ&–v‡BÓfÆW‚6—¦RÓ—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖgVÆÂFW‡BÕ·f"‚ÒÖ6†B×FW‡B×FW'F–'’•ÒG&ç6—F–öâÖ6öÆ÷'2†÷fW#§FW‡BÕ·f"‚ÒÖ6†BÖ66VçB•Ò ¢&–ÖÆ&VÃÒ$w&f"ÖVç6vVÒFR:VF–ò ¢à¢ÄÖ–26Æ74æÖSÒ'6—¦RÓB"7G&ö¶Uv–GFƒ×³"ãWÒóà¢Âö'WGFöãà¢’¢€¢Æ'WGFöà¢G—SÒ&'WGFöâ ¢öä6Æ–6³×¶†æFÆU6VæGĞ¢F—6&ÆVC×²†46öçFVçBÇÂF—6&ÆVGĞ¢6Æ74æÖS×¶6â€¢&'6öÇWFR&÷GFöÒÓ&–v‡BÓfÆW‚6—¦RÓ—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖgVÆÂG&ç6—F–öâÖÆÂGW&F–öâÓ#"À¢†46öçFVç@¢ò&&rÕ·f"‚ÒÖ6†BÖ66VçB•ÒFW‡B×v†—FR†÷fW#§66ÆRÓR7F—fS§66ÆRÓ“R ¢¢&&r×G&ç7&VçBFW‡BÕ·f"‚ÒÖ6†B×FW‡B×FW'F–'’•Ò ¢—Ğ¢&–ÖÆ&VÃÒ$Vçf–"ÖVç6vVÒ ¢à¢Ä'&÷uW6Æ74æÖSÒ'6—¦RÓB"7G&ö¶Uv–GFƒ×³"ãWÒóà¢Âö'WGFöãà¢—Ğ¢ÂöF—cà¢ÂöF—cà¢Âóà¢—Ğ¢ÂöF—cà¢ÂöF—cà¢ÂöF—cà¢§Ğ ¢òò)H)H)HW‡÷'G2)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H  ¦W‡÷'B°¢6†E&÷f–FW"À¢6†DÖW76vRÀ¢6†DÖW76vTw&÷WÀ¢6†DFFU6W&F÷"À¢6†E7—7FVÔÖW76vRÀ¢6†DÖW76vW2À¢6†D6ö×÷6W"À¢6†DÖW76vU7FGW2À¢6†DÖW76vU&V7F–öç2À¢6†DÖW76vT7F–öç2À¢6†DÖW76vU&WÇ’À¢6†EG—–æt–æF–6F÷"À¢6†E&WÇ•&Wf–WrÀ¢6†E&VE&V6V—G2À§Ğ¦W‡÷'BG—R°¢6†E&÷f–FW%&÷2À¢6†DÖW76vU&÷2À¢6†DÖW76vTw&÷W&÷2À¢6†DFFU6W&F÷%&÷2À¢6†E7—7FVÔÖW76vU&÷2À¢6†DÖW76vW5&÷2À¢6†D6ö×÷6W%&÷2À¢6†DÖW76vT7F–öç5&÷2À¢6†EG—–æt–æF–6F÷%&÷2À¢6†E&WÇ•&Wf–Wu&÷2À§Ğ