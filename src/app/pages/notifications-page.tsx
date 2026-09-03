import { useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Bell,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  ShieldAlert,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/base/buttons/button";
import {
  presentNotification,
  useNotificationCenter,
  type Notification,
  type NotificationCategory,
} from "@/domains/notifications";

const filters: Array<{ value: NotificationCategory | "all"; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "important", label: "Importantes" },
  { value: "social", label: "Social" },
  { value: "messages", label: "Mensagens" },
  { value: "system", label: "Sistema" },
];

function NotificationIcon({ category }: { category: NotificationCategory }) {
  if (category === "important") return <ShieldAlert aria-hidden size={20} />;
  if (category === "messages") return <MessageCircle aria-hidden size={20} />;
  if (category === "social") return <UsersRound aria-hidden size={20} />;
  return <Bell aria-hidden size={20} />;
}

function NotificationRow({
  notification,
  onOpen,
}: {
  notification: Notification;
  onOpen: (notification: Notification, path: string) => Promise<void>;
}) {
  const presentation = presentNotification(notification);
  const content = (
    <>
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-full ${
          notification.readAt ? "bg-gray-100 text-gray-600" : "bg-violet-100 text-violet-700"
        }`}
      >
        <NotificationIcon category={notification.category} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="flex items-start gap-2">
          <strong className="min-w-0 flex-1 text-[15px] leading-5 text-gray-950">
            {presentation.title}
          </strong>
          {!notification.readAt && (
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-violet-600" aria-label="Não lida" />
          )}
        </span>
        <span className="mt-0.5 block text-sm leading-5 text-gray-600">
          {presentation.description}
        </span>
        <time className="mt-1 block text-xs text-gray-500" dateTime={notification.createdAt}>
          {formatDistanceToNowStrict(new Date(notification.createdAt), {
            addSuffix: true,
            locale: ptBR,
          })}
        </time>
      </span>
      <ChevronRight aria-hidden className="shrink-0 text-gray-400" size={18} />
    </>
  );

  if (!presentation.targetPath) {
    return <div className="flex gap-3 px-4 py-3.5">{content}</div>;
  }
  return (
    <button
      type="button"
      className="flex min-h-16 w-full items-center gap-3 px-4 py-3.5 text-left outline-none transition-colors active:bg-gray-50 focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-inset"
      onClick={() => void onOpen(notification, presentation.targetPath!)}
    >
      {content}
    </button>
  );
}

export function NotificationsPage({
  onBack,
  onNavigate,
}: {
  onBack: () => void;
  onNavigate: (path: string) => void;
}) {
  const [category, setCategory] = useState<NotificationCategory | "all">("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const query = useNotificationCenter({ category, unreadOnly });

  const openNotification = async (notification: Notification, path: string) => {
    setActionError(null);
    try {
      if (!notification.readAt) await query.markRead([notification.id]);
    } catch {
      setActionError("Não foi possível marcar esta notificação como lida.");
    } finally {
      onNavigate(path);
    }
  };

  return (
    <div className="page min-h-dvh bg-white">
      <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/95 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex min-h-11 items-center gap-2">
          <button
            type="button"
            aria-label="Voltar"
            onClick={onBack}
            className="grid size-11 shrink-0 place-items-center rounded-full outline-none active:bg-gray-100 focus-visible:ring-2 focus-visible:ring-violet-600"
          >
            <ChevronLeft aria-hidden size={22} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-gray-950">Notificações</h1>
            <p className="text-xs text-gray-500">
              {query.unreadCount === 0 ? "Tudo em dia" : `${query.unreadCount} não lida${query.unreadCount === 1 ? "" : "s"}`}
            </p>
          </div>
          <Button
            color="tertiary"
            size="sm"
            iconLeading={CheckCheck}
            isDisabled={query.unreadCount === 0}
            onPress={() => void query.markAllRead().catch(() => setActionError("Não foi possível atualizar as notificações."))}
          >
            Ler todas
          </Button>
        </div>
        <div className="-mx-1 mt-3 flex gap-1 overflow-x-auto px-1 pb-1" role="group" aria-label="Filtrar notificações">
          {filters.map((filter) => (
            <button
              type="button"
              aria-pressed={category === filter.value}
              key={filter.value}
              onClick={() => setCategory(filter.value)}
              className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-violet-600 ${
                category === filter.value ? "bg-gray-950 text-white" : "bg-gray-100 text-gray-600"
              }`}
            >
              {filter.label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={unreadOnly}
            onClick={() => setUnreadOnly((current) => !current)}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-violet-600 ${
              unreadOnly ? "bg-violet-700 text-white" : "bg-violet-50 text-violet-700"
            }`}
          >
            Não lidas
          </button>
        </div>
      </header>

      <main className="pb-[max(24px,env(safe-area-inset-bottom))]">
        {(query.error || actionError) && (
          <div className="m-4 rounded-2xl border border-red-200 bg-red-50 p-4" role="alert">
            <p className="text-sm text-red-800">{actionError ?? query.error}</p>
            {query.error && (
              <Button color="secondary-destructive" size="sm" className="mt-3" onPress={() => void query.reload()}>
                Tentar novamente
              </Button>
            )}
          </div>
        )}

        {query.status === "loading" && (
          <div className="space-y-px" aria-label="Carregando notificações">
            {Array.from({ length: 5 }, (_, index) => (
              <div className="flex animate-pulse gap-3 px-4 py-4" key={index}>
                <span className="size-11 rounded-full bg-gray-100" />
                <span className="flex-1 space-y-2 py-1">
                  <span className="block h-4 w-2/3 rounded bg-gray-100" />
                  <span className="block h-3 w-full rounded bg-gray-100" />
                </span>
              </div>
            ))}
          </div>
        )}

        {query.status === "ready" && query.items.length === 0 && (
          <section className="grid min-h-[55dvh] place-items-center px-8 text-center">
            <div>
              <span className="mx-auto grid size-16 place-items-center rounded-full bg-violet-50 text-violet-700">
                <Bell aria-hidden size={26} />
              </span>
              <h2 className="mt-4 text-lg font-semibold text-gray-950">Nenhuma notificação</h2>
              <p className="mt-1 text-sm leading-5 text-gray-500">
                As novidades reais da sua conta aparecerão aqui.
              </p>
            </div>
          </section>
        )}

        {query.items.length > 0 && (
          <div className="divide-y divide-gray-100" aria-live="polite">
            {query.items.map((notification) => (
              <NotificationRow notification={notification} onOpen={openNotification} key={notification.id} />
            ))}
          </div>
        )}

        {query.nextCursor && (
          <div className="px-4 py-5">
            <Button
              color="secondary"
              size="md"
              className="w-full"
              isLoading={query.isLoadingMore}
              onPress={() => void query.loadMore()}
            >
              Carregar anteriores
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
