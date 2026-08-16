import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
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
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import type { ProfileVisibility } from "@/domain/identity";
import { Button, type ButtonProps } from "@/components/base/buttons/button";
import { FileTrigger } from "@/components/base/file-upload-trigger/file-upload-trigger";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { TextArea } from "@/components/base/textarea/textarea";
import { Toggle } from "@/components/base/toggle/toggle";
import { Drawer } from "@/components/godui/drawer";
import { createOramaSearchRepository } from "@/infrastructure/search/orama-search-repository";
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
  compose: "Nova conversa",
  "create-community": "Criar comunidade",
  "edit-profile": "Editar perfil",
  privacy: "Privacidade",
  favorites: "Seus favoritos",
  gallery: "Gerenciar galeria",
};

const EMPTY_MATCHING_IDS = new Set<string>();

function PanelButton({
  variant = "primary",
  className,
  ...props
}: ButtonProps & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const color = {
    primary: "primary",
    secondary: "secondary",
    ghost: "tertiary",
    danger: "primary-destructive",
  }[variant] as NonNullable<ButtonProps["color"]>;

  return (
    <Button
      {...props}
      color={color}
      noTextPadding
      className={`prototype-panel-button ${variant} before:hidden shadow-none! ring-0! ${className ?? ""}`}
    />
  );
}

const fieldControlClassName =
  "rounded-none! bg-transparent! shadow-none! ring-0!";
const editableClassName = "text-md!";

function PanelInput({
  label,
  value,
  onChange,
  placeholder,
  isRequired,
  type = "text",
  autoComplete,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isRequired?: boolean;
  type?: string;
  autoComplete?: string;
  error?: string | null;
}) {
  const labelId = useId();

  return (
    <div className="prototype-field">
      <span id={labelId}>{label}</span>
      <Input
        aria-labelledby={labelId}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        isRequired={isRequired}
        isInvalid={Boolean(error)}
        hint={error ?? undefined}
        type={type}
        autoComplete={autoComplete}
        wrapperClassName={fieldControlClassName}
        inputClassName={editableClassName}
      />
    </div>
  );
}

function PanelTextArea({
  label,
  value,
  onChange,
  placeholder,
  rows,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows: number;
  maxLength?: number;
}) {
  const labelId = useId();

  return (
    <div className="prototype-field">
      <span id={labelId}>{label}</span>
      <TextArea
        aria-labelledby={labelId}
        value={value}
        onChange={(nextValue) =>
          onChange(maxLength ? nextValue.slice(0, maxLength) : nextValue)
        }
        placeholder={placeholder}
        rows={rows}
        textAreaClassName={`ring-0! shadow-none! ${editableClassName}`}
      />
    </div>
  );
}

function PanelNativeSelect({
  label,
  value,
  onChange,
  options,
  isDisabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  isDisabled?: boolean;
}) {
  const labelId = useId();

  return (
    <div className="prototype-field">
      <span id={labelId}>{label}</span>
      <NativeSelect
        aria-labelledby={labelId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        options={options}
        disabled={isDisabled}
        selectClassName={`ring-0! shadow-none! ${editableClassName}`}
      />
    </div>
  );
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
    case "search":
      return <SearchPanel />;
    case "notifications":
      return <NotificationsPanel />;
    case "person":
      return <PersonPanel personName={view.personName} />;
    case "community":
      return <CommunityPanel communityName={view.communityName} />;
    case "topic":
      return <TopicPanel topic={view.topic} />;
    case "explore":
      return <ExplorePanel destination={view.destination} />;
    case "requests":
      return <RequestsPanel />;
    case "compose":
      return <ComposePanel recipient={view.recipient} />;
    case "create-community":
      return <CreateCommunityPanel />;
    case "edit-profile":
      return <EditProfilePanel />;
    case "privacy":
      return <PrivacyPanel />;
    case "favorites":
      return <FavoritesPanel category={view.category} />;
    case "gallery":
      return <GalleryPanel />;
  }
}

function SearchPanel() {
  const { people, communities, openDrawer, closeDrawer } = usePrototype();
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  const [searchResult, setSearchResult] = useState<{
    term: string;
    ids: Set<string>;
  } | null>(null);
  const repository = useMemo(
    () =>
      createOramaSearchRepository([
        ...people.map((person, index) => ({
          id: `person:${index}`,
          title: person.name,
          body: person.affinity,
          tags: ["person"],
        })),
        ...communities.map((community, index) => ({
          id: `community:${index}`,
          title: community.name,
          body: community.topic,
          tags: ["community"],
        })),
      ]),
    [communities, people],
  );

  useEffect(() => {
    if (!normalized) return;

    let active = true;
    void repository
      .then((searchRepository) => searchRepository.search(normalized))
      .then((results) => {
        if (active) {
          setSearchResult({
            term: normalized,
            ids: new Set(results.map((result) => result.id)),
          });
        }
      })
      .catch(() => {
        if (active) setSearchResult({ term: normalized, ids: new Set() });
      });

    return () => {
      active = false;
    };
  }, [normalized, repository]);

  const matchingIds = !normalized
    ? null
    : searchResult?.term === normalized
      ? searchResult.ids
      : EMPTY_MATCHING_IDS;
  const matchingPeople = people.filter(
    (_, index) => matchingIds === null || matchingIds.has(`person:${index}`),
  );
  const matchingCommunities = communities.filter(
    (_, index) => matchingIds === null || matchingIds.has(`community:${index}`),
  );

  return (
    <section className="prototype-panel">
      <div className="prototype-search-field">
        <Search size={18} aria-hidden />
        <Input
          aria-label="Pesquisar pessoas, comunidades e interesses"
          value={query}
          onChange={setQuery}
          placeholder="Pessoas, comunidades e interesses"
          autoFocus
          className="min-w-0 flex-1"
          wrapperClassName={fieldControlClassName}
          inputClassName={`px-0! py-0! ${editableClassName}`}
        />
      </div>
      <p className="prototype-panel-hint">
        A busca é local para este protótipo. Serviços de busca serão conectados
        por adapter depois.
      </p>
      <div className="prototype-result-group">
        <span>PESSOAS</span>
        {matchingPeople.slice(0, 4).map((person) => (
          <button
            key={person.name}
            type="button"
            className="prototype-result-row"
            onClick={() =>
              openDrawer({ type: "person", personName: person.name })
            }
          >
            <i style={{ background: person.tone }}>{person.initials}</i>
            <strong>
              {person.name}
              <small>{person.affinity}</small>
            </strong>
            <ChevronRight size={17} />
          </button>
        ))}
      </div>
      <div className="prototype-result-group">
        <span>COMUNIDADES</span>
        {matchingCommunities.slice(0, 4).map((community) => (
          <button
            key={community.name}
            type="button"
            className="prototype-result-row"
            onClick={() =>
              openDrawer({ type: "community", communityName: community.name })
            }
          >
            <i style={{ background: community.accent }}>
              {community.name.slice(0, 2).toUpperCase()}
            </i>
            <strong>
              {community.name}
              <small>{community.topic}</small>
            </strong>
            <ChevronRight size={17} />
          </button>
        ))}
      </div>
      {!matchingPeople.length && !matchingCommunities.length ? (
        <p className="prototype-empty">Nada encontrado para “{query}”.</p>
      ) : null}
      <PanelButton variant="ghost" onClick={closeDrawer}>
        Fechar busca
      </PanelButton>
    </section>
  );
}

function NotificationsPanel() {
  const { markNotificationsRead, closeDrawer } = usePrototype();
  return (
    <section className="prototype-panel">
      <div className="prototype-notification">
        <Bell size={18} />
        <span>
          <strong>Novas comunidades para você</strong>
          <small>Há sugestões baseadas nos seus interesses.</small>
        </span>
      </div>
      <div className="prototype-notification">
        <Heart size={18} />
        <span>
          <strong>Ana Clara respondeu</strong>
          <small>Ela também gosta de música e livros.</small>
        </span>
      </div>
      <div className="prototype-notification">
        <UsersRound size={18} />
        <span>
          <strong>Conversa em alta</strong>
          <small>Vida e propósito está movimentada hoje.</small>
        </span>
      </div>
      <PanelButton
        onClick={() => {
          markNotificationsRead();
          closeDrawer();
        }}
      >
        Marcar tudo como lido
      </PanelButton>
    </section>
  );
}

function PersonPanel({ personName }: { personName: string }) {
  const { people, startConversation, announce, closeDrawer } = usePrototype();
  const [requestSent, setRequestSent] = useState(false);
  const person = people.find((entry) => entry.name === personName);
  if (!person)
    return <p className="prototype-empty">Pessoa indisponível neste teste.</p>;

  return (
    <section className="prototype-panel">
      <div className="prototype-person-hero">
        <span style={{ background: person.tone }}>{person.initials}</span>
        <div>
          <h3>{person.name}</h3>
          <p>{person.detail}</p>
          <b>{person.affinity}</b>
        </div>
      </div>
      <p className="prototype-panel-copy">
        Vocês têm afinidades em comum. Você pode iniciar uma conversa sem que
        isso crie amizade automaticamente.
      </p>
      <PanelButton onClick={() => startConversation(person.name)}>
        Iniciar conversa
      </PanelButton>
      <PanelButton
        variant="secondary"
        iconLeading={UserPlus}
        onClick={() => {
          setRequestSent(true);
          announce(`Solicitação de amizade enviada para ${person.name}.`);
        }}
      >
        {requestSent ? "Solicitação enviada" : "Enviar solicitação de amizade"}
      </PanelButton>
      <PanelButton variant="ghost" onClick={closeDrawer}>
        Agora não
      </PanelButton>
    </section>
  );
}

function CommunityPanel({ communityName }: { communityName: string }) {
  const {
    communities,
    joinedCommunityNames,
    toggleCommunity,
    openDrawer,
    closeDrawer,
  } = usePrototype();
  const community = communities.find((entry) => entry.name === communityName);
  if (!community)
    return (
      <p className="prototype-empty">Comunidade indisponível neste teste.</p>
    );
  const joined = joinedCommunityNames.has(community.name);
  return (
    <section className="prototype-panel">
      <div
        className="prototype-community-hero"
        style={{ background: community.accent }}
      >
        <span>{community.name.slice(0, 2).toUpperCase()}</span>
        <div>
          <h3>{community.name}</h3>
          <p>{community.members}</p>
        </div>
      </div>
      <p className="prototype-panel-copy">{community.topic}</p>
      <PanelButton onClick={() => toggleCommunity(community.name)}>
        {joined ? "Sair da comunidade" : "Entrar na comunidade"}
      </PanelButton>
      <PanelButton
        variant="secondary"
        iconLeading={MessageCircleMore}
        onClick={() => openDrawer({ type: "topic", topic: community.name })}
      >
        Abrir conversa
      </PanelButton>
      <PanelButton variant="ghost" onClick={closeDrawer}>
        Fechar
      </PanelButton>
    </section>
  );
}

function TopicPanel({ topic }: { topic: string }) {
  const { announce, closeDrawer, navigate } = usePrototype();
  return (
    <section className="prototype-panel">
      <div className="prototype-topic-banner">
        <MessageCircleMore size={22} />
        <span>
          <strong>{topic}</strong>
          <small>Conversa aberta da comunidade</small>
        </span>
      </div>
      <p className="prototype-panel-copy">
        Este ponto de teste representa a conversa comunitária. A timeline e
        moderação entram na próxima etapa do produto.
      </p>
      <PanelButton
        onClick={() => {
          announce("Você entrou na conversa comunitária.");
          navigate("comunidade");
          closeDrawer();
        }}
      >
        Participar da conversa
      </PanelButton>
      <PanelButton variant="ghost" onClick={closeDrawer}>
        Voltar
      </PanelButton>
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
  const go =
    destination === "Pessoas"
      ? "inicio"
      : destination === "Cinema"
        ? "perfil"
        : "explorar";
  return (
    <section className="prototype-panel">
      <div className="prototype-topic-banner">
        <Search size={22} />
        <span>
          <strong>{destination}</strong>
          <small>Destino do ecossistema ORHA</small>
        </span>
      </div>
      <p className="prototype-panel-copy">
        {copy[destination] ?? "Uma nova experiência do ecossistema."}
      </p>
      <PanelButton
        onClick={() => {
          navigate(go);
          announce(`${destination} está pronto para exploração de interface.`);
          closeDrawer();
        }}
      >
        Abrir {destination}
      </PanelButton>
      <PanelButton variant="ghost" onClick={closeDrawer}>
        Fechar
      </PanelButton>
    </section>
  );
}

function RequestsPanel() {
  const { conversationRequests, respondToConversationRequest, closeDrawer } =
    usePrototype();
  return (
    <section className="prototype-panel">
      {conversationRequests.length ? (
        conversationRequests.map((name) => (
          <div className="prototype-request" key={name}>
            <span>{name.slice(0, 2).toUpperCase()}</span>
            <div>
              <strong>{name}</strong>
              <small>Quer iniciar uma conversa com você.</small>
              <p>Isso não envia pedido de amizade.</p>
            </div>
            <div className="prototype-request-actions">
              <button
                type="button"
                aria-label={`Recusar ${name}`}
                onClick={() => respondToConversationRequest(name, false)}
              >
                <X size={17} />
              </button>
              <button
                type="button"
                aria-label={`Aceitar ${name}`}
                onClick={() => respondToConversationRequest(name, true)}
              >
                <Check size={17} />
              </button>
            </div>
          </div>
        ))
      ) : (
        <p className="prototype-empty">Você não tem solicitações pendentes.</p>
      )}
      <PanelButton variant="ghost" onClick={closeDrawer}>
        Concluir
      </PanelButton>
    </section>
  );
}

function ComposePanel({ recipient }: { recipient?: string }) {
  const { people, startConversation, closeDrawer } = usePrototype();
  const [selected, setSelected] = useState(recipient ?? people[0]?.name ?? "");
  const [message, setMessage] = useState("");
  return (
    <form
      className="prototype-panel"
      onSubmit={(event) => {
        event.preventDefault();
        if (selected) startConversation(selected, message);
      }}
    >
      <PanelNativeSelect
        label="Para"
        value={selected}
        onChange={setSelected}
        options={people.map((person) => ({
          label: person.name,
          value: person.name,
        }))}
      />
      <PanelTextArea
        label="Primeira mensagem"
        value={message}
        onChange={setMessage}
        placeholder="Escreva um oi para começar"
        rows={4}
      />
      <PanelButton type="submit" iconLeading={MailPlus}>
        Abrir conversa
      </PanelButton>
      <PanelButton variant="ghost" onClick={closeDrawer}>
        Cancelar
      </PanelButton>
    </form>
  );
}

function CreateCommunityPanel() {
  const { addCommunity, closeDrawer, navigate } = usePrototype();
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="prototype-panel"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) {
          setError("Informe o nome da comunidade.");
          return;
        }
        setError(null);
        addCommunity(name, topic);
        navigate("comunidade");
        closeDrawer();
      }}
    >
      <p className="prototype-panel-hint">
        Criação em modo de teste: a nova comunidade fica disponível somente
        neste dispositivo.
      </p>
      <PanelInput
        label="Nome da comunidade"
        value={name}
        onChange={(nextName) => {
          setName(nextName);
          if (error) setError(null);
        }}
        placeholder="Ex.: Café depois do culto"
        isRequired
        error={error}
      />
      <PanelTextArea
        label="Sobre o que vocês vão conversar?"
        value={topic}
        onChange={setTopic}
        rows={3}
        placeholder="Descreva a ideia"
      />
      <PanelButton type="submit" iconLeading={UsersRound}>
        Criar comunidade
      </PanelButton>
      <PanelButton variant="ghost" onClick={closeDrawer}>
        Cancelar
      </PanelButton>
    </form>
  );
}

function EditProfilePanel() {
  const { profile, saveProfile, closeDrawer } = usePrototype();
  const [fullName, setFullName] = useState(profile.fullName);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio);
  return (
    <form
      className="prototype-panel"
      onSubmit={(event) => {
        event.preventDefault();
        saveProfile({
          fullName: fullName.trim() || profile.fullName,
          username: username.replace(/^@/, "").trim() || profile.username,
          bio: bio.trim() || profile.bio,
        });
        closeDrawer();
      }}
    >
      <p className="prototype-panel-hint">
        Essas alterações são locais, para validar o fluxo antes de gravarmos no
        Supabase.
      </p>
      <PanelInput
        label="Nome"
        value={fullName}
        onChange={setFullName}
        isRequired
        autoComplete="name"
      />
      <PanelInput
        label="Username"
        value={username}
        onChange={setUsername}
        isRequired
        autoComplete="username"
      />
      <PanelTextArea
        label="Bio"
        value={bio}
        onChange={setBio}
        rows={4}
        maxLength={300}
      />
      <PanelButton type="submit">Salvar alterações</PanelButton>
      <PanelButton variant="ghost" onClick={closeDrawer}>
        Cancelar
      </PanelButton>
    </form>
  );
}

function PrivacyPanel() {
  const { privacy, savePrivacy, closeDrawer } = usePrototype();
  const [profile, setProfile] = useState<ProfileVisibility>(privacy.profile);
  const [location, setLocation] = useState<ProfileVisibility>(privacy.location);
  const [favorites, setFavorites] = useState<ProfileVisibility>(
    privacy.favorites,
  );
  const [gallery, setGallery] = useState<ProfileVisibility>(privacy.gallery);
  const [datingEnabled, setDatingEnabled] = useState(privacy.datingEnabled);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    const saved = await savePrivacy({
      profile,
      location,
      favorites,
      gallery,
      datingEnabled,
    });
    setIsSaving(false);
    if (saved) {
      closeDrawer();
      return;
    }
    setError("Não foi possível salvar. Confira sua conexão e tente novamente.");
  };

  return (
    <form
      className="prototype-panel"
      onSubmit={handleSubmit}
      aria-busy={isSaving}
    >
      <div className="prototype-privacy-intro">
        <LockKeyhole size={19} />
        <p>
          Você define o que aparece no seu perfil. O modo namoro continua
          desativado por padrão.
        </p>
      </div>
      <VisibilityField
        label="Perfil"
        value={profile}
        onChange={setProfile}
        isDisabled={isSaving}
      />
      <VisibilityField
        label="Localização"
        value={location}
        onChange={setLocation}
        isDisabled={isSaving}
      />
      <VisibilityField
        label="Favoritos"
        value={favorites}
        onChange={setFavorites}
        isDisabled={isSaving}
      />
      <VisibilityField
        label="Galeria"
        value={gallery}
        onChange={setGallery}
        isDisabled={isSaving}
      />
      <div className="prototype-switch-row">
        <span>
          <strong>Modo namoro</strong>
          <small>Ainda é uma prévia privada.</small>
        </span>
        <Toggle
          aria-label="Ativar modo namoro"
          size="md"
          isSelected={datingEnabled}
          onChange={setDatingEnabled}
          isDisabled={isSaving}
        />
      </div>
      {error ? (
        <p className="prototype-panel-hint" role="alert">
          {error}
        </p>
      ) : null}
      <PanelButton
        type="submit"
        isDisabled={isSaving}
        isLoading={isSaving}
        showTextWhileLoading
      >
        {isSaving ? "Salvando…" : "Salvar preferências"}
      </PanelButton>
    </form>
  );
}

function VisibilityField({
  label,
  value,
  onChange,
  isDisabled,
}: {
  label: string;
  value: ProfileVisibility;
  onChange: (value: ProfileVisibility) => void;
  isDisabled?: boolean;
}) {
  return (
    <PanelNativeSelect
      label={label}
      value={value}
      onChange={(nextValue) => onChange(nextValue as ProfileVisibility)}
      isDisabled={isDisabled}
      options={[
        { value: "public", label: "Público" },
        { value: "friends", label: "Somente amigos" },
        { value: "private", label: "Somente eu" },
      ]}
    />
  );
}

function FavoritesPanel({ category }: { category: FavoriteCategory }) {
  const { favorites, addFavorite, closeDrawer } = usePrototype();
  const [value, setValue] = useState("");
  const label = favoriteCategoryLabels[category];
  return (
    <form
      className="prototype-panel"
      onSubmit={(event) => {
        event.preventDefault();
        addFavorite(category, value);
        setValue("");
      }}
    >
      <p className="prototype-panel-hint">
        Adicione até cinco {label.toLocaleLowerCase("pt-BR")}. A pesquisa por
        APIs entra na evolução seguinte.
      </p>
      <div className="prototype-chip-list">
        {favorites[category].length ? (
          favorites[category].map((item) => <span key={item}>{item}</span>)
        ) : (
          <p className="prototype-empty">Sua lista ainda está vazia.</p>
        )}
      </div>
      <PanelInput
        label="Novo item"
        value={value}
        onChange={setValue}
        placeholder={`Adicionar ${label.toLocaleLowerCase("pt-BR")}`}
      />
      <PanelButton type="submit">Adicionar aos favoritos</PanelButton>
      <PanelButton variant="ghost" onClick={closeDrawer}>
        Concluir
      </PanelButton>
    </form>
  );
}

function GalleryPanel() {
  const { galleryImages, addGalleryImages, removeGalleryImage, closeDrawer } =
    usePrototype();
  return (
    <section className="prototype-panel">
      <p className="prototype-panel-hint">
        As imagens ficam somente neste dispositivo até a integração de upload e
        armazenamento.
      </p>
      <FileTrigger
        acceptedFileTypes={["image/*"]}
        allowsMultiple
        onSelect={(files) => addGalleryImages(Array.from(files ?? []))}
      >
        <Button
          color="tertiary"
          className="prototype-upload"
          iconLeading={ImagePlus}
          aria-label="Selecionar fotos para a galeria"
        >
          Selecionar fotos
        </Button>
      </FileTrigger>
      {galleryImages.length ? (
        <div className="prototype-gallery-preview">
          {galleryImages.map((image) => (
            <button
              type="button"
              key={image}
              onClick={() => removeGalleryImage(image)}
              aria-label="Remover foto"
            >
              <img src={image} alt="Prévia da galeria" />
              <X size={16} />
            </button>
          ))}
        </div>
      ) : (
        <p className="prototype-empty">Nenhuma foto adicionada ainda.</p>
      )}
      <PanelButton variant="ghost" onClick={closeDrawer}>
        Concluir
      </PanelButton>
    </section>
  );
}
