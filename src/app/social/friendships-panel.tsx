import { useState } from "react";
import { Check, Clock3, UserRound, UserRoundX, UsersRound, X } from "lucide-react";
import { Tab, TabList, TabPanel, TabPanels, Tabs } from "react-aria-components";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import {
  useFriendshipActions,
  useFriendships,
  type Friendship,
  type SocialPageQuery,
  type SocialProfile,
} from "@/domains/social";
import {
  friendshipActionLabel,
  friendshipCounterpart,
  type FriendshipAction,
  type FriendshipPanelTab,
} from "./friendships-panel-model";

const tabs: Array<{
  id: FriendshipPanelTab;
  label: string;
  icon: typeof UsersRound;
}> = [
  { id: "friends", label: "Amigos", icon: UsersRound },
  { id: "incoming", label: "Recebidas", icon: UserRound },
  { id: "outgoing", label: "Enviadas", icon: Clock3 },
];

function initials(profile: SocialProfile | null): string {
  if (!profile) return "?";
  return profile.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("pt-BR") ?? "")
    .join("");
}

function friendshipName(profile: SocialProfile | null): string {
  return profile?.fullName.trim() || "Perfil indisponível";
}

function friendshipDetail(profile: SocialProfile | null): string {
  if (!profile) return "Este perfil não está disponível para visualização.";
  const location = [profile.city, profile.stateCode].filter(Boolean).join(", ");
  return location || `@${profile.username.replace(/^@/, "")}`;
}

function emptyCopy(tab: FriendshipPanelTab): { title: string; description: string } {
  if (tab === "incoming") {
    return {
      title: "Nenhuma solicitação recebida",
      description: "Novos pedidos de amizade aparecerão aqui para você decidir.",
    };
  }
  if (tab === "outgoing") {
    return {
      title: "Nenhuma solicitação enviada",
      description: "Pedidos que ainda aguardam resposta aparecerão aqui.",
    };
  }
  return {
    title: "Sua lista de amigos começa aqui",
    description: "Amizades aceitas ficam disponíveis nesta área.",
  };
}

function FriendshipEmptyState({ tab }: { tab: FriendshipPanelTab }) {
  const copy = emptyCopy(tab);
  return (
    <div className="grid min-h-52 place-items-center px-6 text-center">
      <div>
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-violet-50 text-violet-700">
          <UsersRound aria-hidden size={24} />
        </span>
        <h3 className="mt-3 font-semibold text-gray-950">{copy.title}</h3>
        <p className="mt-1 text-sm leading-5 text-gray-500">{copy.description}</p>
      </div>
    </div>
  );
}

function FriendshipLoadingState() {
  return (
    <div className="space-y-2 py-2" aria-label="Carregando amizades">
      {Array.from({ length: 3 }, (_, index) => (
        <div className="flex animate-pulse items-center gap-3 rounded-2xl border border-gray-100 p-3" key={index}>
          <span className="size-12 shrink-0 rounded-full bg-gray-100" />
          <span className="flex-1 space-y-2">
            <span className="block h-4 w-1/2 rounded bg-gray-100" />
            <span className="block h-3 w-2/3 rounded bg-gray-100" />
          </span>
        </div>
      ))}
    </div>
  );
}

function FriendshipList({
  tab,
  viewerId,
  query,
  pending,
  onOpenProfile,
  onAction,
}: {
  tab: FriendshipPanelTab;
  viewerId: string;
  query: SocialPageQuery<Friendship>;
  pending: boolean;
  onOpenProfile?: (profile: SocialProfile) => void;
  onAction: (action: FriendshipAction, friendship: Friendship) => void;
}) {
  if (query.status === "loading") return <FriendshipLoadingState />;
  if (query.status === "error") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4" role="alert">
        <p className="text-sm text-red-800">{query.error}</p>
        <Button color="secondary-destructive" size="sm" className="mt-3" onPress={() => void query.reload()}>
          Tentar novamente
        </Button>
      </div>
    );
  }
  if (!query.items.length) return <FriendshipEmptyState tab={tab} />;

  return (
    <div className="space-y-2">
      {query.items.map((friendship) => {
        const profile = friendshipCounterpart(friendship, viewerId);
        const profileAvailable = Boolean(profile && onOpenProfile);
        return (
          <article className="rounded-2xl border border-gray-200 bg-white p-3" key={friendship.id}>
            <div className="flex min-w-0 items-center gap-3">
              <Avatar
                size="lg"
                initials={initials(profile)}
                alt={profile ? `Foto de ${profile.fullName}` : undefined}
                contentClassName="bg-violet-50 text-violet-800"
              />
              <button
                type="button"
                className="min-h-11 min-w-0 flex-1 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-violet-600 disabled:cursor-default"
                disabled={!profileAvailable}
                onClick={() => {
                  if (profile && onOpenProfile) onOpenProfile(profile);
                }}
              >
                <strong className="block truncate text-[15px] text-gray-950">
                  {friendshipName(profile)}
                </strong>
                <span className="mt-0.5 block truncate text-sm text-gray-500">
                  {friendshipDetail(profile)}
                </span>
              </button>
            </div>

            <div className={`mt-3 grid gap-2 ${tab === "incoming" ? "grid-cols-2" : "grid-cols-1"}`}>
              {tab === "incoming" ? (
                <>
                  <Button
                    color="primary"
                    size="sm"
                    iconLeading={Check}
                    isDisabled={pending}
                    onPress={() => onAction("accept", friendship)}
                  >
                    {friendshipActionLabel(tab, "accept")}
                  </Button>
                  <Button
                    color="secondary"
                    size="sm"
                    iconLeading={X}
                    isDisabled={pending}
                    onPress={() => onAction("decline", friendship)}
                  >
                    {friendshipActionLabel(tab, "decline")}
                  </Button>
                </>
              ) : (
                <Button
                  color={tab === "friends" ? "secondary-destructive" : "secondary"}
                  size="sm"
                  iconLeading={tab === "friends" ? UserRoundX : X}
                  isDisabled={pending}
                  onPress={() => onAction(tab === "friends" ? "remove" : "cancel", friendship)}
                >
                  {friendshipActionLabel(tab, tab === "friends" ? "remove" : "cancel")}
                </Button>
              )}
            </div>
          </article>
        );
      })}

      {query.hasMore ? (
        <Button
          color="secondary"
          size="md"
          className="w-full"
          isLoading={query.isLoadingMore}
          onPress={() => void query.loadMore()}
        >
          Carregar mais
        </Button>
      ) : null}
    </div>
  );
}

export function FriendshipsPanel({
  viewerId,
  initialTab = "friends",
  onOpenProfile,
  onChanged,
}: {
  viewerId: string;
  initialTab?: FriendshipPanelTab;
  onOpenProfile?: (profile: SocialProfile) => void;
  onChanged?: (message: string) => void;
}) {
  const [tab, setTab] = useState<FriendshipPanelTab>(initialTab);
  const [actionError, setActionError] = useState<string | null>(null);
  const accepted = useFriendships({ status: "accepted", direction: "either" });
  const incoming = useFriendships({ status: "pending", direction: "incoming" });
  const outgoing = useFriendships({ status: "pending", direction: "outgoing" });
  const actions = useFriendshipActions();
  const queries: Record<FriendshipPanelTab, SocialPageQuery<Friendship>> = {
    friends: accepted,
    incoming,
    outgoing,
  };

  const runAction = async (action: FriendshipAction, friendship: Friendship) => {
    setActionError(null);
    try {
      if (action === "accept" || action === "decline") {
        await actions.respond(friendship.id, action === "accept");
        onChanged?.(action === "accept" ? "Solicitação aceita." : "Solicitação recusada.");
        return;
      }
      await actions.remove(friendship.id);
      onChanged?.(action === "cancel" ? "Solicitação cancelada." : "Amizade removida.");
    } catch (error) {
      setActionError(
        error instanceof Error && error.message.trim()
          ? error.message
          : "Não foi possível atualizar esta amizade.",
      );
    }
  };

  return (
    <section aria-label="Amizades" className="space-y-4">
      <Tabs selectedKey={tab} onSelectionChange={(key) => setTab(key as FriendshipPanelTab)}>
        <TabList
          aria-label="Filtrar amizades"
          className="grid grid-cols-3 gap-1 rounded-2xl bg-gray-100 p-1"
        >
          {tabs.map(({ id, label, icon: Icon }) => (
            <Tab
              id={id}
              key={id}
              className={({ isSelected }) =>
                `flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-violet-600 ${
                  isSelected ? "bg-white text-gray-950 shadow-sm" : "text-gray-600"
                }`
              }
            >
              <Icon aria-hidden size={16} />
              {label}
            </Tab>
          ))}
        </TabList>
        {actionError ? (
          <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
            {actionError}
          </p>
        ) : null}
        <TabPanels className="mt-3">
          {tabs.map(({ id }) => (
            <TabPanel id={id} key={id} className="outline-none">
              {id === tab ? (
                <FriendshipList
                  tab={id}
                  viewerId={viewerId}
                  query={queries[id]}
                  pending={actions.isPending}
                  onOpenProfile={onOpenProfile}
                  onAction={(action, friendship) => void runAction(action, friendship)}
                />
              ) : null}
            </TabPanel>
          ))}
        </TabPanels>
      </Tabs>
    </section>
  );
}
