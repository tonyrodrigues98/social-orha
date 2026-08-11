"use client"

import * as React from "react"
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
  Smile,
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
      <div data-chat-theme={theme} style={style} className={className}>
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
        "chat-toolbar-enter absolute -top-3 z-10 flex items-center gap-0.5 rounded-lg border border-[var(--chat-border-strong)] bg-[var(--chat-bg-sidebar)] p-0.5 opacity-0 shadow-[var(--chat-shadow-toolbar)] transition-opacity group-hover/message:opacity-100",
        isOutgoing ? "right-0" : "left-10"
      )}
    >
      {/* Reply */}
      <button
        onClick={() => onReply?.(message)}
        className="flex size-7 items-center justify-center rounded-md text-[var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-accent-soft)] hover:text-[var(--chat-text-primary)]"
        aria-label="Reply"
      >
        <Reply className="size-3.5" />
      </button>

      {/* React â€” opens quick picker */}
      <div className="relative">
        <button
          onClick={() => setShowReactions(!showReactions)}
          className="flex size-7 items-center justify-center rounded-md text-[var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-accent-soft)] hover:text-[var(--chat-text-primary)]"
          aria-label="Add reaction"
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
          onClick={() => setShowMore(!showMore)}
          className="flex size-7 items-center justify-center rounded-md text-[var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-accent-soft)] hover:text-[var(--chat-text-primary)]"
          aria-label="More actions"
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
                onClick={() => {
                  onEdit?.(message)
                  setShowMore(false)
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-accent-soft)] hover:text-[var(--chat-text-primary)]"
              >
                <Pencil className="size-3.5" />
                Edit
              </button>
            )}
            <button
              onClick={() => {
                onPin?.(message.id)
                setShowMore(false)
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-accent-soft)] hover:text-[var(--chat-text-primary)]"
            >
              <Pin className="size-3.5" />
              {message.isPinned ? "Unpin" : "Pin"}
            </button>
            {isOutgoing && (
              <button
                onClick={() => {
                  onDelete?.(message.id)
                  setShowMore(false)
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--chat-red)] transition-colors hover:bg-red-500/10"
              >
                <Trash2 className="size-3.5" />
                Delete
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
  const progressRef = React.useRef(0)

  React.useEffect(() => {
    progressRef.current = progress
  }, [progress])

  const totalMins = Math.floor(voice.duration / 60)
  const totalSecs = Math.floor(voice.duration % 60)
  const elapsed = progress * voice.duration
  const elapsedMins = Math.floor(elapsed / 60)
  const elapsedSecs = Math.floor(elapsed % 60)
  const timeLabel = playing || progress > 0
    ? `${elapsedMins}:${elapsedSecs.toString().padStart(2, "0")}`
    : `${totalMins}:${totalSecs.toString().padStart(2, "0")}`

  const progressIndex = Math.floor(progress * voice.waveform.length)

  React.useEffect(() => {
    if (!playing) return
    const fps = 20
    const step = 1 / (voice.duration * fps)
    const id = setInterval(() => {
      const next = progressRef.current + step
      if (next >= 1) {
        setProgress(0)
        setPlaying(false)
        clearInterval(id)
      } else {
        setProgress(next)
      }
    }, 1000 / fps)
    return () => clearInterval(id)
  }, [playing, voice.duration])

  const toggle = () => {
    if (!playing && progress === 0) setProgress(0)
    setPlaying((p) => !p)
  }

  return (
    <div className="mt-1.5 flex items-center gap-3">
      <button
        onClick={toggle}
        className="flex w-9 h-9 shrink-0 items-center justify-center rounded-full transition-colors"
        style={{ background: isOutgoing ? "rgba(255,255,255,0.20)" : "var(--chat-accent)" }}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
      >
        {playing ? (
          <Pause className="w-4 h-4" style={{ color: "white" }} fill="white" />
        ) : (
          <Play className="w-4 h-4 ml-0.5" style={{ color: "white" }} fill="white" />
        )}
      </button>
      <div className="flex flex-1 items-center gap-[2px] h-8">
        {voice.waveform.map((v, i) => {
          const played = i < progressIndex
          return (
            <div
              key={i}
              className="w-[3px] rounded-full transition-opacity"
              style={{
                height: `${v * 100}%`,
                background: isOutgoing ? "white" : "var(--chat-accent)",
                opacity: played ? 1 : 0.6 + v * 0.4,
                ...(isOutgoing && !played ? { opacity: 0.4 + v * 0.3 } : {}),
              }}
            />
          )
        })}
      </div>
      <span className="text-[12px] shrink-0 opacity-60 tabular-nums">{timeLabel}</span>
    </div>
  )
}

function ChatMessage({
  message,
  isOutgoing,
  position,
  showSender = false,
  showAvatar = false,
  className,
}: ChatMessageProps) {
  const timestamp = new Date(message.timestamp)
  const { currentUser } = useChatContext()
  const radiusClass = getBubbleRadius(isOutgoing, position)
  const [lightboxImage, setLightboxImage] = React.useState<string | null>(null)

  return (
    <div
      className={cn(
        "chat-message group/message relative flex items-end gap-2",
        isOutgoing ? "flex-row-reverse" : "flex-row",
        position === "first" || position === "solo" ? "mt-4" : "mt-0.5",
        className
      )}
    >
      {/* Avatar slot â€” 32px, only for incoming, only on last/solo */}
      {!isOutgoing ? (
        <div className="w-8 shrink-0">
          {showAvatar && message.senderAvatar ? (
            <img
              src={message.senderAvatar}
              alt={message.senderName}
              className="size-8 rounded-full object-cover"
            />
          ) : showAvatar ? (
            <div className="flex size-8 items-center justify-center rounded-full bg-[var(--chat-bubble-incoming)] text-[11px] font-semibold text-[var(--chat-text-secondary)]">
              {message.senderName.charAt(0).toUpperCase()}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Bubble + reactions column */}
      <div className="flex max-w-[75%] flex-col">
        {/* Sender name â€” only first in group, incoming */}
        {showSender && !isOutgoing && (
          <span className="mb-0.5 ml-3 text-[14px] font-semibold leading-tight tracking-[-0.01em] text-[var(--chat-text-secondary)]">
            {message.senderName}
          </span>
        )}

        {/* Bubble â€” relative for hover toolbar positioning */}
        <div className="relative">
          {/* Hover actions toolbar */}
          <ChatMessageActions message={message} isOutgoing={isOutgoing} />

          <div
            className={cn(
              "chat-bubble relative px-3.5 py-2",
              isOutgoing
                ? "bg-[var(--chat-bubble-outgoing)] text-[var(--chat-bubble-outgoing-text)]ë®´¶‰žËkºwµç@€€€€€€€€€€€€ñ¡…ÑMåÍÑ•µ5•ÍÍ…”(€€€€€€€€€€€€€€€€€€€­•äõí¥Ñ•´¹µ•ÍÍ…”¹¥‘ô(€€€€€€€€€€€€€€€€€€€µ•ÍÍ…”õí¥Ñ•´¹µ•ÍÍ…•ô(€€€€€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€€€€€¤(€€€€€€€€€€€€€…Í”€‰É½ÕÀˆè(€€€€€€€€€€€€€€€É•ÑÕÉ¸€ (€€€€€€€€€€€€€€€€€€ñ¡…Ñ5•ÍÍ…•É½ÕÀ(€€€€€€€€€€€€€€€€€€€­•äõíÉ½ÕÀ´‘í¥Ñ•´¹É½ÕÀ¹µ•ÍÍ…•ÍlÁt¹¥‘õô(€€€€€€€€€€€€€€€€€€€É½ÕÀõí¥Ñ•´¹É½ÕÁô(€€€€€€€€€€€€€€€€€€¼ø(€€€€€€€€€€€€€€€€¤(€€€€€€€€€€€ô(€€€€€€€€€ô¥ô((€€€€€€€€€ì¼¨QåÁ¥¹œ¥¹‘¥…Ñ½È…ÐÑ¡”‰½ÑÑ½´€¨½ô(€€€€€€€€€íÑåÁ¥¹UÍ•ÉÌ¹±•¹Ñ €ø€À€˜˜€ (€€€€€€€€€€€€ñ¡…ÑQåÁ¥¹%¹‘¥…Ñ½ÈÕÍ•ÉÌõíÑåÁ¥¹UÍ•ÉÍô€¼ø(€€€€€€€€€€¥ô(€€€€€€€€ð½‘¥Øø(€€€€€€ð½‘¥Øø((€€€€€ì¼¨MÉ½±°µÑ¼µ‰½ÑÑ½´Ý¥Ñ Õ¹É•…‰…‘”€¨½ô(€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€½¹±¥¬õì ¤€ôøÍÉ½±±Q½	½ÑÑ½´ ‰Íµ½½Ñ ˆ¥ô(€€€€€€€±…ÍÍ9…µ”õí¸ (€€€€€€€€€€‰…‰Í½±ÕÑ”‰½ÑÑ½´´ÐÉ¥¡Ð´Ðè´Ô™±•àÍ¥é”´ÄÀ¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•ÈÉ½Õ¹‘•µ™Õ±°‰½É‘•È‰½É‘•ÈµmÙ…È ´µ¡…Ðµ‰½É‘•ÈµÍÑÉ½¹œ¥t‰œµmÙ…È ´µ¡…Ðµ‰œµµ…¥¸¥tÍ¡…‘½ÜµmÙ…È ´µ¡…ÐµÍ¡…‘½Üµµ¥tÑÉ…¹Í¥Ñ¥½¸µ…±°‘ÕÉ…Ñ¥½¸´ÈÀÀˆ°(€€€€€€€€€¥ÍÑ	½ÑÑ½´(€€€€€€€€€€€€ü€‰Á½¥¹Ñ•Èµ•Ù•¹ÑÌµ¹½¹”ÑÉ…¹Í±…Ñ”µä´È½Á…¥Ñä´Àˆ(€€€€€€€€€€€€è€‰ÑÉ…¹Í±…Ñ”µä´À½Á…¥Ñä´ÄÀÀˆ(€€€€€€€€¥ô(€€€€€€€…É¥„µ±…‰•°õì(€€€€€€€€€Õ¹Í••¹½Õ¹Ð€ø€À(€€€€€€€€€€€€ü€‘íÕ¹Í••¹½Õ¹Ñô¹•Üµ•ÍÍ…•Ì°ÍÉ½±°Ñ¼‰½ÑÑ½µ€(€€€€€€€€€€€€è€‰MÉ½±°Ñ¼‰½ÑÑ½´ˆ(€€€€€€€ô(€€€€€€ø(€€€€€€€€ñ¡•ÙÉ½¹½Ý¸±…ÍÍ9…µ”ô‰Í¥é”µlÄáÁátÑ•áÐµmÙ…È ´µ¡…ÐµÑ•áÐµÍ•½¹‘…Éä¥tˆ€¼ø(€€€€€€€ì¼¨U¹É•…‰…‘”€¨½ô(€€€€€€€íÕ¹Í••¹½Õ¹Ð€ø€À€˜˜€ (€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰…‰Í½±ÕÑ”€µÑ½À´Ä€µÉ¥¡Ð´Ä™±•àÍ¥é”µlÄáÁát¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•ÈÉ½Õ¹‘•µ™Õ±°‰œµmÙ…È ´µ¡…Ðµ…•¹Ð¥tÑ•áÐµlÄÅÁát™½¹Ðµ‰½±Ñ•áÐµÝ¡¥Ñ”Ñ…‰Õ±…Èµ¹ÕµÌˆø(€€€€€€€€€€€íÕ¹Í••¹½Õ¹Ð€ø€ää€ü€ˆää¬ˆ€èÕ¹Í••¹½Õ¹Ñô(€€€€€€€€€€ð½ÍÁ…¸ø(€€€€€€€€¥ô(€€€€€€ð½‰ÕÑÑ½¸ø(€€€€ð½‘¥Øø(€€¤)ô((¼¼ƒŠRŠRŠR ¥±”ÁÉ•Ù¥•Ü¥Ñ•´ƒŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠR ()¥¹Ñ•É™…”¥±•AÉ•Ù¥•Ý%Ñ•´ì(€™¥±”è¥±”(€¥èÍÑÉ¥¹œ(€ÁÉ•Ù¥•ÜüèÍÑÉ¥¹œ€¼¼‘…Ñ„UI0™½È¥µ…•Ì(€ÁÉ½É•ÍÌüè¹Õµ‰•È€¼¼€À´ÄÀÀ)ô()™Õ¹Ñ¥½¸¡…Ñ¥±•AÉ•Ù¥•Ü¡ì(€¥Ñ•´°(€½¹I•µ½Ù”°)ôèì(€¥Ñ•´è¥±•AÉ•Ù¥•Ý%Ñ•´(€½¹I•µ½Ù”è€ ¤€ôøÙ½¥)ô¤ì(€½¹ÍÐ¥Í%µ…”€ô¥Ñ•´¹™¥±”¹ÑåÁ”¹ÍÑ…ÉÑÍ]¥Ñ  ‰¥µ…”¼ˆ¤((€É•ÑÕÉ¸€ (€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É•±…Ñ¥Ù”Í¡É¥¹¬´ÀÉ½Õ¹‘•µ±œ‰½É‘•È‰½É‘•ÈµmÙ…È ´µ¡…Ðµ‰½É‘•ÈµÍÑÉ½¹œ¥t‰œµmÙ…È ´µ¡…Ðµ‰œµÍ¥‘•‰…È¥tˆø(€€€€€í¥Í%µ…”€˜˜¥Ñ•´¹ÁÉ•Ù¥•Ü€ü€ (€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É•±…Ñ¥Ù”Í¥é”´ÄÐ½Ù•É™±½Üµ¡¥‘‘•¸É½Õ¹‘•µ±œˆø(€€€€€€€€€€ñ¥µœÍÉŒõí¥Ñ•´¹ÁÉ•Ù¥•Ýô…±Ðõí¥Ñ•´¹™¥±”¹¹…µ•ô±…ÍÍ9…µ”ô‰Í¥é”µ™Õ±°½‰©•Ðµ½Ù•Èˆ€¼ø(€€€€€€€€ð½‘¥Øø(€€€€€€¤€è€ (€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È…À´ÈÁà´ÌÁä´Èˆø(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•àÍ¥é”´à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•ÈÉ½Õ¹‘•µµ‰œµmÙ…È ´µ¡…Ðµ…•¹ÐµÍ½™Ð¥tˆø(€€€€€€€€€€€€ñA…Á•É±¥À±…ÍÍ9…µ”ô‰Í¥é”´Ì¸ÔÑ•áÐµmÙ…È ´µ¡…Ðµ…•¹Ð¥tˆ€¼ø(€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µ¥¸µÜ´Àˆø(€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰µ…àµÜµlÄÈÁÁátÑÉÕ¹…Ñ”Ñ•áÐµlÄÉÁát™½¹Ðµµ•‘¥Õ´Ñ•áÐµmÙ…È ´µ¡…ÐµÑ•áÐµÁÉ¥µ…Éä¥tˆùí¥Ñ•´¹™¥±”¹¹…µ•ôð½Àø(€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áÐµlÄÁÁátÑ•áÐµmÙ…È ´µ¡…ÐµÑ•áÐµÑ•ÉÑ¥…Éä¥tˆùì¡¥Ñ•´¹™¥±”¹Í¥é”€¼€ÄÀÈÐ¤¹Ñ½¥á• À¥ô-ð½Àø(€€€€€€€€€€ð½‘¥Øø(€€€€€€€€ð½‘¥Øø(€€€€€€¥ô(€€€€€ì¼¨AÉ½É•ÍÌ‰…È€¨½ô(€€€€€í¥Ñ•´¹ÁÉ½É•ÍÌ€„ôôÕ¹‘•™¥¹•€˜˜¥Ñ•´¹ÁÉ½É•ÍÌ€ð€ÄÀÀ€˜˜€ (€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…‰Í½±ÕÑ”‰½ÑÑ½´´À±•™Ð´À µlÍÁátÜµ™Õ±°‰œµmÙ…È ´µ¡…Ðµ‰½É‘•È¥tˆø(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ µ™Õ±°‰œµmÙ…È ´µ¡…Ðµ…•¹Ð¥tÑÉ…¹Í¥Ñ¥½¸µ…±°ˆÍÑå±”õíìÝ¥‘Ñ è€‘í¥Ñ•´¹ÁÉ½É•ÍÍô•€õô€¼ø(€€€€€€€€ð½‘¥Øø(€€€€€€¥ô(€€€€€ì¼¨I•µ½Ù”‰ÕÑÑ½¸€¨½ô(€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€½¹±¥¬õí½¹I•µ½Ù•ô(€€€€€€€±…ÍÍ9…µ”ô‰…‰Í½±ÕÑ”€µÑ½À´Ä¸Ô€µÉ¥¡Ð´Ä¸Ô™±•àÍ¥é”´Ô¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•ÈÉ½Õ¹‘•µ™Õ±°‰½É‘•È‰½É‘•ÈµmÙ…È ´µ¡…Ðµ‰½É‘•ÈµÍÑÉ½¹œ¥t‰œµmÙ…È ´µ¡…Ðµ‰œµÍ¥‘•‰…È¥tÑ•áÐµmÙ…È ´µ¡…ÐµÑ•áÐµÍ•½¹‘…Éä¥tÍ¡…‘½ÜµÍ´¡½Ù•Èé‰œµmÙ…È ´µ¡…Ðµ‰œµ¡½Ù•È¥t¡½Ù•ÈéÑ•áÐµmÙ…È ´µ¡…ÐµÑ•áÐµÁÉ¥µ…Éä¥tˆ(€€€€€€€…É¥„µ±…‰•°ô‰I•µ½Ù”™¥±”ˆ(€€€€€€ø(€€€€€€€€ñ`±…ÍÍ9…µ”ô‰Í¥é”´Ìˆ€¼ø(€€€€€€ð½‰ÕÑÑ½¸ø(€€€€ð½‘¥Øø(€€¤)ô((¼¼ƒŠRŠRŠR ¡…Ñ½µÁ½Í•ÈƒŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠR ()¥¹Ñ•É™…”¡…Ñ½µÁ½Í•ÉAÉ½ÁÌì(€½¹M•¹üè€¡Ñ•áÐèÍÑÉ¥¹œ¤€ôøÙ½¥(€½¹QåÁ¥¹œüè€¡¥ÍQåÁ¥¹œè‰½½±•…¸¤€ôøÙ½¥(€½¹¥±•UÁ±½…üè€¡™¥±•Ìè¥±•mt¤€ôøÙ½¥(€½¹Y½¥•I•½Éüè€ ¤€ôøÙ½¥(€Á±…•¡½±‘•ÈüèÍÑÉ¥¹œ(€‘¥Í…‰±•üè‰½½±•…¸(€É•Á±å¥¹Q¼üè¡…Ñ5•ÍÍ…•…Ñ„ð¹Õ±°(€½¹…¹•±I•Á±äüè€ ¤€ôøÙ½¥(€±…ÍÍ9…µ”üèÍÑÉ¥¹œ)ô()™Õ¹Ñ¥½¸¡…Ñ½µÁ½Í•È¡ì(€½¹M•¹°(€½¹QåÁ¥¹œ°(€½¹¥±•UÁ±½…°(€½¹Y½¥•I•½É°(€Á±…•¡½±‘•È€ô€‰5•ÍÍ…”ˆ°(€‘¥Í…‰±•€ô™…±Í”°(€É•Á±å¥¹Q¼°(€½¹…¹•±I•Á±ä°(€±…ÍÍ9…µ”°)ôè¡…Ñ½µÁ½Í•ÉAÉ½ÁÌ¤ì(€½¹ÍÐmÙ…±Õ”°Í•ÑY…±Õ•t€ôI•…Ð¹ÕÍ•MÑ…Ñ” ˆˆ¤(€½¹ÍÐm™¥±•Ì°Í•Ñ¥±•Ít€ôI•…Ð¹ÕÍ•MÑ…Ñ”ñ¥±•AÉ•Ù¥•Ý%Ñ•µmtø¡mt¤(€½¹ÍÐm¥ÍÉ…¥¹œ°Í•Ñ%ÍÉ…¥¹t€ôI•…Ð¹ÕÍ•MÑ…Ñ”¡™…±Í”¤(€½¹ÍÐmÍ¡½ÝÑÑ…¡5•¹Ô°Í•ÑM¡½ÝÑÑ…¡5•¹Õt€ôI•…Ð¹ÕÍ•MÑ…Ñ”¡™…±Í”¤(€½¹ÍÐìÑ•áÑ…É•…I•˜°É•Í¥é”ô€ôÕÍ•ÕÑ½I•Í¥é”¡ìµ…áI½ÝÌè€Øô¤(€½¹ÍÐì¡…¹‘±•-•å½Ý¸è¡…¹‘±•QåÁ¥¹-•å½Ý¸°ÍÑ½ÁQåÁ¥¹œô€ô(€€€ÕÍ•QåÁ¥¹%¹‘¥…Ñ½È¡ì½¹QåÁ¥¹¡…¹”è½¹QåÁ¥¹œô¤(€½¹ÍÐ™¥±•%¹ÁÕÑI•˜€ôI•…Ð¹ÕÍ•I•˜ñ!Q51%¹ÁÕÑ±•µ•¹Ðø¡¹Õ±°¤(€½¹ÍÐ¥µ…•%¹ÁÕÑI•˜€ôI•…Ð¹ÕÍ•I•˜ñ!Q51%¹ÁÕÑ±•µ•¹Ðø¡¹Õ±°¤(€½¹ÍÐ¡…Í½¹Ñ•¹Ð€ôÙ…±Õ”¹ÑÉ¥´ ¤¹±•¹Ñ €ø€Àñð™¥±•Ì¹±•¹Ñ €ø€À((€½¹ÍÐ…‘‘¥±•Ì€ôI•…Ð¹ÕÍ•…±±‰…¬ ¡¹•Ý¥±•Ìè¥±•1¥ÍÐð¥±•mt¤€ôøì(€€€½¹ÍÐ…ÉÈ€ôÉÉ…ä¹™É½´¡¹•Ý¥±•Ì¤(€€€½¹ÍÐ¥Ñ•µÌè¥±•AÉ•Ù¥•Ý%Ñ•µmt€ô…ÉÈ¹µ…À ¡˜¤€ôø€¡ì(€€€€€™¥±”è˜°(€€€€€¥è€‘í˜¹¹…µ•ô´‘í…Ñ”¹¹½Ü ¥ô´‘í5…Ñ ¹É…¹‘½´ ¥õ€°(€€€€€ÁÉ½É•ÍÌèÕ¹‘•™¥¹•°(€€€ô¤¤((€€€€¼¼•¹•É…Ñ”¥µ…”ÁÉ•Ù¥•ÝÌ(€€€¥Ñ•µÌ¹™½É…  ¡¥Ñ•´¤€ôøì(€€€€€¥˜€¡¥Ñ•´¹™¥±”¹ÑåÁ”¹ÍÑ…ÉÑÍ]¥Ñ  ‰¥µ…”¼ˆ¤¤ì(€€€€€€€½¹ÍÐÉ•…‘•È€ô¹•Ü¥±•I•…‘•È ¤(€€€€€€€É•…‘•È¹½¹±½…€ô€¡”¤€ôøì(€€€€€€€€€Í•Ñ¥±•Ì ¡ÁÉ•Ø¤€ôø(€€€€€€€€€€€ÁÉ•Ø¹µ…À ¡˜¤€ôø˜¹¥€ôôô¥Ñ•´¹¥€üì€¸¸¹˜°ÁÉ•Ù¥•Üè”¹Ñ…É•Ðü¹É•ÍÕ±Ð…ÌÍÑÉ¥¹œô€è˜¤(€€€€€€€€€€¤(€€€€€€€ô(€€€€€€€É•…‘•È¹É•…‘Í…Ñ…UI0¡¥Ñ•´¹™¥±”¤(€€€€€ô(€€€ô¤((€€€Í•Ñ¥±•Ì ¡ÁÉ•Ø¤€ôøl¸¸¹ÁÉ•Ø°€¸¸¹¥Ñ•µÍt¤(€€€½¹¥±•UÁ±½…ü¸¡…ÉÈ¤(€ô°m½¹¥±•UÁ±½…‘t¤((€½¹ÍÐÉ•µ½Ù•¥±”€ôI•…Ð¹ÕÍ•…±±‰…¬ ¡¥èÍÑÉ¥¹œ¤€ôøì(€€€Í•Ñ¥±•Ì ¡ÁÉ•Ø¤€ôøÁÉ•Ø¹™¥±Ñ•È ¡˜¤€ôø˜¹¥€„ôô¥¤¤(€ô°mt¤((€½¹ÍÐ¡…¹‘±•M•¹€ôI•…Ð¹ÕÍ•…±±‰…¬  ¤€ôøì(€€€½¹ÍÐÑÉ¥µµ•€ôÙ…±Õ”¹ÑÉ¥´ ¤(€€€¥˜€  …ÑÉ¥µµ•€˜˜™¥±•Ì¹±•¹Ñ €ôôô€À¤ñð‘¥Í…‰±•¤É•ÑÕÉ¸(€€€¥˜€¡ÑÉ¥µµ•¤½¹M•¹ü¸¡ÑÉ¥µµ•¤(€€€Í•ÑY…±Õ” ˆˆ¤(€€€Í•Ñ¥±•Ì¡mt¤(€€€ÍÑ½ÁQåÁ¥¹œ ¤(€€€¥˜€¡Ñ•áÑ…É•…I•˜¹ÕÉÉ•¹Ð¤Ñ•áÑ…É•…I•˜¹ÕÉÉ•¹Ð¹ÍÑå±”¹¡•¥¡Ð€ô€‰…ÕÑ¼ˆ(€ô°mÙ…±Õ”°™¥±•Ì°‘¥Í…‰±•°½¹M•¹°Ñ•áÑ…É•…I•˜°ÍÑ½ÁQåÁ¥¹t¤((€½¹ÍÐ¡…¹‘±•-•å½Ý¸€ôI•…Ð¹ÕÍ•…±±‰…¬ (€€€€¡”èI•…Ð¹-•å‰½…É‘Ù•¹Ð¤€ôøì(€€€€€¡…¹‘±•QåÁ¥¹-•å½Ý¸ ¤(€€€€€¥˜€¡”¹­•ä€ôôô€‰¹Ñ•Èˆ€˜˜€…”¹Í¡¥™Ñ-•ä¤ì”¹ÁÉ•Ù•¹Ñ•™…Õ±Ð ¤ì¡…¹‘±•M•¹ ¤ô(€€€€€¥˜€¡”¹­•ä€ôôô€‰Í…Á”ˆ€˜˜É•Á±å¥¹Q¼¤½¹…¹•±I•Á±äü¸ ¤(€€€ô°(€€€m¡…¹‘±•M•¹°¡…¹‘±•QåÁ¥¹-•å½Ý¸°É•Á±å¥¹Q¼°½¹…¹•±I•Á±åt(€€¤((€€¼¼A…ÍÑ”ÕÁ±½…(€½¹ÍÐ¡…¹‘±•A…ÍÑ”€ôI•…Ð¹ÕÍ•…±±‰…¬ (€€€€¡”èI•…Ð¹±¥Á‰½…É‘Ù•¹Ð¤€ôøì(€€€€€½¹ÍÐ¥Ñ•µÌ€ô”¹±¥Á‰½…É‘…Ñ„ü¹¥Ñ•µÌ(€€€€€¥˜€ …¥Ñ•µÌ¤É•ÑÕÉ¸(€€€€€½¹ÍÐ¥µ…•¥±•Ìè¥±•mt€ômt(€€€€€™½È€¡½¹ÍÐ¥Ñ•´½˜ÉÉ…ä¹™É½´¡¥Ñ•µÌ¤¤ì(€€€€€€€¥˜€¡¥Ñ•´¹ÑåÁ”¹ÍÑ…ÉÑÍ]¥Ñ  ‰¥µ…”¼ˆ¤¤ì(€€€€€€€€€½¹ÍÐ™¥±”€ô¥Ñ•´¹•ÑÍ¥±” ¤(€€€€€€€€€¥˜€¡™¥±”¤¥µ…•¥±•Ì¹ÁÕÍ ¡™¥±”¤(€€€€€€€ô(€€€€€ô(€€€€€¥˜€¡¥µ…•¥±•Ì¹±•¹Ñ €ø€À¤ì(€€€€€€€…‘‘¥±•Ì¡¥µ…•¥±•Ì¤(€€€€€€€Í•ÑM¡½ÝÑÑ…¡5•¹Ô¡™…±Í”¤(€€€€€ô(€€€ô°(€€€m…‘‘¥±•Ít(€€¤((€€¼¼É…œµ…¹µ‘É½À¡…¹‘±•ÉÌ€¡½¸Ñ¡”½µÁ½Í•È½¹Ñ…¥¹•È¤(€½¹ÍÐ¡…¹‘±•É…=Ù•È€ôI•…Ð¹ÕÍ•…±±‰…¬ ¡”èI•…Ð¹É…Ù•¹Ð¤€ôøì(€€€”¹ÁÉ•Ù•¹Ñ•™…Õ±Ð ¤(€€€Í•Ñ%ÍÉ…¥¹œ¡ÑÉÕ”¤(€ô°mt¤(€½¹ÍÐ¡…¹‘±•É…1•…Ù”€ôI•…Ð¹ÕÍ•…±±‰…¬ ¡”èI•…Ð¹É…Ù•¹Ð¤€ôøì(€€€”¹ÁÉ•Ù•¹Ñ•™…Õ±Ð ¤(€€€Í•Ñ%ÍÉ…¥¹œ¡™…±Í”¤(€ô°mt¤(€½¹ÍÐ¡…¹‘±•É½À€ôI•…Ð¹ÕÍ•…±±‰…¬ (€€€€¡”èI•…Ð¹É…Ù•¹Ð¤€ôøì(€€€€€”¹ÁÉ•Ù•¹Ñ•™…Õ±Ð ¤(€€€€€Í•Ñ%ÍÉ…¥¹œ¡™…±Í”¤(€€€€€¥˜€¡”¹‘…Ñ…QÉ…¹Í™•È¹™¥±•Ì¹±•¹Ñ €ø€À¤ì(€€€€€€€…‘‘¥±•Ì¡”¹‘…Ñ…QÉ…¹Í™•È¹™¥±•Ì¤(€€€€€€€Í•ÑM¡½ÝÑÑ…¡5•¹Ô¡™…±Í”¤(€€€€€ô(€€€ô°(€€€m…‘‘¥±•Ít(€€¤((€É•ÑÕÉ¸€ (€€€€ñ‘¥Ø(€€€€€±…ÍÍ9…µ”õí¸ ‰¡…Ðµ½µÁ½Í•ÈÍÑ¥­ä‰½ÑÑ½´´Àè´ÄÀÉ•±…Ñ¥Ù”ˆ°±…ÍÍ9…µ”¥ô(€€€€€½¹É…=Ù•Èõí¡…¹‘±•É…=Ù•Éô(€€€€€½¹É…1•…Ù”õí¡…¹‘±•É…1•…Ù•ô(€€€€€½¹É½Àõí¡…¹‘±•É½Áô(€€€€ø(€€€€€ì¼¨É½À½Ù•É±…ä€¨½ô(€€€€€í¥ÍÉ…¥¹œ€˜˜€ (€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰¡…Ðµ‘É½Àµ½Ù•É±…äˆø(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à™±•àµ½°¥Ñ•µÌµ•¹Ñ•È…À´Èˆø(€€€€€€€€€€€€ñUÁ±½…±…ÍÍ9…µ”ô‰Í¥é”´àÑ•áÐµmÙ…È ´µ¡…Ðµ…•¹Ð¥tˆ€¼ø(€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ•áÐµlÄÑÁát™½¹Ðµµ•‘¥Õ´Ñ•áÐµmÙ…È ´µ¡…Ðµ…•¹Ð¥tˆùÉ½À™¥±•ÌÑ¼ÕÁ±½…ð½ÍÁ…¸ø(€€€€€€€€€€ð½‘¥Øø(€€€€€€€€ð½‘¥Øø(€€€€€€¥ô((€€€€€ì¼¨I•Á±äÁÉ•Ù¥•Ü‰…È€¨½ô(€€€€€íÉ•Á±å¥¹Q¼€˜˜€ (€€€€€€€€ñ¡…ÑI•Á±åAÉ•Ù¥•ÜÉ•Á±å¥¹Q¼õíÉ•Á±å¥¹Q½ô½¹…¹•°õì ¤€ôø½¹…¹•±I•Á±äü¸ ¥ô€¼ø(€€€€€€¥ô((€€€€€ì¼¨¥±”ÁÉ•Ù¥•ÜÍÑÉ¥À€¨½ô(€€€€€í™¥±•Ì¹±•¹Ñ €ø€À€˜˜€ (€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à…À´Ì½Ù•É™±½Üµàµ…ÕÑ¼‰½É‘•ÈµÐ‰½É‘•ÈµmÙ…È ´µ¡…Ðµ‰½É‘•È¥t‰œµmÙ…È ´µ¡…Ðµ‰œµ½µÁ½Í•È¥tÁà´ÐÁÐ´ÌÁˆ´È‰…­‘É½Àµ‰±ÕÈµlÈÁÁátˆø(€€€€€€€€€í™¥±•Ì¹µ…À ¡˜¤€ôø€ (€€€€€€€€€€€€ñ¡…Ñ¥±•AÉ•Ù¥•Ü­•äõí˜¹¥‘ô¥Ñ•´õí™ô½¹I•µ½Ù”õì ¤€ôøÉ•µ½Ù•¥±”¡˜¹¥¥ô€¼ø(€€€€€€€€€€¤¥ô(€€€€€€€€ð½‘¥Øø(€€€€€€¥ô((€€€€€ì¼¨½µÁ½Í•È‰½‘äƒŠP™É½ÍÑ•±…ÍÌ€¨½ô(€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰‰½É‘•ÈµÐ‰½É‘•ÈµmÙ…È ´µ¡…Ðµ‰½É‘•È¥t‰œµmÙ…È ´µ¡…Ðµ‰œµ½µÁ½Í•È¥tÁà´ÌÁä´È‰…­‘É½Àµ‰±ÕÈµlÈÁÁát‰…­‘É½ÀµÍ…ÑÕÉ…Ñ”µlÄàÀ•tˆø(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µàµ…ÕÑ¼µ…àµÜ´Íá°ˆø(€€€€€€€€€ì¼¨%¹ÁÕÐÉ½Ü€¨½ô(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹…À´Èˆø(€€€€€€€€€€€ì¼¨€¬‰ÕÑÑ½¸Ý¥Ñ …ÑÑ…¡µ•¹ÐÁ½Á½ÕÐ€¨½ô(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É•±…Ñ¥Ù”ˆø(€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€€€€€½¹±¥¬õì ¤€ôøÍ•ÑM¡½ÝÑÑ…¡5•¹Ô …Í¡½ÝÑÑ…¡5•¹Ô¥ô(€€€€€€€€€€€€€€€±…ÍÍ9…µ”õí¸ (€€€€€€€€€€€€€€€€€€‰™±•àÍ¥é”´ä¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•ÈÉ½Õ¹‘•µ™Õ±°‰½É‘•È‰½É‘•ÈµmÙ…È ´µ¡…Ðµ‰½É‘•È¥t‰œµmÙ…È ´µ¡…Ðµ‰œµÍ¥‘•‰…È¥tÑ•áÐµmÙ…È ´µ¡…ÐµÑ•áÐµÑ•ÉÑ¥…Éä¥tÑÉ…¹Í¥Ñ¥½¸µ…±°¡½Ù•Èé‰œµmÙ…È ´µ¡…Ðµ…•¹ÐµÍ½™Ð¥t¡½Ù•ÈéÑ•áÐµmÙ…È ´µ¡…ÐµÑ•áÐµÍ•½¹‘…Éä¥tˆ°(€€€€€€€€€€€€€€€€€Í¡½ÝÑÑ…¡5•¹Ô€˜˜€‰É½Ñ…Ñ”´ÐÔ‰œµmÙ…È ´µ¡…Ðµ…•¹ÐµÍ½™Ð¥tÑ•áÐµmÙ…È ´µ¡…Ðµ…•¹Ð¥tˆ(€€€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€€€…É¥„µ±…‰•°ô‰ÑÑ…¡µ•¹ÑÌˆ(€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€ñA±ÕÌ±…ÍÍ9…µ”ô‰Í¥é”´Ôˆ€¼ø(€€€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø((€€€€€€€€€€€€€ì¼¨A½Á½ÕÐµ•¹Ô€¨½ô(€€€€€€€€€€€€€íÍ¡½ÝÑÑ…¡5•¹Ô€˜˜€ (€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰¡…ÐµÑ½½±‰…Èµ•¹Ñ•È…‰Í½±ÕÑ”‰½ÑÑ½´µ™Õ±°±•™Ð´Àµˆ´ÈÜ´ÐÐ½Ù•É™±½Üµ¡¥‘‘•¸É½Õ¹‘•µá°‰½É‘•È‰½É‘•ÈµmÙ…È ´µ¡…Ðµ‰½É‘•ÈµÍÑÉ½¹œ¥t‰œµmÙ…È ´µ¡…Ðµ‰œµÍ¥‘•‰…È¥tÁä´ÄÍ¡…‘½ÜµmÙ…È ´µ¡…ÐµÍ¡…‘½ÜµÑ½½±‰…È¥tˆø(€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€€€€€€€€€½¹±¥¬õì ¤€ôøì™¥±•%¹ÁÕÑI•˜¹ÕÉÉ•¹Ðü¹±¥¬ ¤ìÍ•ÑM¡½ÝÑÑ…¡5•¹Ô¡™…±Í”¤õô(€€€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰™±•àÜµ™Õ±°¥Ñ•µÌµ•¹Ñ•È…À´È¸ÔÁà´ÌÁä´ÈÑ•áÐµlÄÍÁátÑ•áÐµmÙ…È ´µ¡…ÐµÑ•áÐµÍ•½¹‘…Éä¥tÑÉ…¹Í¥Ñ¥½¸µ½±½ÉÌ¡½Ù•Èé‰œµmÙ…È ´µ¡…Ðµ…•¹ÐµÍ½™Ð¥t¡½Ù•ÈéÑ•áÐµmÙ…È ´µ¡…ÐµÑ•áÐµÁÉ¥µ…Éä¥tˆ(€€€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€€€ñA…Á•É±¥À±…ÍÍ9…µ”ô‰Í¥é”´Ðˆ€¼ø(€€€€€€€€€€€€€€€€€€€ÑÑ… ™¥±”(€€€€€€€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€€€€€€€€€½¹±¥¬õì ¤€ôøì¥µ…•%¹ÁÕÑI•˜¹ÕÉÉ•¹Ðü¹±¥¬ ¤ìÍ•ÑM¡½ÝÑÑ…¡5•¹Ô¡™…±Í”¤õô(€€€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰™±•àÜµ™Õ±°¥Ñ•µÌµ•¹Ñ•È…À´È¸ÔÁà´ÌÁä´ÈÑ•áÐµlÄÍÁátÑ•áÐµmÙ…È ´µ¡…ÐµÑ•áÐµÍ•½¹‘…Éä¥tÑÉ…¹Í¥Ñ¥½¸µ½±½ÉÌ¡½Ù•Èé‰œµmÙ…È ´µ¡…Ðµ…•¹ÐµÍ½™Ð¥t¡½Ù•ÈéÑ•áÐµmÙ…È ´µ¡…ÐµÑ•áÐµÁÉ¥µ…Éä¥tˆ(€€€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€€€ñ%µ…•%½¸±…ÍÍ9…µ”ô‰Í¥é”´Ðˆ€¼ø(€€€€€€€€€€€€€€€€€€€A¡½Ñ¼½ÈÙ¥‘•¼(€€€€€€€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€€€€€€€€€½¹±¥¬õì ¤€ôøÍ•ÑM¡½ÝÑÑ…¡5•¹Ô¡™…±Í”¥ô(€€€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰™±•àÜµ™Õ±°¥Ñ•µÌµ•¹Ñ•È…À´È¸ÔÁà´ÌÁä´ÈÑ•áÐµlÄÍÁátÑ•áÐµmÙ…È ´µ¡…ÐµÑ•áÐµÍ•½¹‘…Éä¥tÑÉ…¹Í¥Ñ¥½¸µ½±½ÉÌ¡½Ù•Èé‰œµmÙ…È ´µ¡…Ðµ…•¹ÐµÍ½™Ð¥t¡½Ù•ÈéÑ•áÐµmÙ…È ´µ¡…ÐµÑ•áÐµÁÉ¥µ…Éä¥tˆ(€€€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€€€ñMµ¥±”±…ÍÍ9…µ”ô‰Í¥é”´Ðˆ€¼ø(€€€€€€€€€€€€€€€€€€€µ½©¤(€€€€€€€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€ð½‘¥Øø((€€€€€€€€€€€ì¼¨!¥‘‘•¸™¥±”¥¹ÁÕÑÌ€¨½ô(€€€€€€€€€€€€ñ¥¹ÁÕÐÉ•˜õí™¥±•%¹ÁÕÑI•™ôÑåÁ”ô‰™¥±”ˆµÕ±Ñ¥Á±”±…ÍÍ9…µ”ô‰¡¥‘‘•¸ˆ½¹¡…¹”õì¡”¤€ôøì¥˜€¡”¹Ñ…É•Ð¹™¥±•Ì¤…‘‘¥±•Ì¡”¹Ñ…É•Ð¹™¥±•Ì¤ì”¹Ñ…É•Ð¹Ù…±Õ”€ô€ˆˆõô€¼ø(€€€€€€€€€€€€ñ¥¹ÁÕÐÉ•˜õí¥µ…•%¹ÁÕÑI•™ôÑåÁ”ô‰™¥±”ˆ…•ÁÐô‰¥µ…”¼¨ˆµÕ±Ñ¥Á±”±…ÍÍ9…µ”ô‰¡¥‘‘•¸ˆ½¹¡…¹”õì¡”¤€ôøì¥˜€¡”¹Ñ…É•Ð¹™¥±•Ì¤…‘‘¥±•Ì¡”¹Ñ…É•Ð¹™¥±•Ì¤ì”¹Ñ…É•Ð¹Ù…±Õ”€ô€ˆˆõô€¼ø((€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É•±…Ñ¥Ù”™±•à™±•à´Ä¥Ñ•µÌµ•¹É½Õ¹‘•µlÈÉÁát‰½É‘•È‰½É‘•ÈµmÙ…È ´µ¡…Ðµ‰½É‘•È¥t‰œµmÙ…È ´µ¡…Ðµ‰œµÍ¥‘•‰…È¥tˆø(€€€€€€€€€€€€€€ñÑ•áÑ…É•„(€€€€€€€€€€€€€€€É•˜õíÑ•áÑ…É•…I•™ô(€€€€€€€€€€€€€€€Ù…±Õ”õíÙ…±Õ•ô(€€€€€€€€€€€€€€€½¹¡…¹”õì¡”¤€ôøìÍ•ÑY…±Õ”¡”¹Ñ…É•Ð¹Ù…±Õ”¤ìÉ•Í¥é” ¤õô(€€€€€€€€€€€€€€€½¹-•å½Ý¸õí¡…¹‘±•-•å½Ý¹ô(€€€€€€€€€€€€€€€½¹A…ÍÑ”õí¡…¹‘±•A…ÍÑ•ô(€€€€€€€€€€€€€€€Á±…•¡½±‘•ÈõíÁ±…•¡½±‘•Éô(€€€€€€€€€€€€€€€‘¥Í…‰±•õí‘¥Í…‰±•‘ô(€€€€€€€€€€€€€€€É½ÝÌõìÅô(€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰™±•à´ÄÉ•Í¥é”µ¹½¹”‰œµÑÉ…¹ÍÁ…É•¹ÐÁäµlÄÁÁátÁ°´ÐÁÈ´ÄÈÑ•áÐµlÄÕÁát±•…‘¥¹œµlÈÉÁátÑÉ…­¥¹œµl´À¸ÀÅ•µtÑ•áÐµmÙ…È ´µ¡…ÐµÑ•áÐµÁÉ¥µ…Éä¥tÁ±…•¡½±‘•ÈéÑ•áÐµmÙ…È ´µ¡…ÐµÑ•áÐµÑ•ÉÑ¥…Éä¥t™½ÕÌé½ÕÑ±¥¹”µ¹½¹”‘¥Í…‰±•é½Á…¥Ñä´ÔÀˆ(€€€€€€€€€€€€€€€ÍÑå±”õíì½Ù•É™±½Üè€‰¡¥‘‘•¸ˆ°µ…á!•¥¡Ðè€ˆÄØÁÁàˆõô(€€€€€€€€€€€€€€¼ø((€€€€€€€€€€€€€ì…¡…Í½¹Ñ•¹Ð€˜˜½¹Y½¥•I•½É€ü€ (€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€€€€€€€½¹±¥¬õí½¹Y½¥•I•½É‘ô(€€€€€€€€€€€€€€€€€‘¥Í…‰±•õí‘¥Í…‰±•‘ô(€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰…‰Í½±ÕÑ”‰½ÑÑ½´µlÙÁátÉ¥¡ÐµlÙÁát™±•àÍ¥é”´à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•ÈÉ½Õ¹‘•µ™Õ±°Ñ•áÐµmÙ…È ´µ¡…ÐµÑ•áÐµÑ•ÉÑ¥…Éä¥tÑÉ…¹Í¥Ñ¥½¸µ½±½ÉÌ¡½Ù•ÈéÑ•áÐµmÙ…È ´µ¡…Ðµ…•¹Ð¥tˆ(€€€€€€€€€€€€€€€€€…É¥„µ±…‰•°ô‰I•½ÉÙ½¥”µ•ÍÍ…”ˆ(€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€ñ5¥Œ±…ÍÍ9…µ”ô‰Í¥é”´ÐˆÍÑÉ½­•]¥‘Ñ õìÈ¸Õô€¼ø(€€€€€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€¤€è€ (€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€€€€€€€½¹±¥¬õí¡…¹‘±•M•¹‘ô(€€€€€€€€€€€€€€€€€‘¥Í…‰±•õì…¡…Í½¹Ñ•¹Ðñð‘¥Í…‰±•‘ô(€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”õí¸ (€€€€€€€€€€€€€€€€€€€€‰…‰Í½±ÕÑ”‰½ÑÑ½´µlÙÁátÉ¥¡ÐµlÙÁát™±•àÍ¥é”´à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•ÈÉ½Õ¹‘•µ™Õ±°ÑÉ…¹Í¥Ñ¥½¸µ…±°‘ÕÉ…Ñ¥½¸´ÈÀÀˆ°(€€€€€€€€€€€€€€€€€€€¡…Í½¹Ñ•¹Ð(€€€€€€€€€€€€€€€€€€€€€€ü€‰‰œµmÙ…È ´µ¡…Ðµ…•¹Ð¥tÑ•áÐµÝ¡¥Ñ”¡½Ù•ÈéÍ…±”´ÄÀÔ…Ñ¥Ù”éÍ…±”´äÔˆ(€€€€€€€€€€€€€€€€€€€€€€è€‰‰œµÑÉ…¹ÍÁ…É•¹ÐÑ•áÐµmÙ…È ´µ¡…ÐµÑ•áÐµÑ•ÉÑ¥…Éä¥tˆ(€€€€€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€€€€€…É¥„µ±…‰•°ô‰M•¹µ•ÍÍ…”ˆ(€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€ñÉÉ½ÝUÀ±…ÍÍ9…µ”ô‰Í¥é”´ÐˆÍÑÉ½­•]¥‘Ñ õìÈ¸Õô€¼ø(€€€€€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø(€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€ð½‘¥Øø(€€€€€€€€ð½‘¥Øø(€€€€€€ð½‘¥Øø(€€€€ð½‘¥Øø(€€¤)ô((¼¼ƒŠRŠRŠR áÁ½ÉÑÌƒŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠR ()•áÁ½ÉÐì(€¡…ÑAÉ½Ù¥‘•È°(€¡…Ñ5•ÍÍ…”°(€¡…Ñ5•ÍÍ…•É½ÕÀ°(€¡…Ñ…Ñ•M•Á…É…Ñ½È°(€¡…ÑMåÍÑ•µ5•ÍÍ…”°(€¡…Ñ5•ÍÍ…•Ì°(€¡…Ñ½µÁ½Í•È°(€¡…Ñ5•ÍÍ…•MÑ…ÑÕÌ°(€¡…Ñ5•ÍÍ…•I•…Ñ¥½¹Ì°(€¡…Ñ5•ÍÍ…•Ñ¥½¹Ì°(€¡…Ñ5•ÍÍ…•I•Á±ä°(€¡…ÑQåÁ¥¹%¹‘¥…Ñ½È°(€¡…ÑI•Á±åAÉ•Ù¥•Ü°(€¡…ÑI•…‘I••¥ÁÑÌ°)ô)•áÁ½ÉÐÑåÁ”ì(€¡…ÑAÉ½Ù¥‘•ÉAÉ½ÁÌ°(€¡…Ñ5•ÍÍ…•AÉ½ÁÌ°(€¡…Ñ5•ÍÍ…•É½ÕÁAÉ½ÁÌ°(€¡…Ñ…Ñ•M•Á…É…Ñ½ÉAÉ½ÁÌ°(€¡…ÑMåÍÑ•µ5•ÍÍ…•AÉ½ÁÌ°(€¡…Ñ5•ÍÍ…•ÍAÉ½ÁÌ°(€¡…Ñ½µÁ½Í•ÉAÉ½ÁÌ°(€¡…Ñ5•ÍÍ…•Ñ¥½¹ÍAÉ½ÁÌ°(€¡…ÑQåÁ¥¹%¹‘¥…Ñ½ÉAÉ½ÁÌ°(€¡…ÑI•Á±åAÉ•Ù¥•ÝAÉ½ÁÌ°)ô((