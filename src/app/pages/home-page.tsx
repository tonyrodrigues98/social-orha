import {
  Bell,
  CheckCircle2,
  ChevronRight,
  HeartHandshake,
  MessageCircle,
  RefreshCw,
  Sparkles,
  UsersRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/base/buttons/button";
import {
  type HomeCompletionField,
  type HomePersonSummary,
  useHomeDashboard,
} from "@/domains/home";
import { NativeHeader } from "../components/native-header";
import { buildCommunityPath } from "../router-policy";
import { useAuth } from "../auth/auth-context";
import { useAppUi } from "../ui-state-context";

const completionLabels: Record<HomeCompletionField, string> = {
  fullName: "nome completo",
  username: "@username",
  birthDate: "aniversário",
  state: "estado",
  city: "cidade",
  bio: "bio",
  personality: "personalidade",
  favoriteSeason: "estação preferida",
  socialEnergy: "energia social",
  weekendPreferences: "preferências de fim de semana",
  interests: "interesses",
  hobbies: "hobbies",
  visitedPlaces: "lugares visitados",
  desiredPlaces: "lugares que deseja conhecer",
  favorites: "favoritos",
  avatar: "foto de perfil",
  cover: "capa",
  gallery: "galeria",
};

const dashboardRowButtonClass = [
  "w-full justify-start rounded-2xl border border-secondary bg-primary p-3 text-left",
  "[&>[data-text]]:flex [&>[data-text]]:min-w-0 [&>[data-text]]:w-full",
  "[&>[data-text]]:items-center [&>[data-text]]:gap-3",
].join(" ");

function personName(person: HomePersonSummary): string {
  return person.fullName?.trim() || (person.username ? `@${person.username}` : "Perfil");
}

function formattedDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function notificationLabel(type: string): string {
  const labels: Record<string, string> = {
    friendship_request: "Solicitação de amizade",
    friendship_accepted: "Amizade aceita",
    conversation_request: "Solicitação de conversa",
    conversation_request_accepted: "Conversa aceita",
    message_received: "Nova mensagem",
    group_invitation: "Convite para grupo",
    community_post: "Publicação na comunidade",
    community_invite: "Convite para comunidade",
    community_membership: "Participação na comunidade atualizada",
    community_membership_banned: "Participação na comunidade suspensa",
    community_membership_unbanned: "Participação na comunidade restaurada",
    community_role_changed: "Função na comunidade atualizada",
    community_post_removed: "Publicação removida da comunidade",
    post_comment: "Comentário em publicação",
    post_reaction: "Reação em publicação",
    comment_reply: "Resposta a comentário",
    security_alert: "Alerta de segurança",
    moderation_action: "Atualização da conta",
    account_warning: "Aviso da conta",
  };
  return labels[type] ?? "Atualização na ORHA";
}

function SectionHeader({ eyebrow, title, action }: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <span className="section-overline">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function HomePage() {
  const { identity } = useAuth();
  const profileId = identity?.profile.id ?? "";
  const dashboard = useHomeDashboard(profileId);
  const routeNavigate = useNavigate();
  const { navigate, openConversation, openDrawer } = useAppUi();
  const displayName = identity?.profile.full_name?.trim() ?? "";
  const displayFirstName = displayName.split(/\s+/)[0] || "você";
  const summary = dashboard.data;

  return (
    <div className="page home-page">
      <NativeHeader showBrand notificationUnreadCount={summary?.notifications.unreadCount ?? 0} />

      <main className="page-content">
        <section className="welcome-copy">
          <span className="eyebrow">OLÁ, {displayFirstName.toUpperCase()}</span>
          <h1>Seu lugar começa<br />com um encontro.</h1>
          <p>
            {summary && summary.profileCompletion.percentage === 100
              ? "Acompanhe suas conversas, comunidades e novidades em um só lugar."
              : "Complete seu perfil e acompanhe as conexões que estão começando."}
          </p>
        </section>

        {dashboard.isPending ? (
          <section className="rounded-3xl border border-secondary bg-primary p-5" aria-busy="true" role="status">
            <div className="flex items-center gap-3 text-sm font-medium text-tertiary">
              <RefreshCw className="size-5 animate-spin" aria-hidden="true" />
              Carregando sua página inicial…
            </div>
          </section>
        ) : dashboard.isError || !summary ? (
          <section className="rounded-3xl border border-secondary bg-primary p-5" role="alert">
            <h2 className="m-0 text-lg font-semibold text-primary">Não foi possível carregar sua página inicial</h2>
            <p className="mb-4 mt-1 text-sm text-tertiary">Verifique sua conexão e tente novamente.</p>
            <Button
              type="button"
              size="md"
              color="secondary"
              iconLeading={RefreshCw}
              onPress={() => void dashboard.refetch()}
            >
              Tentar novamente
            </Button>
          </section>
        ) : (
          <>
            {summary.profileCompletion.percentage < 100 ? (
              <section className="onboarding-card" aria-label="Progresso do perfil">
                <div className="onboarding-copy min-w-0 flex-1">
                  <span className="card-kicker"><Sparkles size={14} /> Seu perfil</span>
                  <h2>{summary.profileCompletion.percentage}% completo</h2>
                  <p>
                    Falta adicionar {summary.profileCompletion.missing
                      .slice(0, 3)
                      .map((field) => completionLabels[field])
                      .join(", ")}
                    {summary.profileCompletion.missing.length > 3
                      ? ` e mais ${summary.profileCompletion.missing.length - 3}`
                      : ""}.
                  </p>
                  <div
                    className="mb-4 h-2 overflow-hidden rounded-full bg-white/60"
                    role="progressbar"
                    aria-label="Perfil completo"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={summary.profileCompletion.percentage}
                  >
                    <span
                      className="block h-full rounded-full bg-brand-solid"
                      style={{ width: `${summary.profileCompletion.percentage}%` }}
                    />
                  </div>
                  <Button size="md" color="primary" onPress={() => navigate("perfil")}>
                    Continuar perfil
                  </Button>
                </div>
                <CheckCircle2 className="size-12 shrink-0 text-brand-secondary" aria-hidden="true" />
              </section>
            ) : null}

            <section className="content-section">
              <SectionHeader eyebrow="PENDÊNCIAS" title="Esperando por você" />
              <div className="grid gap-3 sm:grid-cols-2">
                <article className="rounded-2xl border border-secondary bg-primary p-4">
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-brand-secondary text-brand-secondary">
                      <HeartHandshake className="size-5" aria-hidden="true" />
                    </span>
                    <strong className="text-2xl text-primary">{summary.pendingFriendRequests.count}</strong>
                  </div>
                  <h3 className="mb-0 mt-3 text-base font-semibold text-primary">Pedidos de amizade</h3>
                  {summary.pendingFriendRequests.items.length ? (
                    <ul className="my-2 list-none space-y-1 p-0 text-sm text-tertiary">
                      {summary.pendingFriendRequests.items.slice(0, 2).map((request) => (
                        <li key={request.id}>{personName(request.requester)}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="my-2 text-sm text-tertiary">Nenhum pedido pendente.</p>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    color="link-gray"
                    isDisabled={summary.pendingFriendRequests.count === 0}
                    onPress={() => openDrawer({ type: "friendships", initialTab: "incoming" })}
                  >
                    Ver solicitações
                  </Button>
                </article>

                <article className="rounded-2xl border border-secondary bg-primary p-4">
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-success-secondary text-success-primary">
                      <MessageCircle className="size-5" aria-hidden="true" />
                    </span>
                    <strong className="text-2xl text-primary">{summary.pendingConversationRequests.count}</strong>
                  </div>
                  <h3 className="mb-0 mt-3 text-base font-semibold text-primary">Pedidos de conversa</h3>
                  {summary.pendingConversationRequests.items.length ? (
                    <ul className="my-2 list-none space-y-1 p-0 text-sm text-tertiary">
                      {summary.pendingConversationRequests.items.slice(0, 2).map((request) => (
                        <li key={request.id}>{personName(request.requester)}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="my-2 text-sm text-tertiary">Nenhum pedido pendente.</p>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    color="link-gray"
                    isDisabled={summary.pendingConversationRequests.count === 0}
                    onPress={() => navigate("conversas")}
                  >
                    Ver solicitações
                  </Button>
                </article>
              </div>
            </section>

            <section className="content-section">
              <SectionHeader
                eyebrow="CONVERSAS"
                title="Continue de onde parou"
                action={(
                  <Button size="sm" color="link-gray" onPress={() => navigate("conversas")}>
                    Ver todas
                  </Button>
                )}
              />
              <div className="grid gap-2">
                {summary.recentConversations.length ? summary.recentConversations.map((conversation) => (
                  <Button
                    key={conversation.id}
                    type="button"
                    size="md"
                    color="tertiary"
                    className={dashboardRowButtonClass}
                    noTextPadding
                    onPress={() => openConversation(conversation.id)}
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold text-primary">
                      {conversation.title.slice(0, 2).toLocaleUpperCase("pt-BR")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-primary">{conversation.title}</span>
                      <span className="block text-xs font-normal text-tertiary">{formattedDate(conversation.lastActivityAt)}</span>
                    </span>
                    {conversation.unreadCount > 0 ? (
                      <span className="grid min-w-6 place-items-center rounded-full bg-brand-solid px-1.5 py-1 text-xs text-white">
                        {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                      </span>
                    ) : null}
                    <ChevronRight className="size-4 text-quaternary" aria-hidden="true" />
                  </Button>
                )) : (
                  <p className="rounded-2xl border border-secondary bg-primary p-4 text-center text-sm text-tertiary">
                    Você ainda não tem conversas recentes.
                  </p>
                )}
              </div>
            </section>

            <section className="content-section">
              <SectionHeader
                eyebrow="NOVIDADES"
                title="Notificações recentes"
                action={(
                  <Button size="sm" color="link-gray" onPress={() => openDrawer({ type: "notifications" })}>
                    Ver todas {summary.notifications.unreadCount > 0 ? `(${summary.notifications.unreadCount})` : ""}
                  </Button>
                )}
              />
              <div className="grid gap-2">
                {summary.notifications.items.length ? summary.notifications.items.map((notification) => (
                  <Button
                    key={notification.id}
                    type="button"
                    size="md"
                    color="tertiary"
                    className={dashboardRowButtonClass}
                    noTextPadding
                    onPress={() => openDrawer({ type: "notifications" })}
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary">
                      <Bell className="size-5 text-tertiary" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-primary">
                        {notification.actor ? `${personName(notification.actor)} · ` : ""}{notificationLabel(notification.type)}
                      </span>
                      <span className="block text-xs font-normal text-tertiary">{formattedDate(notification.createdAt)}</span>
                    </span>
                    {!notification.readAt ? <span className="size-2 rounded-full bg-brand-solid" aria-label="Não lida" /> : null}
                  </Button>
                )) : (
                  <p className="rounded-2xl border border-secondary bg-primary p-4 text-center text-sm text-tertiary">
                    Nenhuma notificação recente.
                  </p>
                )}
              </div>
            </section>

            <section className="content-section">
              <SectionHeader
                eyebrow="COMUNIDADES"
                title="Seus espaços"
                action={(
                  <Button size="sm" color="link-gray" onPress={() => navigate("comunidade")}>
                    Explorar
                  </Button>
                )}
              />
              <div className="grid gap-2">
                {summary.communities.length ? summary.communities.map((community) => (
                  <Button
                    key={community.id}
                    type="button"
                    size="md"
                    color="tertiary"
                    className={dashboardRowButtonClass}
                    noTextPadding
                    onPress={() => void routeNavigate({ to: buildCommunityPath(community.id) })}
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-sm font-semibold text-primary">
                      {community.name.slice(0, 2).toLocaleUpperCase("pt-BR")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-primary">{community.name}</span>
                      <span className="block truncate text-xs font-normal capitalize text-tertiary">
                        {community.category.replaceAll("_", " ")}
                        {community.lastActivityAt ? ` · ${formattedDate(community.lastActivityAt)}` : ""}
                      </span>
                    </span>
                    <ChevronRight className="size-4 text-quaternary" aria-hidden="true" />
                  </Button>
                )) : (
                  <div className="rounded-2xl border border-secondary bg-primary p-4 text-center">
                    <UsersRound className="mx-auto size-6 text-quaternary" aria-hidden="true" />
                    <p className="mb-3 mt-2 text-sm text-tertiary">Você ainda não participa de uma comunidade.</p>
                    <Button size="sm" color="secondary" onPress={() => navigate("comunidade")}>
                      Encontrar comunidades
                    </Button>
                  </div>
                )}
              </div>
            </section>

            <section className="content-section">
              <SectionHeader eyebrow="ATIVIDADE" title="Nas suas comunidades" />
              <div className="grid gap-2">
                {summary.communityActivity.length ? summary.communityActivity.map((activity) => (
                  <Button
                    key={activity.postId}
                    type="button"
                    size="md"
                    color="tertiary"
                    className={dashboardRowButtonClass}
                    noTextPadding
                    onPress={() => void routeNavigate({ to: buildCommunityPath(activity.communityId) })}
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary">
                      <Sparkles className="size-5 text-tertiary" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-primary">{activity.communityName}</span>
                      <span className="block truncate text-xs font-normal text-tertiary">
                        {activity.authorName ? `Publicação de ${activity.authorName}` : "Nova publicação"} · {formattedDate(activity.createdAt)}
                      </span>
                    </span>
                    <ChevronRight className="size-4 text-quaternary" aria-hidden="true" />
                  </Button>
                )) : (
                  <p className="rounded-2xl border border-secondary bg-primary p-4 text-center text-sm text-tertiary">
                    Nenhuma atividade recente nas suas comunidades.
                  </p>
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
