import {
  useEffect,
  useId,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate } from "@tanstack/react-router";
import {
  Bell,
  Check,
  ChevronRight,
  Flag,
  MessageCircleMore,
  Search,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { Button, type ButtonProps } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { TextArea } from "@/components/base/textarea/textarea";
import { Drawer } from "@/components/godui/drawer";
import {
  presentNotification,
  useNotificationCenter,
} from "@/domains/notifications";
import {
  useComments,
  useCommunities,
  useCommunity,
  useCommunityActions,
  useFriendshipActions,
  useFriendshipWith,
  usePostActions,
  useProfile,
  useProfiles,
} from "@/domains/social";
import { useProfileBlock } from "@/domains/trust";
import { createOramaSearchRepository } from "@/infrastructure/search/orama-search-repository";
import { useAuth } from "../auth/auth-context";
import { FriendshipsPanel } from "../social/friendships-panel";
import type { FriendshipPanelTab } from "../social/friendships-panel-model";
import { buildCommunityPath, ROUTE_PATHS } from "../router-policy";
import { type DrawerView, useAppUi } from "../ui-state-context";

const drawerTitles: Record<DrawerView["type"], string> = {
  search: "Pesquisar",
  friendships: "Amizades",
  notifications: "Notificações",
  person: "Conhecer pessoa",
  community: "Comunidade",
  topic: "Conversa da comunidade",
  "create-post": "Nova publicação",
  "create-community": "Criar comunidade",
};

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
const notificationRowClassName = "prototype-notification";
// iOS Safari zooms focused editable controls below 16px. The legacy drawer
// namespace still declares 12px, so this explicit important utility is part of
// the native-first interaction contract rather than a visual size preference.
const editableClassName = "text-[16px]!";

function PanelInput({
  label,
  value,
  onChange,
  placeholder,
  isRequired,
  type = "text",
  autoComplete,
  maxLength,
  isDisabled,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isRequired?: boolean;
  type?: string;
  autoComplete?: string;
  maxLength?: number;
  isDisabled?: boolean;
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
        maxLength={maxLength}
        isDisabled={isDisabled}
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
  isRequired,
  isDisabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows: number;
  maxLength?: number;
  isRequired?: boolean;
  isDisabled?: boolean;
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
        isRequired={isRequired}
        isDisabled={isDisabled}
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

export function AppDrawer() {
  const { drawer, closeDrawer, toast } = useAppUi();

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
    case "friendships":
      return <FriendshipsDrawerPanel initialTab={view.initialTab} />;
    case "notifications":
      return <NotificationsPanel />;
    case "person":
      return (
        <PersonPanel personName={view.personName} profileId={view.profileId} />
      );
    case "community":
      return (
        <CommunityPanel
          communityName={view.communityName}
          communityId={view.communityId}
        />
      );
    case "topic":
      return (
        <TopicPanel
          topic={view.topic}
          postId={view.postId}
          initialReactionCount={view.reactionCount}
          initialViewerReaction={view.viewerReaction}
        />
      );
    case "create-post":
      return <CreatePostPanel initialCommunityId={view.communityId} />;
    case "create-community":
      return <CreateCommunityPanel />;
  }
}

function SearchPanel() {
  const { identity } = useAuth();
  const ownProfileId = identity?.profile.id;
  const { openDrawer, closeDrawer } = useAppUi();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);
  const normalized = debouncedQuery.trim().toLocaleLowerCase("pt-BR");
  const profilesQuery = useProfiles(debouncedQuery);
  const communitiesQuery = useCommunities(debouncedQuery);
  const searchableProfiles = useMemo(
    () =>
      profilesQuery.items.filter(
        (profile) => profile.id !== ownProfileId,
      ),
    [ownProfileId, profilesQuery.items],
  );
  const [searchResult, setSearchResult] = useState<{
    term: string;
    ids: string[];
  } | null>(null);
  const repository = useMemo(
    () =>
      createOramaSearchRepository([
        ...searchableProfiles.map((profile) => ({
          id: `person:${profile.id}`,
          title: profile.fullName,
          body: [
            profile.username,
            profile.bio,
            profile.church,
            profile.city,
            profile.stateCode,
            ...profile.interests,
            ...profile.hobbies,
          ]
            .filter(Boolean)
            .join(" "),
          tags: ["person"],
        })),
        ...communitiesQuery.items.map((community) => ({
          id: `community:${community.id}`,
          title: community.name,
          body: [community.description, community.category]
            .filter(Boolean)
            .join(" "),
          tags: ["community", community.category],
        })),
      ]),
    [communitiesQuery.items, searchableProfiles],
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
            ids: results.map((result) => result.id),
          });
        }
      })
      .catch(() => {
        if (active) setSearchResult({ term: normalized, ids: [] });
      });

    return () => {
      active = false;
    };
  }, [normalized, repository]);

  const rankedIds =
    normalized && searchResult?.term === normalized
      ? new Map(searchResult.ids.map((id, index) => [id, index]))
      : null;
  const localSearchPending = Boolean(normalized) && rankedIds === null;
  const matchingPeople = searchableProfiles
    .filter(
      (profile) =>
        !normalized || rankedIds?.has(`person:${profile.id}`),
    )
    .sort(
      (left, right) =>
        (rankedIds?.get(`person:${left.id}`) ?? 0) -
        (rankedIds?.get(`person:${right.id}`) ?? 0),
    );
  const matchingCommunities = communitiesQuery.items
    .filter(
      (community) =>
        !normalized || rankedIds?.has(`community:${community.id}`),
    )
    .sort(
      (left, right) =>
        (rankedIds?.get(`community:${left.id}`) ?? 0) -
        (rankedIds?.get(`community:${right.id}`) ?? 0),
    );
  const isLoading =
    query !== debouncedQuery ||
    profilesQuery.status === "loading" ||
    communitiesQuery.status === "loading" ||
    localSearchPending;
  const loadError = profilesQuery.error ?? communitiesQuery.error;

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
        Resultados permitidos pelas suas configurações de privacidade, com
        ordenação local pelo mecanismo de busca do ORHA.
      </p>
      <PanelButton
        variant="secondary"
        iconLeading={UsersRound}
        onClick={() => openDrawer({ type: "friendships" })}
      >
        Ver amizades e solicitações
      </PanelButton>
      <div className="prototype-result-group">
        <span>PESSOAS</span>
        {matchingPeople.map((profile) => (
          <button
            key={profile.id}
            type="button"
            className="prototype-result-row"
            onClick={() =>
              openDrawer({
                type: "person",
                personName: profile.fullName,
                profileId: profile.id,
              })
            }
          >
            <i>{profileInitials(profile.fullName)}</i>
            <strong>
              {profile.fullName}
              <small>
                {[profile.city, profile.stateCode].filter(Boolean).join(", ") ||
                  `@${profile.username.replace(/^@/, "")}`}
              </small>
            </strong>
            <ChevronRight size={17} />
          </button>
        ))}
        {profilesQuery.hasMore ? (
          <PanelButton
            variant="secondary"
            isDisabled={profilesQuery.isLoadingMore}
            isLoading={profilesQuery.isLoadingMore}
            onClick={() => void profilesQuery.loadMore()}
          >
            Carregar mais pessoas
          </PanelButton>
        ) : null}
      </div>
      <div className="prototype-result-group">
        <span>COMUNIDADES</span>
        {matchingCommunities.map((community) => (
          <button
            key={community.id}
            type="button"
            className="prototype-result-row"
            onClick={() =>
              openDrawer({
                type: "community",
                communityName: community.name,
                communityId: community.id,
              })
            }
          >
            <i>{community.name.slice(0, 2).toUpperCase()}</i>
            <strong>
              {community.name}
              <small>
                {community.description ||
                  `${community.memberCount} ${community.memberCount === 1 ? "membro" : "membros"}`}
              </small>
            </strong>
            <ChevronRight size={17} />
          </button>
        ))}
        {communitiesQuery.hasMore ? (
          <PanelButton
            variant="secondary"
            isDisabled={communitiesQuery.isLoadingMore}
            isLoading={communitiesQuery.isLoadingMore}
            onClick={() => void communitiesQuery.loadMore()}
          >
            Carregar mais comunidades
          </PanelButton>
        ) : null}
      </div>
      {isLoading ? (
        <p className="prototype-empty" role="status">
          Pesquisando…
        </p>
      ) : loadError ? (
        <p className="prototype-empty" role="alert">
          {loadError}
        </p>
      ) : !matchingPeople.length && !matchingCommunities.length ? (
        <p className="prototype-empty">Nada encontrado para “{query}”.</p>
      ) : null}
      <PanelButton type="button" variant="ghost" onClick={closeDrawer}>
        Fechar busca
      </PanelButton>
    </section>
  );
}

function FriendshipsDrawerPanel({
  initialTab,
}: {
  initialTab?: FriendshipPanelTab;
}) {
  const { identity } = useAuth();
  const { announce, openDrawer } = useAppUi();

  if (!identity) {
    return (
      <p
        className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        role="alert"
      >
        Sua sessão precisa ser atualizada para carregar as amizades.
      </p>
    );
  }

  return (
    <FriendshipsPanel
      viewerId={identity.profile.id}
      initialTab={initialTab}
      onChanged={announce}
      onOpenProfile={(profile) =>
        openDrawer({
          type: "person",
          personName: profile.fullName,
          profileId: profile.id,
        })
      }
    />
  );
}

function profileInitials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("pt-BR") ?? "")
    .join("");
}

function NotificationsPanel() {
  const { closeDrawer } = useAppUi();
  const notifications = useNotificationCenter();
  const [actionError, setActionError] = useState<string | null>(null);

  const markAllRead = async () => {
    setActionError(null);
    try {
      await notifications.markAllRead();
      closeDrawer();
    } catch {
      setActionError("Não foi possível atualizar as notificações.");
    }
  };

  return (
    <section className="prototype-panel">
      {notifications.status === "loading" ? (
        <p className="prototype-empty" role="status">
          Carregando notificações…
        </p>
      ) : notifications.items.length ? (
        notifications.items.map((notification) => {
          const presentation = presentNotification(notification);
          const content = (
            <>
              {notification.category === "social" ? (
                <UsersRound size={18} aria-hidden />
              ) : (
                <Bell size={18} aria-hidden />
              )}
              <span>
                <strong>{presentation.title}</strong>
                <small>{presentation.description}</small>
              </span>
              {!notification.readAt ? <i aria-label="Não lida" /> : null}
            </>
          );

          return notification.readAt ? (
            <div className={notificationRowClassName} key={notification.id}>
              {content}
            </div>
          ) : (
            <button
              className={notificationRowClassName}
              key={notification.id}
              type="button"
              onClick={() => {
                void notifications.markRead([notification.id]).catch(() => {
                  setActionError("Não foi possível marcar a notificação como lida.");
                });
              }}
            >
              {content}
            </button>
          );
        })
      ) : notifications.status === "error" ? (
        <p className="prototype-empty" role="alert">
          {notifications.error}
        </p>
      ) : (
        <p className="prototype-empty">Nenhuma notificação agora.</p>
      )}
      {actionError ? (
        <p className="prototype-panel-hint" role="alert">
          {actionError}
        </p>
      ) : null}
      <PanelButton
        onClick={() => void markAllRead()}
        isDisabled={notifications.unreadCount === 0}
      >
        Marcar tudo como lido
      </PanelButton>
    </section>
  );
}

function PersonPanel({
  personName,
  profileId,
}: {
  personName: string;
  profileId: string;
}) {
  const { identity } = useAuth();
  const { announce, closeDrawer } = useAppUi();
  const routeNavigate = useNavigate();
  const profileQuery = useProfile(profileId);
  const friendshipQuery = useFriendshipWith(profileId);
  const blockQuery = useProfileBlock(profileId);
  const friendshipActions = useFriendshipActions();
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmBlock, setConfirmBlock] = useState(false);
  if (
    profileQuery.status === "loading" ||
    friendshipQuery.status === "loading" ||
    blockQuery.status === "loading"
  ) {
    return (
      <p className="prototype-empty" role="status">
        Carregando perfil…
      </p>
    );
  }

  const profile = profileQuery.data;
  const friendship = friendshipQuery.data;
  const blocked = blockQuery.isBlocked;
  const isSelf = identity?.profile.id === profileId;
  const displayName = profile?.fullName ?? personName;
  const queryError =
    profileQuery.error ?? friendshipQuery.error ?? blockQuery.error;
  const relationshipError = friendshipQuery.error ?? blockQuery.error;

  if (!profile && !blocked) {
    return (
      <p className="prototype-empty" role={queryError ? "alert" : undefined}>
        {queryError ?? "Este perfil não está disponível para você."}
      </p>
    );
  }

  const runAction = async (
    action: () => Promise<unknown>,
    successMessage: string,
    closeAfter = false,
  ) => {
    setActionError(null);
    try {
      await action();
      announce(successMessage);
      if (closeAfter) closeDrawer();
    } catch (error) {
      setActionError(
        error instanceof Error && error.message
          ? error.message
          : "Não foi possível concluir esta ação.",
      );
    }
  };

  const pendingIncoming =
    friendship?.status === "pending" &&
    friendship.addresseeId === identity?.profile.id;
  const pendingOutgoing =
    friendship?.status === "pending" &&
    friendship.requesterId === identity?.profile.id;
  const updateBlock = async (nextBlocked: boolean) => {
    setActionError(null);
    try {
      if (nextBlocked) {
        await blockQuery.block();
        announce(`${displayName} foi bloqueado.`);
        closeDrawer();
      } else {
        await blockQuery.unblock();
        announce(`${displayName} foi desbloqueado.`);
      }
    } catch (error) {
      setActionError(
        error instanceof Error && error.message
          ? error.message
          : "Não foi possível atualizar o bloqueio.",
      );
    }
  };
  const isBlockPending = blockQuery.status === "saving";

  return (
    <section className="prototype-panel">
      <div className="prototype-person-hero">
        <span>{profileInitials(displayName)}</span>
        <div>
          <h3>{displayName}</h3>
          {profile ? (
            <>
              <p>
                {[profile.city, profile.stateCode].filter(Boolean).join(", ") ||
                  `@${profile.username.replace(/^@/, "")}`}
              </p>
              {profile.interests[0] ? <b>{profile.interests[0]}</b> : null}
            </>
          ) : null}
        </div>
      </div>
      {profile?.bio ? <p className="prototype-panel-copy">{profile.bio}</p> : null}
      {relationshipError ? (
        <p className="prototype-panel-hint" role="alert">
          {relationshipError} Atualize a tela antes de alterar esta relação.
        </p>
      ) : null}
      {isSelf ? (
        <PanelButton variant="secondary" isDisabled>
          Este é o seu perfil
        </PanelButton>
      ) : relationshipError ? (
        <PanelButton variant="secondary" isDisabled>
          Ações temporariamente indisponíveis
        </PanelButton>
      ) : blocked ? (
        <PanelButton
          variant="secondary"
          isDisabled={isBlockPending}
          isLoading={isBlockPending}
          onClick={() => void updateBlock(false)}
        >
          Desbloquear perfil
        </PanelButton>
      ) : friendship?.status === "accepted" ? (
        <PanelButton
          variant="secondary"
          isDisabled={friendshipActions.isPending}
          isLoading={friendshipActions.isPending}
          onClick={() =>
            void runAction(
              () => friendshipActions.remove(friendship.id),
              `Amizade com ${displayName} removida.`,
            )
          }
        >
          Remover amizade
        </PanelButton>
      ) : pendingIncoming && friendship ? (
        <>
          <PanelButton
            iconLeading={UserPlus}
            isDisabled={friendshipActions.isPending}
            isLoading={friendshipActions.isPending}
            onClick={() =>
              void runAction(
                () => friendshipActions.respond(friendship.id, true),
                `Você e ${displayName} agora são amigos.`,
              )
            }
          >
            Aceitar solicitação
          </PanelButton>
          <PanelButton
            variant="secondary"
            isDisabled={friendshipActions.isPending}
            onClick={() =>
              void runAction(
                () => friendshipActions.respond(friendship.id, false),
                "Solicitação recusada.",
              )
            }
          >
            Recusar
          </PanelButton>
        </>
      ) : pendingOutgoing ? (
        <PanelButton variant="secondary" isDisabled>
          Solicitação enviada
        </PanelButton>
      ) : (
        <PanelButton
          iconLeading={UserPlus}
          isDisabled={friendshipActions.isPending}
          isLoading={friendshipActions.isPending}
          onClick={() =>
            void runAction(
              () => friendshipActions.request(profileId),
              `Solicitação de amizade enviada para ${displayName}.`,
            )
          }
        >
          Enviar solicitação de amizade
        </PanelButton>
      )}
      {!isSelf && !relationshipError && !blocked ? (
        confirmBlock ? (
          <PanelButton
            variant="danger"
            isDisabled={isBlockPending}
            isLoading={isBlockPending}
            onClick={() => void updateBlock(true)}
          >
            Confirmar bloqueio
          </PanelButton>
        ) : (
          <PanelButton variant="ghost" onClick={() => setConfirmBlock(true)}>
            Bloquear perfil
          </PanelButton>
        )
      ) : null}
      {!isSelf ? (
        <PanelButton
          variant="ghost"
          iconLeading={Flag}
          onClick={() => {
            closeDrawer();
            void routeNavigate({
              to: ROUTE_PATHS.report,
              params: { targetType: "profile", targetId: profileId },
            });
          }}
        >
          Denunciar perfil
        </PanelButton>
      ) : null}
      {actionError ? (
        <p className="prototype-panel-hint" role="alert">
          {actionError}
        </p>
      ) : null}
      <PanelButton variant="ghost" onClick={closeDrawer}>
        Fechar
      </PanelButton>
    </section>
  );
}

function CommunityPanel({
  communityName,
  communityId,
}: {
  communityName: string;
  communityId?: string;
}) {
  const { announce, openDrawer, closeDrawer } = useAppUi();
  const routeNavigate = useNavigate();
  const communityQuery = useCommunity(communityId ?? null);
  const communityActions = useCommunityActions();
  const [actionError, setActionError] = useState<string | null>(null);

  if (!communityId) {
    return (
      <p className="prototype-empty">
        {communityName} ainda não tem um identificador válido.
      </p>
    );
  }
  if (communityQuery.status === "loading") {
    return (
      <p className="prototype-empty" role="status">
        Carregando comunidade…
      </p>
    );
  }

  const community = communityQuery.data;
  if (!community) {
    return (
      <p
        className="prototype-empty"
        role={communityQuery.error ? "alert" : undefined}
      >
        {communityQuery.error ?? "Esta comunidade não está disponível."}
      </p>
    );
  }

  const membership = community.viewerMembership;
  const isActive = membership?.status === "active";
  const isPending = membership?.status === "pending";
  const isBanned = membership?.status === "banned";
  const updateMembership = async () => {
    setActionError(null);
    try {
      if (isActive || isPending) {
        await communityActions.leave(community.id);
        announce(
          isPending
            ? "Solicitação de entrada cancelada."
            : `Você saiu de ${community.name}.`,
        );
      } else {
        const nextMembership = await communityActions.join(community.id);
        announce(
          nextMembership.status === "pending"
            ? "Solicitação enviada aos moderadores."
            : `Você entrou em ${community.name}.`,
        );
      }
    } catch (error) {
      setActionError(
        error instanceof Error && error.message
          ? error.message
          : "Não foi possível atualizar sua participação.",
      );
    }
  };

  return (
    <section className="prototype-panel">
      <div className="prototype-community-hero">
        <span>{community.name.slice(0, 2).toUpperCase()}</span>
        <div>
          <h3>{community.name}</h3>
          <p>
            {new Intl.NumberFormat("pt-BR").format(community.memberCount)}{" "}
            {community.memberCount === 1 ? "membro" : "membros"}
          </p>
          {community.category !== "general" ? (
            <b>{community.category.replaceAll("_", " ")}</b>
          ) : null}
        </div>
      </div>
      {community.description ? (
        <p className="prototype-panel-copy">{community.description}</p>
      ) : null}
      <PanelButton
        onClick={() => void updateMembership()}
        isDisabled={communityActions.isPending || isBanned}
        isLoading={communityActions.isPending}
      >
        {isBanned
          ? "Participação indisponível"
          : isPending
            ? "Cancelar solicitação"
            : isActive
              ? "Sair da comunidade"
              : community.visibility === "private"
                ? "Solicitar entrada"
                : "Entrar na comunidade"}
      </PanelButton>
      <PanelButton
        variant="secondary"
        iconLeading={MessageCircleMore}
        onClick={() => {
          closeDrawer();
          void routeNavigate({ to: buildCommunityPath(community.id) });
        }}
      >
        Abrir página da comunidade
      </PanelButton>
      {isActive ? (
        <PanelButton
          variant="secondary"
          onClick={() =>
            openDrawer({ type: "create-post", communityId: community.id })
          }
        >
          Criar publicação nesta comunidade
        </PanelButton>
      ) : null}
      {actionError ? (
        <p className="prototype-panel-hint" role="alert">
          {actionError}
        </p>
      ) : null}
      <PanelButton variant="ghost" onClick={closeDrawer}>
        Fechar
      </PanelButton>
    </section>
  );
}

function TopicPanel({
  topic,
  postId,
  initialReactionCount,
  initialViewerReaction,
}: {
  topic: string;
  postId?: string;
  initialReactionCount: number;
  initialViewerReaction: string | null;
}) {
  const { announce, closeDrawer } = useAppUi();
  const commentsQuery = useComments(postId ?? null);
  const postActions = usePostActions();
  const [comment, setComment] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [reactionCount, setReactionCount] = useState(initialReactionCount);
  const [viewerReaction, setViewerReaction] = useState(initialViewerReaction);

  if (!postId) {
    return (
      <p className="prototype-empty">
        Esta publicação ainda não tem um identificador válido.
      </p>
    );
  }

  const addComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = comment.trim();
    if (!body) {
      setActionError("Escreva um comentário antes de publicar.");
      return;
    }
    setActionError(null);
    try {
      await postActions.createComment({ postId, body });
      setComment("");
      announce("Comentário publicado.");
    } catch (error) {
      setActionError(
        error instanceof Error && error.message
          ? error.message
          : "Não foi possível publicar o comentário.",
      );
    }
  };

  const reactWithAmen = async () => {
    setActionError(null);
    const nextReaction = viewerReaction === "amen" ? null : "amen";
    try {
      await postActions.setReaction({
        targetType: "post",
        targetId: postId,
        kind: nextReaction,
      });
      const reactionDelta = nextReaction ? (viewerReaction ? 0 : 1) : -1;
      setReactionCount((current) =>
        Math.max(0, current + reactionDelta),
      );
      setViewerReaction(nextReaction);
      announce(nextReaction ? "Reação registrada." : "Reação removida.");
    } catch (error) {
      setActionError(
        error instanceof Error && error.message
          ? error.message
          : "Não foi possível registrar a reação.",
      );
    }
  };

  return (
    <section className="prototype-panel">
      <div className="prototype-topic-banner">
        <MessageCircleMore size={22} />
        <span>
          <strong>{topic}</strong>
          <small>Conversa aberta da comunidade</small>
        </span>
      </div>
      {commentsQuery.status === "loading" ? (
        <p className="prototype-empty" role="status">
          Carregando comentários…
        </p>
      ) : commentsQuery.status === "error" ? (
        <p className="prototype-empty" role="alert">
          {commentsQuery.error}
        </p>
      ) : commentsQuery.items.length ? (
        commentsQuery.items.map((entry) => (
          <div className="prototype-request" key={entry.id}>
            <span>{profileInitials(entry.author?.fullName ?? "Perfil")}</span>
            <div>
              <strong>{entry.author?.fullName ?? "Perfil indisponível"}</strong>
              <small>{entry.body}</small>
            </div>
          </div>
        ))
      ) : (
        <p className="prototype-empty">Nenhum comentário publicado ainda.</p>
      )}
      {commentsQuery.hasMore ? (
        <PanelButton
          variant="secondary"
          isDisabled={commentsQuery.isLoadingMore}
          isLoading={commentsQuery.isLoadingMore}
          onClick={() => void commentsQuery.loadMore()}
        >
          Carregar mais comentários
        </PanelButton>
      ) : null}
      <form className="prototype-panel" onSubmit={addComment}>
        <PanelTextArea
          label="Seu comentário"
          value={comment}
          onChange={setComment}
          rows={3}
          maxLength={3000}
          isRequired
          isDisabled={postActions.isPending}
          placeholder="Participe com respeito"
        />
        <PanelButton
          type="submit"
          isDisabled={postActions.isPending}
          isLoading={postActions.isPending}
        >
          Publicar comentário
        </PanelButton>
      </form>
      <PanelButton
        variant="secondary"
        isDisabled={postActions.isPending}
        isLoading={postActions.isPending}
        aria-pressed={viewerReaction === "amen"}
        onClick={() => void reactWithAmen()}
      >
        {viewerReaction === "amen" ? "Remover Amém" : "Reagir com Amém"}
        {` · ${reactionCount}`}
      </PanelButton>
      {actionError ? (
        <p className="prototype-panel-hint" role="alert">
          {actionError}
        </p>
      ) : null}
      <PanelButton variant="ghost" onClick={closeDrawer}>
        Voltar
      </PanelButton>
    </section>
  );
}

function CreatePostPanel({
  initialCommunityId,
}: {
  initialCommunityId?: string;
}) {
  const { announce, closeDrawer } = useAppUi();
  const communitiesQuery = useCommunities();
  const postActions = usePostActions();
  const [destination, setDestination] = useState(
    initialCommunityId ?? "public",
  );
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const availableCommunities = communitiesQuery.items.filter(
    (community) => community.viewerMembership?.status === "active",
  );

  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = body.trim();
    if (!content) {
      setError("Escreva algo antes de publicar.");
      return;
    }
    setError(null);
    try {
      const communityId = destination === "public" ? null : destination;
      await postActions.createPost({
        body: content,
        communityId,
        visibility: communityId ? "community" : "public",
      });
      announce("Publicação criada.");
      closeDrawer();
    } catch (actionError) {
      setError(
        actionError instanceof Error && actionError.message
          ? actionError.message
          : "Não foi possível criar a publicação.",
      );
    }
  };

  return (
    <form
      className="prototype-panel"
      onSubmit={publish}
      aria-busy={postActions.isPending}
    >
      <PanelNativeSelect
        label="Onde publicar"
        value={destination}
        onChange={setDestination}
        isDisabled={postActions.isPending || communitiesQuery.status === "loading"}
        options={[
          { label: "Publicação pública", value: "public" },
          ...availableCommunities.map((community) => ({
            label: community.name,
            value: community.id,
          })),
        ]}
      />
      <PanelTextArea
        label="Publicação"
        value={body}
        onChange={(value) => {
          setBody(value);
          if (error) setError(null);
        }}
        rows={6}
        maxLength={10_000}
        isRequired
        isDisabled={postActions.isPending}
        placeholder="Compartilhe algo com a comunidade"
      />
      {error ? (
        <p className="prototype-panel-hint" role="alert">
          {error}
        </p>
      ) : null}
      <PanelButton
        type="submit"
        isDisabled={postActions.isPending}
        isLoading={postActions.isPending}
      >
        Publicar
      </PanelButton>
      <PanelButton type="button" variant="ghost" onClick={closeDrawer}>
        Cancelar
      </PanelButton>
    </form>
  );
}

function CreateCommunityPanel() {
  const { announce, closeDrawer } = useAppUi();
  const routeNavigate = useNavigate();
  const communityActions = useCommunityActions();
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [category, setCategory] = useState("general");
  const [visibility, setVisibility] = useState("public");
  const [error, setError] = useState<string | null>(null);

  const createCommunity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim().length < 3) {
      setError("Informe um nome com pelo menos três caracteres.");
      return;
    }
    setError(null);
    try {
      const community = await communityActions.create({
        name: name.trim(),
        description: topic.trim(),
        category,
        visibility: visibility === "private" ? "private" : "public",
      });
      announce(`${community.name} foi criada.`);
      closeDrawer();
      void routeNavigate({ to: buildCommunityPath(community.id) });
    } catch (actionError) {
      setError(
        actionError instanceof Error && actionError.message
          ? actionError.message
          : "Não foi possível criar a comunidade.",
      );
    }
  };

  return (
    <form
      className="prototype-panel"
      onSubmit={createCommunity}
      aria-busy={communityActions.isPending}
    >
      <p className="prototype-panel-hint">
        Comunidades públicas liberam a entrada imediatamente. Nas privadas,
        cada solicitação precisa ser aceita.
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
        maxLength={100}
        isDisabled={communityActions.isPending}
        error={error}
      />
      <PanelTextArea
        label="Sobre o que vocês vão conversar?"
        value={topic}
        onChange={setTopic}
        rows={3}
        maxLength={2000}
        isDisabled={communityActions.isPending}
        placeholder="Descreva a ideia"
      />
      <PanelNativeSelect
        label="Categoria"
        value={category}
        onChange={setCategory}
        isDisabled={communityActions.isPending}
        options={[
          { label: "Geral", value: "general" },
          { label: "Fé e espiritualidade", value: "faith" },
          { label: "Estudo bíblico", value: "bible_study" },
          { label: "Amizade", value: "friendship" },
          { label: "Música", value: "music" },
          { label: "Hobbies", value: "hobbies" },
        ]}
      />
      <PanelNativeSelect
        label="Quem pode entrar"
        value={visibility}
        onChange={setVisibility}
        isDisabled={communityActions.isPending}
        options={[
          { label: "Pública", value: "public" },
          { label: "Privada", value: "private" },
        ]}
      />
      <PanelButton
        type="submit"
        iconLeading={UsersRound}
        isDisabled={communityActions.isPending}
        isLoading={communityActions.isPending}
      >
        Criar comunidade
      </PanelButton>
      <PanelButton type="button" variant="ghost" onClick={closeDrawer}>
        Cancelar
      </PanelButton>
    </form>
  );
}
