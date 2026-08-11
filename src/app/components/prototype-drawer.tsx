import { useState, type ButtonHTMLAttributes } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Bell,
  Check,
  ChevronRight,
  Heart,
  ImagePlus,
  LockKeyhole,
  MailPlus,
  MessageCircleMore,
  Search,
  Send,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import type { ProfileVisibility } from "@/domain/identity";
import { Drawer } from "@/components/godui/drawer";
import {
  favoriteCategoryLabels,
  type DrawerView,
  type FavoriteCategory,
  usePrototype,
} from "../prototype-context";

const drawerTitles: Record<DrawerView["type"], string> = {
  search: "Pesquisar",
  notifications: "Notificações",
  person: "Conhecer pessoa",
  community: "Comunidade",
  topic: "Conversa da comunidade",
  explore: "Explorar",
  requests: "Solicitações de conversa",
  conversation: "Conversa",
  compose: "Nova conversa",
  "create-community": "Criar comunidade",
  "edit-profile": "Editar perfil",
  privacy: "Privacidade",
  favorites: "Seus favoritos",
  gallery: "Gerenciar galeria",
};

function PanelButton({
  children,
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return <button type="button" className={`prototype-panel-button ${variant} ${className ?? ""}`} {...props}>{children}</button>;
}

export function PrototypeDrawer() {
  const { drawer, closeDrawer, toast } = usePrototype();

  return (
    <>
      <Drawer
        open={Boolean(drawer)}
        onOpenChange={(open) => {
          if (!open) closeDrawer();
        }}
        title={drawer ? drawerTitles[drawer.type] : undefined}
        className="prototype-drawer"
      >
        {drawer ? <DrawerContent view={drawer} /> : null}
      </Drawer>
      <AnimatePresence>
        {toast ? (
          <motion.div
            className="prototype-toast"
            role="status"
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.2 }}
          >
            <Check size={16} aria-hidden />
            {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function DrawerContent({ view }: { view: DrawerView }) {
  switch (view.type) {
    case "search": return <SearchPanel />;
    case "notifications": return <NotificationsPanel />;
    case "person": return <PersonPanel personName={view.personName} />;
    case "community": return <CommunityPanel communityName={view.communityName} />;
    case "topic": return <TopicPanel topic={view.topic} />;
    case "explore": return <ExplorePanel destination={view.destination} />;
    case "requests": return <RequestsPanel />;
    case "conversation": return <ConversationPanel conversationId={view.conversationId} />;
    case "compose": return <ComposePanel recipient={view.recipient} />;
    case "create-community": return <CreateCommunityPanel />;
    case "edit-profile": return <EditProfilePanel />;
    case "privacy": return <PrivacyPanel />;
    case "favorites": return <FavoritesPanel category={view.category} />;
    case "gallery": return <GalleryPanel />;
  }
}

function SearchPanel() {
  const { people, communities, openDrawer, closeDrawer } = usePrototype();
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  const matchingPeople = people.filter((person) => !normalized || `${person.name} ${person.affinity}`.toLocaleLowerCase("pt-BR").includes(normalized));
  const matchingCommunities = communities.filter((community) => !normalized || `${community.name} ${community.topic}`.toLocaleLowerCase("pt-BR").includes(normalized));

  return (
    <section className="prototype-panel">
      <label className="prototype-search-field">
        <Search size={18} aria-hidden />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pessoas, comunidades e interesses" autoFocus />
      </label>
      <p className="prototype-panel-hint">A busca é local para este protótipo. Serviços de busca serão conectados por adapter depois.</p>
      <div className="prototype-result-group">
        <span>PESSOAS</span>
        {matchingPeople.slice(0, 4).map((person) => (
          <button key={person.name} type="button" className="prototype-result-row" onClick={() => openDrawer({ type: "person", personName: person.name })}>
            <i style={{ background: person.tone }}>{person.initials}</i>
            <strong>{person.name}<small>{person.affinity}</small></strong>
            <ChevronRight size={17} />
          </button>
        ))}
      </div>
      <div className="prototype-result-group">
        <span>COMUNIDADES</span>
        {matchingCommunities.slice(0, 4).map((community) => (
          <button key={community.name} type="button" className="prototype-result-row" onClick={() => openDrawer({ type: "community", communityName: community.name })}>
            <i style={{ background: community.accent }}>{community.name.slice(0, 2).toUpperCase()}</i>
            <strong>{community.name}<small>{community.topic}</small></strong>
            <ChevronRight size={17} />
          </button>
        ))}
      </div>
      {!matchingPeople.length && !matchingCommunities.length ? <p className="prototype-empty">Nada encontrado para “{query}”.</p> : null}
      <PanelButton variant="ghost" onClick={closeDrawer}>Fechar busca</PanelButton>
    </section>
  );
}

function NotificationsPanel() {
  const { markNotificationsRead, closeDrawer } = usePrototype();
  return (
    <section className="prototype-panel">
      <div className="prototype-notification"><Bell size={18} /><span><strong>Novas comunidades para você</strong><small>Há sugestões baseadas nos seus interesses.</small></span></div>
      <div className="prototype-notification"><Heart size={18} /><span><strong>Ana Clara respondeu</strong><small>Ela também gosta de música e livros.</small></span></div>
      <div className="prototype-notification"><UsersRound size={18} /><span><strong>Conversa em alta</strong><small>Vida e propósito está movimentada hoje.</small></span></div>
      <PanelButton onClick={() => { markNotificationsRead(); closeDrawer(); }}>Marcar tudo como lido</PanelButton>
    </section>
  );
}

function PersonPanel({ personName }: { personName: string }) {
  const { people, startConversation, announce, closeDrawer } = usePrototype();
  const [requestSent, setRequestSent] = useState(false);
  const person = people.find((entry) => entry.name === personName);
  if (!person) return <p className="prototype-empty">Pessoa indisponível neste teste.</p>;

  return (
    <section className="prototype-panel">
      <div className="prototype-person-hero">
        <span style={{ background: person.tone }}>{person.initials}</span>
        <div><h3>{person.name}</h3><p>{person.detail}</p><b>{person.affinity}</b></div>
      </div>
      <p className="prototype-panel-copy">Vocês têm afinidades em comum. Você pode iniciar uma conversa sem que isso crie amizade automaticamente.</p>
      <PanelButton onClick={() => startConversation(person.name)}>Iniciar conversa</PanelButton>
      <PanelButton variant="secondary" onClick={() => { setRequestSent(true); announce(`Solicitação de amizade enviada para ${person.name}.`); }}>
        <UserPlus size={17} /> {requestSent ? "Solicitação enviada" : "Enviar solicitação de amizade"}
      </PanelButton>
      <PanelButton variant="ghost" onClick={closeDrawer}>Agora não</PanelButton>
    </section>
  );
}

function CommunityPanel({ communityName }: { communityName: string }) {
  const { communities, joinedCommunityNames, toggleCommunity, openDrawer, closeDrawer } = usePrototype();
  const community = communities.find((entry) => entry.name === communityName);
  if (!community) return <p className="prototype-empty">Comunidade indisponível neste teste.</p>;
  const joined = joinedCommunityNames.has(community.name);
  return (
    <section className="prototype-panel">
      <div className="prototype-community-hero" style={{ background: community.accent }}><span>{community.name.slice(0, 2).toUpperCase()}</span><div><h3>{community.name}</h3><p>{community.members}</p></div></div>
      <p className="prototype-panel-copy">{community.topic}</p>
      <PanelButton onClick={() => toggleCommunity(community.name)}>{joined ? "Sair da comunidade" : "Entrar na comunidade"}</PanelButton>
      <PanelButton variant="secondary" onClick={() => openDrawer({ type: "topic", topic: community.name })}><MessageCircleMore size={17} /> Abrir conversa</PanelButton>
      <PanelButton variant="ghost" onClick={closeDrawer}>Fechar</PanelButton>
    </section>
  );
}

function TopicPanel({ topic }: { topic: string }) {
  const { announce, closeDrawer, navigate } = usePrototype();
  return (
    <section className="prototype-panel">
      <div className="prototype-topic-banner"><MessageCircleMore size={22} /><span><strong>{topic}</strong><small>Conversa aberta da comunidade</small></span></div>
      <p className="prototype-panel-copy">Este ponto de teste representa a conversa comunitária. A timeline e moderação entram na próxima etapa do produto.</p>
      <PanelButton onClick={() => { announce("Você entrou na conversa comunitária."); navigate("comunidade"); closeDrawer(); }}>Participar da conversa</PanelButton>
      <PanelButton variant="ghost" onClick={closeDrawer}>Voltar</PanelButton>
    </section>
  );
}

function ExplorePanel({ destination }: { destination: string }) {
  const { navigate, announce, closeDrawer } = usePrototype();
  const copy: Record<string, string> = {
    Cinema: "Filmes, estreias e favoritos compartilhados.",
    Pessoas: "Use suas afinidades para descobrir novas conexões.",
    Pet: "Um espaço futuro para quem ama o mundo animal.",
    Loja: "Produtos e ideias escolhidos pela comunidade.",
    Avatar: "Personalização visual do seu perfil.",
    Jogos: "Convites e partidas com novas amizades.",
  };
  const go = destination === "Pessoas" ? "inicio" : destination === "Cinema" ? "perfil" : "explorar";
  return (
    <section className="prototype-panel">
      <div className="prototype-topic-banner"><Search size={22} /><span><strong>{destination}</strong><small>Destino do ecossistema ORHA</small></span></div>
      <p className="prototype-panel-copy">{copy[destination] ?? "Uma nova experiência do ecossistema."}</p>
      <PanelButton onClick={() => { navigate(go); announce(`${destination} está pronto para exploração de interface.`); closeDrawer(); }}>Abrir {destination}</PanelButton>
      <PanelButton variant="ghost" onClick={closeDrawer}>Fechar</PanelButton>
    </section>
  );
}

function RequestsPanel() {
  const { conversationRequests, respondToConversationRequest, closeDrawer } = usePrototype();
  return (
    <section className="prototype-panel">
      {conversationRequests.length ? conversationRequests.map((name) => (
        <div className="prototype-request" key={name}>
          <span>{name.slice(0, 2).toUpperCase()}</span>
          <div><strong>{name}</strong><small>Quer iniciar uma conversa com você.</small><p>Isso não envia pedido de amizade.</p></div>
          <div className="prototype-request-actions"><button type="button" aria-label={`Recusar ${name}`} onClick={() => respondToConversationRequest(name, false)}><X size={17} /></button><button type="button" aria-label={`Aceitar ${name}`} onClick={() => respondToConversationRequest(name, true)}><Check size={17} /></button></div>
        </div>
      )) : <p className="prototype-empty">Você não tem solicitações pendentes.</p>}
      <PanelButton variant="ghost" onClick={closeDrawer}>Concluir</PanelButton>
    </section>
  );
}

function ConversationPanel({ conversationId }: { conversationId: string }) {
  const { conversations, conversationMessages, sendMessage, closeDrawer } = usePrototype();
  const [message, setMessage] = useState("");
  const conversation = conversations.find((entry) => entry.id === conversationId);
  const thread = conversationMessages[conversationId] ?? [];
  if (!conversation) return <p className="prototype-empty">Conversa indisponível.</p>;

  return (
    <section className="prototype-panel prototype-chat-panel">
      <div className="prototype-chat-person"><span style={{ background: conversation.tone }}>{conversation.initials}</span><div><strong>{conversation.name}</strong><small>{conversation.kind === "group" ? "Grupo" : "Disponível agora"}</small></div></div>
      <div className="prototype-message-thread">
        {thread.map((item) => <div className={`prototype-message ${item.mine ? "mine" : ""}`} key={item.id}>{item.content}</div>)}
      </div>
      <form className="prototype-composer" onSubmit={(event) => { event.preventDefault(); sendMessage(conversationId, message); setMessage(""); }}>
        <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Escreva uma mensagem" />
        <button type="submit" aria-label="Enviar mensagem"><Send size={18} /></button>
      </form>
      <PanelButton variant="ghost" onClick={closeDrawer}>Fechar conversa</PanelButton>
    </section>
  );
}

function ComposePanel({ recipient }: { recipient?: string }) {
  const { people, startConversation, closeDrawer } = usePrototype();
  const [selected, setSelected] = useState(recipient ?? people[0]?.name ?? "");
  const [message, setMessage] = useState("");
  return (
    <form className="prototype-panel" onSubmit={(event) => { event.preventDefault(); if (selected) startConversation(selected, message); }}>
      <label className="prototype-field"><span>Para</span><select value={selected} onChange={(event) => setSelected(event.target.value)}>{people.map((person) => <option key={person.name}>{person.name}</option>)}</select></label>
      <label className="prototype-field"><span>Primeira mensagem</span><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Escreva um oi para começar" rows={4} /></label>
      <PanelButton type="submit"><MailPlus size={17} /> Abrir conversa</PanelButton>
      <PanelButton variant="ghost" onClick={closeDrawer}>Cancelar</PanelButton>
    </form>
  );
}

function CreateCommunityPanel() {
  const { addCommunity, closeDrawer, navigate } = usePrototype();
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  return (
    <form className="prototype-panel" onSubmit={(event) => { event.preventDefault(); if (!name.trim()) return; addCommunity(name, topic); navigate("comunidade"); closeDrawer(); }}>
      <p className="prototype-panel-hint">Criação em modo de teste: a nova comunidade fica disponível somente neste dispositivo.</p>
      <label className="prototype-field"><span>Nome da comunidade</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Café depois do culto" required /></label>
      <label className="prototype-field"><span>Sobre o que vocês vão conversar?</span><textarea value={topic} onChange={(event) => setTopic(event.target.value)} rows={3} placeholder="Descreva a ideia" /></label>
      <PanelButton type="submit"><UsersRound size={17} /> Criar comunidade</PanelButton>
      <PanelButton variant="ghost" onClick={closeDrawer}>Cancelar</PanelButton>
    </form>
  );
}

function EditProfilePanel() {
  const { profile, saveProfile, closeDrawer } = usePrototype();
  const [fullName, setFullName] = useState(profile.fullName);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio);
  return (
    <form className="prototype-panel" onSubmit={(event) => { event.preventDefault(); saveProfile({ fullName: fullName.trim() || profile.fullName, username: username.replace(/^@/, "").trim() || profile.username, bio: bio.trim() || profile.bio }); closeDrawer(); }}>
      <p className="prototype-panel-hint">Essas alterações são locais, para validar o fluxo antes de gravarmos no Supabase.</p>
      <label className="prototype-field"><span>Nome</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} required /></label>
      <label className="prototype-field"><span>Username</span><input value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
      <label className="prototype-field"><span>Bio</span><textarea value={bio} onChange={(event) => setBio(event.target.value)} rows={4} maxLength={300} /></label>
      <PanelButton type="submit">Salvar alterações</PanelButton>
      <PanelButton variant="ghost" onClick={closeDrawer}>Cancelar</PanelButton>
    </form>
  );
}

function PrivacyPanel() {
  const { privacy, savePrivacy, closeDrawer } = usePrototype();
  const [profile, setProfile] = useState<ProfileVisibility>(privacy.profile);
  const [favorites, setFavorites] = useState<ProfileVisibility>(privacy.favorites);
  const [gallery, setGallery] = useState<ProfileVisibility>(privacy.gallery);
  const [datingEnabled, setDatingEnabled] = useState(privacy.datingEnabled);
  return (
    <section className="prototype-panel">
      <div className="prototype-privacy-intro"><LockKeyhole size={19} /><p>Você define o que aparece no seu perfil. O modo namoro continua desativado por padrão.</p></div>
      <VisibilityField label="Perfil" value={profile} onChange={setProfile} />
      <VisibilityField label="Favoritos" value={favorites} onChange={setFavorites} />
      <VisibilityField label="Galeria" value={gallery} onChange={setGallery} />
      <label className="prototype-switch-row"><span><strong>Modo namoro</strong><small>Ainda é uma prévia privada.</small></span><input type="checkbox" checked={datingEnabled} onChange={(event) => setDatingEnabled(event.target.checked)} /></label>
      <PanelButton onClick={() => { savePrivacy({ profile, favorites, gallery, datingEnabled }); closeDrawer(); }}>Salvar preferências</PanelButton>
    </section>
  );
}

function VisibilityField({ label, value, onChange }: { label: string; value: ProfileVisibility; onChange: (value: ProfileVisibility) => void }) {
  return <label className="prototype-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value as ProfileVisibility)}><option value="public">Público</option><option value="friends">Somente amigos</option><option value="private">Somente eu</option></select></label>;
}

function FavoritesPanel({ category }: { category: FavoriteCategory }) {
  const { favorites, addFavorite, closeDrawer } = usePrototype();
  const [value, setValue] = useState("");
  const label = favoriteCategoryLabels[category];
  return (
    <form className="prototype-panel" onSubmit={(event) => { event.preventDefault(); addFavorite(category, value); setValue(""); }}>
      <p className="prototype-panel-hint">Adicione até cinco {label.toLocaleLowerCase("pt-BR")}. A pesquisa por APIs entra na evolução seguinte.</p>
      <div className="prototype-chip-list">{favorites[category].length ? favorites[category].map((item) => <span key={item}>{item}</span>) : <p className="prototype-empty">Sua lista ainda está vazia.</p>}</div>
      <label className="prototype-field"><span>Novo item</span><input value={value} onChange={(event) => setValue(event.target.value)} placeholder={`Adicionar ${label.toLocaleLowerCase("pt-BR")}`} /></label>
      <PanelButton type="submit">Adicionar aos favoritos</PanelButton>
      <PanelButton variant="ghost" onClick={closeDrawer}>Concluir</PanelButton>
    </form>
  );
}

function GalleryPanel() {
  const { galleryImages, addGalleryImages, removeGalleryImage, closeDrawer } = usePrototype();
  return (
    <section className="prototype-panel">
      <p className="prototype-panel-hint">As imagens ficam somente neste dispositivo até a integração de upload e armazenamento.</p>
      <label className="prototype-upload"><ImagePlus size={20} /><span>Selecionar fotos</span><input type="file" accept="image/*" multiple onChange={(event) => { addGalleryImages(Array.from(event.target.files ?? [])); event.target.value = ""; }} /></label>
      {galleryImages.length ? <div className="prototype-gallery-preview">{galleryImages.map((image) => <button type="button" key={image} onClick={() => removeGalleryImage(image)} aria-label="Remover foto"><img src={image} alt="Prévia da galeria" /><X size={16} /></button>)}</div> : <p className="prototype-empty">Nenhuma foto adicionada ainda.</p>}
      <PanelButton variant="ghost" onClick={closeDrawer}>Concluir</PanelButton>
    </section>
  );
}
