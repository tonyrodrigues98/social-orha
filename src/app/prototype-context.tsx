import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ProfileVisibility } from "@/domain/identity";
import { useAuth } from "./auth/auth-context";
import { communities as communitySeed, conversations as conversationSeed, people } from "./prototype-data";
import type { AppSection, CommunityPreview, PersonPreview } from "./types";

export type FavoriteCategory = "movies" | "series" | "songs" | "artists" | "books" | "games";

export type ProfilePreview = {
  fullName: string;
  username: string;
  bio: string;
  coverImage: string | null;
};

export type ConversationPreview = (typeof conversationSeed)[number] & {
  id: string;
  kind: "friend" | "group";
};

export type ChatMessage = {
  id: string;
  author: string;
  content: string;
  mine?: boolean;
  timestamp: number;
  voice?: { url: string; duration: number };
};

export type DrawerView =
  | { type: "search" }
  | { type: "notifications" }
  | { type: "person"; personName: string }
  | { type: "community"; communityName: string }
  | { type: "topic"; topic: string }
  | { type: "explore"; destination: string }
  | { type: "requests" }
  | { type: "conversation"; conversationId: string }
  | { type: "compose"; recipient?: string }
  | { type: "create-community" }
  | { type: "edit-profile" }
  | { type: "privacy" }
  | { type: "favorites"; category: FavoriteCategory }
  | { type: "gallery" };

type PrivacyPreview = {
  profile: ProfileVisibility;
  favorites: ProfileVisibility;
  gallery: ProfileVisibility;
  datingEnabled: boolean;
};

type PrototypeContextValue = {
  navigate: (section: AppSection) => void;
  drawer: DrawerView | null;
  openDrawer: (view: DrawerView) => void;
  closeDrawer: () => void;
  toast: string | null;
  announce: (message: string) => void;
  notificationsUnread: boolean;
  markNotificationsRead: () => void;
  people: readonly PersonPreview[];
  communities: CommunityPreview[];
  joinedCommunityNames: Set<string>;
  addCommunity: (name: string, topic: string) => void;
  toggleCommunity: (name: string) => void;
  conversations: ConversationPreview[];
  conversationMessages: Record<string, ChatMessage[]>;
  openConversation: (conversationId: string) => void;
  sendMessage: (conversationId: string, content: string) => void;
  sendVoiceMessage: (conversationId: string, voice: { url: string; duration: number }) => void;
  startConversation: (recipient: string, firstMessage?: string) => void;
  conversationRequests: string[];
  respondToConversationRequest: (name: string, accepted: boolean) => void;
  profile: ProfilePreview;
  saveProfile: (next: Pick<ProfilePreview, "fullName" | "username" | "bio">) => void;
  setCoverImage: (file: File) => void;
  favorites: Record<FavoriteCategory, string[]>;
  addFavorite: (category: FavoriteCategory, value: string) => void;
  galleryImages: string[];
  addGalleryImages: (files: File[]) => void;
  removeGalleryImage: (url: string) => void;
  privacy: PrivacyPreview;
  savePrivacy: (next: PrivacyPreview) => void;
};

const PrototypeContext = createContext<PrototypeContextValue | null>(null);

function toId(value: string) {
  return value.toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function toLabels(values: unknown[]) {
  return values
    .map((value) => {
      if (typeof value === "string") return value;
      if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return String(record.name ?? record.title ?? "");
      }
      return "";
    })
    .filter(Boolean)
    .slice(0, 5);
}

export function PrototypeProvider({
  children,
  navigate,
  openChat,
}: {
  children: ReactNode;
  navigate: (section: AppSection) => void;
  openChat: (conversationId: string) => void;
}) {
  const { identity } = useAuth();
  const [drawer, setDrawer] = useState<DrawerView | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [notificationsUnread, setNotificationsUnread] = useState(true);
  const toastTimer = useRef<number | null>(null);
  const [communities, setCommunities] = useState<CommunityPreview[]>(() => [...communitySeed]);
  const [joinedCommunityNames, setJoinedCommunityNames] = useState<Set<string>>(() => new Set());
  const [conversations, setConversations] = useState<ConversationPreview[]>(() =>
    conversationSeed.map((conversation) => ({
      ...conversation,
      id: toId(conversation.name),
      kind: conversation.name === "Café, fé e conversa" ? "group" : "friend",
    })),
  );
  const [conversationMessages, setConversationMessages] = useState<Record<string, ChatMessage[]>>(() =>
    Object.fromEntries(
      conversationSeed.map((conversation, index) => {
        const id = toId(conversation.name);
        return [id, [{ id: `${id}-initial`, author: conversation.name, content: conversation.message, timestamp: Date.now() - ((index + 1) * 120000) }]];
      }),
    ),
  );
  const [conversationRequests, setConversationRequests] = useState(["Mateus Lima", "Beatriz Souza"]);
  const [profile, setProfile] = useState<ProfilePreview>(() => ({
    fullName: identity?.profile.full_name || "Seu perfil",
    username: identity?.profile.username || "orha",
    bio: identity?.profile.bio || "Seu espaço para se apresentar à comunidade.",
    coverImage: null,
  }));
  const [favorites, setFavorites] = useState<Record<FavoriteCategory, string[]>>(() => ({
    movies: toLabels(identity?.details.favorite_movies ?? []),
    series: toLabels(identity?.details.favorite_series ?? []),
    songs: toLabels(identity?.details.favorite_songs ?? []),
    artists: toLabels(identity?.details.favorite_artists ?? []),
    books: toLabels(identity?.details.favorite_books ?? []),
    games: toLabels(identity?.details.favorite_games ?? []),
  }));
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [privacy, setPrivacy] = useState<PrivacyPreview>(() => ({
    profile: identity?.privacy.profile_visibility ?? "public",
    favorites: identity?.privacy.favorites_visibility ?? "public",
    gallery: identity?.privacy.gallery_visibility ?? "public",
    datingEnabled: identity?.privacy.dating_enabled ?? false,
  }));

  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
  }, []);

  const announce = useCallback((message: string) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  const openDrawer = useCallback((view: DrawerView) => setDrawer(view), []);
  const closeDrawer = useCallback(() => setDrawer(null), []);
  const markNotificationsRead = useCallback(() => {
    setNotificationsUnread(false);
    announce("Notificações marcadas como lidas.");
  }, [announce]);

  const toggleCommunity = useCallback((name: string) => {
    setJoinedCommunityNames((current) => {
      const next = new Set(current);
      if (next.has(name)) {
        next.delete(name);
        announce(`Você saiu de ${name}.`);
      } else {
        next.add(name);
        announce(`Você entrou em ${name}.`);
      }
      return next;
    });
  }, [announce]);

  const addCommunity = useCallback((name: string, topic: string) => {
    const safeName = name.trim();
    if (!safeName) return;
    setCommunities((current) => [
      { name: safeName, topic: topic.trim() || "Uma nova conversa para a comunidade", members: "1 membro", accent: "#8a7db8" },
      ...current,
    ]);
    setJoinedCommunityNames((current) => new Set(current).add(safeName));
    announce(`${safeName} foi criada para teste.`);
  }, [announce]);

  const openConversation = useCallback((conversationId: string) => {
    setConversations((current) => current.map((conversation) => (
      conversation.id === conversationId ? { ...conversation, unread: 0 } : conversation
    )));
    openChat(conversationId);
  }, [openChat]);

  const sendMessage = useCallback((conversationId: string, content: string) => {
    const message = content.trim();
    if (!message) return;
    setConversationMessages((current) => ({
      ...current,
      [conversationId]: [
        ...(current[conversationId] ?? []),
        { id: `${conversationId}-${Date.now()}`, author: "Você", content: message, mine: true, timestamp: Date.now() },
      ],
    }));
    setConversations((current) => current.map((conversation) => (
      conversation.id === conversationId
        ? { ...conversation, message, time: "agora", unread: 0 }
        : conversation
    )));
  }, []);

  const sendVoiceMessage = useCallback((conversationId: string, voice: { url: string; duration: number }) => {
    setConversationMessages((current) => ({
      ...current,
      [conversationId]: [
        ...(current[conversationId] ?? []),
        { id: `${conversationId}-voice-${Date.now()}`, author: "Você", content: "", mine: true, timestamp: Date.now(), voice },
      ],
    }));
    setConversations((current) => current.map((conversation) => (
      conversation.id === conversationId ? { ...conversation, message: "🎙️ Mensagem de áudio", time: "agora", unread: 0 } : conversation
    )));
  }, []);

  const startConversation = useCallback((recipient: string, firstMessage?: string) => {
    const id = toId(recipient);
    const draft = firstMessage?.trim() || "Olá! Que bom te encontrar por aqui.";
    const exists = conversations.some((conversation) => conversation.id === id);
    if (!exists) {
      const person = people.find((entry) => entry.name === recipient);
      setConversations((current) => [
        {
          id,
          name: recipient,
          initials: person?.initials ?? recipient.slice(0, 2).toUpperCase(),
          message: draft,
          time: "agora",
          unread: 0,
          tone: person?.tone ?? "var(--orha-sky)",
          kind: "friend",
        },
        ...current,
      ]);
      setConversationMessages((current) => ({
        ...current,
        [id]: [{ id: `${id}-first`, author: "Você", content: draft, mine: true, timestamp: Date.now() }],
      }));
    }
    navigate("conversas");
    openChat(id);
    announce(`Conversa com ${recipient} pronta para teste.`);
  }, [announce, conversations, navigate, openChat]);

  const respondToConversationRequest = useCallback((name: string, accepted: boolean) => {
    setConversationRequests((current) => current.filter((request) => request !== name));
    announce(accepted ? `Conversa com ${name} aceita.` : `Solicitação de ${name} recusada.`);
  }, [announce]);

  const saveProfile = useCallback((next: Pick<ProfilePreview, "fullName" | "username" | "bio">) => {
    setProfile((current) => ({ ...current, ...next }));
    announce("Alterações salvas neste teste.");
  }, [announce]);

  const setCoverImage = useCallback((file: File) => {
    setProfile((current) => ({ ...current, coverImage: URL.createObjectURL(file) }));
    announce("Nova capa aplicada neste dispositivo.");
  }, [announce]);

  const addFavorite = useCallback((category: FavoriteCategory, value: string) => {
    const label = value.trim();
    if (!label) return;
    setFavorites((current) => {
      if (current[category].some((item) => item.toLocaleLowerCase() === label.toLocaleLowerCase())) {
        announce("Esse item já está na sua lista.");
        return current;
      }
      if (current[category].length >= 5) {
        announce("O limite de cinco favoritos foi atingido.");
        return current;
      }
      announce(`${label} foi adicionado aos seus favoritos.`);
      return { ...current, [category]: [...current[category], label] };
    });
  }, [announce]);

  const addGalleryImages = useCallback((files: File[]) => {
    const images = files.filter((file) => file.type.startsWith("image/")).map((file) => URL.createObjectURL(file));
    if (!images.length) return;
    setGalleryImages((current) => [...current, ...images].slice(0, 9));
    announce(`${images.length} foto${images.length > 1 ? "s" : ""} adicionada${images.length > 1 ? "s" : ""} à galeria.`);
  }, [announce]);

  const removeGalleryImage = useCallback((url: string) => {
    setGalleryImages((current) => current.filter((image) => image !== url));
    announce("Foto removida da galeria de teste.");
  }, [announce]);

  const savePrivacy = useCallback((next: PrivacyPreview) => {
    setPrivacy(next);
    announce("Preferências de privacidade salvas neste teste.");
  }, [announce]);

  return (
    <PrototypeContext.Provider value={{
      navigate,
      drawer,
      openDrawer,
      closeDrawer,
      toast,
      announce,
      notificationsUnread,
      markNotificationsRead,
      people,
      communities,
      joinedCommunityNames,
      addCommunity,
      toggleCommunity,
      conversations,
      conversationMessages,
      openConversation,
    sendMessage,
    sendVoiceMessage,
      startConversation,
      conversationRequests,
      respondToConversationRequest,
      profile,
      saveProfile,
      setCoverImage,
      favorites,
      addFavorite,
      galleryImages,
      addGalleryImages,
      removeGalleryImage,
      privacy,
      savePrivacy,
    }}>
      {children}
    </PrototypeContext.Provider>
  );
}

export function usePrototype() {
  const context = useContext(PrototypeContext);
  if (!context) throw new Error("usePrototype precisa estar dentro de PrototypeProvider.");
  return context;
}

export const favoriteCategoryLabels: Record<FavoriteCategory, string> = {
  movies: "Filmes",
  series: "Séries",
  songs: "Músicas",
  artists: "Artistas",
  books: "Livros",
  games: "Jogos",
};
