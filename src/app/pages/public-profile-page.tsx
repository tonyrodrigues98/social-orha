import { useMemo, useState, type ReactNode } from "react";
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  Church,
  Film,
  Flag,
  Gamepad2,
  HeartHandshake,
  LockKeyhole,
  MapPin,
  MicVocal,
  Music2,
  ShieldBan,
  Sparkles,
  Tv,
  Unlock,
  UserPlus,
  UserRoundCheck,
  UserRoundX,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogTrigger,
  Heading,
  Modal,
  ModalOverlay,
} from "react-aria-components";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import {
  buildPublicProfileReportPath,
  publicProfileAgeLabel,
  resolvePublicProfileViewState,
  type PublicProfile,
  type PublicProfileViewState,
} from "@/domain/public-profile";
import type { FavoriteCategory } from "@/domain/profile-data";
import type { ProfileMediaWithUrl } from "@/domain/profile-media";
import { useOwnProfileMediaQuery } from "../profile/profile-queries";
import { useAuth } from "../auth/auth-context";
import {
  usePublicProfileActions,
  usePublicProfileRouteData,
} from "../public-profile/public-profile-hooks";

export type PublicProfilePageProps = {
  username: string;
  onBack: () => void;
  onNavigate: (path: string) => void;
  onOpenOwnProfile?: () => void;
};

const favoriteSections: Array<{
  category: FavoriteCategory;
  label: string;
  icon: typeof Film;
}> = [
  { category: "movies", label: "Filmes", icon: Film },
  { category: "series", label: "Séries", icon: Tv },
  { category: "songs", label: "Músicas", icon: Music2 },
  { category: "artists", label: "Artistas", icon: MicVocal },
  { category: "books", label: "Livros", icon: BookOpen },
  { category: "games", label: "Jogos", icon: Gamepad2 },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("pt-BR") ?? "")
    .join("");
}

function stateLabel(state: PublicProfileViewState): string | null {
  if (state === "own") return "Seu perfil";
  if (state === "friend") return "Amigo";
  if (state === "pending_incoming") return "Quer ser seu amigo";
  if (state === "pending_outgoing") return "Solicitação enviada";
  return null;
}

function ProfileHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex min-h-14 items-center gap-2 border-b border-gray-100 bg-white/95 px-3 pb-2 pt-[max(8px,env(safe-area-inset-top))] backdrop-blur">
      <button
        type="button"
        aria-label="Voltar"
        onClick={onBack}
        className="grid size-11 shrink-0 place-items-center rounded-full outline-none active:bg-gray-100 focus-visible:ring-2 focus-visible:ring-violet-600"
      >
        <ChevronLeft aria-hidden size={22} />
      </button>
      <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-gray-950">{title}</h1>
    </header>
  );
}

function ProfileRouteState({
  title,
  description,
  icon,
  onBack,
  retry,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  onBack: () => void;
  retry?: () => void;
}) {
  return (
    <div className="page min-h-dvh bg-white">
      <ProfileHeader title="Perfil" onBack={onBack} />
      <main className="grid min-h-[70dvh] place-items-center px-7 text-center">
        <div>
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-gray-100 text-gray-600">
            {icon}
          </span>
          <h2 className="mt-4 text-lg font-semibold text-gray-950">{title}</h2>
          <p className="mt-1 text-sm leading-5 text-gray-500">{description}</p>
          {retry ? (
            <Button color="secondary" size="md" className="mt-5" onPress={retry}>
              Tentar novamente
            </Button>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function ConfirmAction({
  label,
  title,
  description,
  confirmLabel,
  destructive = false,
  pending,
  onConfirm,
}: {
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  pending: boolean;
  onConfirm: () => Promise<void>;
}) {
  return (
    <DialogTrigger>
      <Button
        color={destructive ? "secondary-destructive" : "secondary"}
        size="md"
        iconLeading={destructive ? UserRoundX : ShieldBan}
        isDisabled={pending}
      >
        {label}
      </Button>
      <ModalOverlay className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" isDismissable={!pending}>
        <Modal className="w-full max-w-sm rounded-t-[28px] bg-white p-5 outline-none sm:rounded-[28px]">
          <Dialog role="alertdialog" className="outline-none">
            {({ close }) => (
              <>
                <header className="flex items-center justify-between gap-3">
                  <Heading slot="title" className="text-lg font-semibold text-gray-950">{title}</Heading>
                  <Button
                    color="tertiary"
                    size="sm"
                    iconLeading={X}
                    aria-label="Fechar"
                    isDisabled={pending}
                    onPress={close}
                  />
                </header>
                <p className="mt-2 text-sm leading-5 text-gray-600">{description}</p>
                <div className="mt-5 grid grid-cols-2 gap-2 pb-[env(safe-area-inset-bottom)]">
                  <Button color="secondary" size="md" isDisabled={pending} onPress={close}>
                    Voltar
                  </Button>
                  <Button
                    color={destructive ? "primary-destructive" : "primary"}
                    size="md"
                    isLoading={pending}
                    onPress={() => void onConfirm().then(close)}
                  >
                    {confirmLabel}
                  </Button>
                </div>
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}

function ProfileActions({
  state,
  friendshipId,
  pending,
  onOwnProfile,
  onRequest,
  onRespond,
  onRemove,
  onBlock,
  onReport,
}: {
  state: PublicProfileViewState;
  friendshipId: string | null;
  pending: boolean;
  onOwnProfile: () => void;
  onRequest: () => Promise<void>;
  onRespond: (accept: boolean) => Promise<void>;
  onRemove: () => Promise<void>;
  onBlock: () => Promise<void>;
  onReport: () => void;
}) {
  if (state === "own") {
    return (
      <Button color="primary" size="md" className="w-full" onPress={onOwnProfile}>
        Abrir meu perfil
      </Button>
    );
  }

  return (
    <div className="grid gap-2">
      {state === "public" ? (
        <Button
          color="primary"
          size="md"
          iconLeading={UserPlus}
          isLoading={pending}
          onPress={() => void onRequest()}
        >
          Solicitar amizade
        </Button>
      ) : null}
      {state === "pending_incoming" && friendshipId ? (
        <div className="grid grid-cols-2 gap-2">
          <Button color="primary" size="md" isDisabled={pending} onPress={() => void onRespond(true)}>
            Aceitar
          </Button>
          <Button color="secondary" size="md" isDisabled={pending} onPress={() => void onRespond(false)}>
            Recusar
          </Button>
        </div>
      ) : null}
      {state === "pending_outgoing" && friendshipId ? (
        <Button color="secondary" size="md" isLoading={pending} onPress={() => void onRemove()}>
          Cancelar solicitação
        </Button>
      ) : null}
      {state === "friend" && friendshipId ? (
        <ConfirmAction
          label="Remover amizade"
          title="Remover esta amizade?"
          description="A pessoa deixará sua lista de amigos. Uma nova amizade exigirá outra solicitação aceita."
          confirmLabel="Remover"
          destructive
          pending={pending}
          onConfirm={onRemove}
        />
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <ConfirmAction
          label="Bloquear"
          title="Bloquear este perfil?"
          description="O bloqueio encerra a amizade e impede novos contatos nas áreas protegidas."
          confirmLabel="Bloquear"
          destructive
          pending={pending}
          onConfirm={onBlock}
        />
        <Button color="secondary" size="md" iconLeading={Flag} isDisabled={pending} onPress={onReport}>
          Denunciar
        </Button>
      </div>
    </div>
  );
}

function ChipSection({ title, items }: { title: string; items: readonly string[] }) {
  if (!items.length) return null;
  return (
    <section className="rounded-3xl border border-gray-100 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-950">{title}</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <span className="rounded-full bg-violet-50 px-3 py-2 text-sm text-violet-800" key={item}>
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}

function FavoritesSection({ profile }: { profile: PublicProfile }) {
  if (!profile.canViewFavorites) return null;
  const available = favoriteSections.filter(
    ({ category }) => profile.favorites[category].length > 0,
  );
  if (!available.length) return null;
  return (
    <section className="rounded-3xl border border-gray-100 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-950">Favoritos</h2>
      <div className="mt-3 space-y-4">
        {available.map(({ category, label, icon: Icon }) => (
          <div key={category}>
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Icon aria-hidden size={17} /> {label}
            </div>
            <div className="mt-2 flex snap-x gap-2 overflow-x-auto pb-1">
              {profile.favorites[category].map((item) => (
                <span
                  className="min-w-32 snap-start rounded-2xl bg-gray-50 px-3 py-3 text-sm font-medium text-gray-800"
                  key={`${item.externalId ?? item.label}-${item.label}`}
                >
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function GallerySection({ media }: { media: readonly ProfileMediaWithUrl[] }) {
  const gallery = media.filter((item) => item.purpose === "gallery" && item.readUrl);
  const [openId, setOpenId] = useState<string | null>(null);
  const slides = useMemo(
    () => gallery.map((item) => ({
      src: item.readUrl!,
      width: item.width,
      height: item.height,
      mediaId: item.id,
    })),
    [gallery],
  );
  if (!gallery.length) return null;
  const openIndex = Math.max(0, gallery.findIndex((item) => item.id === openId));
  return (
    <section className="rounded-3xl border border-gray-100 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-950">Galeria</h2>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {gallery.map((item, index) => (
          <button
            type="button"
            className="aspect-square overflow-hidden rounded-2xl bg-gray-100 outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
            aria-label={`Abrir foto ${index + 1} de ${gallery.length}`}
            onClick={() => setOpenId(item.id)}
            key={item.id}
          >
            <img
              src={item.readUrl!}
              alt={`Foto ${index + 1} da galeria`}
              width={item.width}
              height={item.height}
              loading="lazy"
              className="size-full object-cover"
            />
          </button>
        ))}
      </div>
      <Lightbox
        open={Boolean(openId)}
        close={() => setOpenId(null)}
        index={openIndex}
        slides={slides}
        on={{ view: ({ index }) => setOpenId(gallery[index]?.id ?? null) }}
        carousel={{ finite: gallery.length <= 1 }}
        controller={{ closeOnBackdropClick: true }}
        labels={{ Close: "Fechar", Next: "Próxima foto", Previous: "Foto anterior" }}
      />
    </section>
  );
}

export function PublicProfilePage({
  username,
  onBack,
  onNavigate,
  onOpenOwnProfile,
}: PublicProfilePageProps) {
  const { user } = useAuth();
  const data = usePublicProfileRouteData(username);
  const profileId = data.profile?.id ?? data.ownBlock?.profileId ?? null;
  const mediaQuery = useOwnProfileMediaQuery(data.profile?.id ?? "");
  const actions = usePublicProfileActions({
    profileId,
    username: data.normalizedUsername,
  });
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!data.normalizedUsername) {
    return (
      <ProfileRouteState
        title="Username inválido"
        description="Confira o endereço deste perfil e tente novamente."
        icon={<LockKeyhole aria-hidden size={28} />}
        onBack={onBack}
      />
    );
  }
  if (data.isLoading) {
    return (
      <ProfileRouteState
        title="Carregando perfil"
        description="Verificando as informações que este perfil permite mostrar."
        icon={<Sparkles aria-hidden className="animate-pulse" size={28} />}
        onBack={onBack}
      />
    );
  }
  if (data.error) {
    return (
      <ProfileRouteState
        title="Não foi possível abrir o perfil"
        description="A conexão falhou antes de confirmar a privacidade deste perfil."
        icon={<LockKeyhole aria-hidden size={28} />}
        onBack={onBack}
        retry={() => void data.reload()}
      />
    );
  }

  const state = resolvePublicProfileViewState({
    viewerId: user?.id ?? "",
    profile: data.profile,
    blocked: data.ownBlock,
    friendship: data.friendship,
  });

  const runAction = async (action: () => Promise<unknown>, success: string) => {
    setActionError(null);
    setStatusMessage(null);
    try {
      await action();
      setStatusMessage(success);
    } catch (error) {
      setActionError(
        error instanceof Error && error.message.trim()
          ? error.message
          : "Não foi possível concluir esta ação.",
      );
      throw error;
    }
  };

  if (state === "blocked_by_viewer" && data.ownBlock) {
    const name = data.ownBlock.fullName ?? `@${data.ownBlock.username}`;
    return (
      <div className="page min-h-dvh bg-gray-50">
        <ProfileHeader title={`@${data.ownBlock.username}`} onBack={onBack} />
        <main className="grid min-h-[72dvh] place-items-center px-7 text-center">
          <div>
            <span className="mx-auto grid size-20 place-items-center rounded-full bg-red-50 text-red-700">
              <ShieldBan aria-hidden size={32} />
            </span>
            <h2 className="mt-4 text-xl font-semibold text-gray-950">{name} está bloqueado</h2>
            <p className="mt-2 text-sm leading-5 text-gray-600">
              O contato e as interações protegidas permanecem interrompidos até você desbloquear.
            </p>
            {actionError ? <p className="mt-3 text-sm text-red-700" role="alert">{actionError}</p> : null}
            <div className="mt-5 grid gap-2">
              <Button
                color="primary"
                size="md"
                iconLeading={Unlock}
                isLoading={actions.isPending}
                onPress={() => void runAction(actions.unblock, "Perfil desbloqueado.")}
              >
                Desbloquear perfil
              </Button>
              <Button
                color="secondary"
                size="md"
                iconLeading={Flag}
                onPress={() => onNavigate(buildPublicProfileReportPath(data.ownBlock!.profileId))}
              >
                Denunciar
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!data.profile || state === "private_or_unavailable") {
    return (
      <ProfileRouteState
        title="Perfil privado ou indisponível"
        description="Não exibimos se a conta é privada, inexistente ou bloqueou o acesso."
        icon={<LockKeyhole aria-hidden size={28} />}
        onBack={onBack}
      />
    );
  }

  const profile = data.profile;
  const media = mediaQuery.data ?? [];
  const avatar = media.find((item) => item.purpose === "avatar" && item.readUrl) ?? null;
  const cover = media.find((item) => item.purpose === "cover" && item.readUrl) ?? null;
  const badge = stateLabel(state);
  const ageLabel = publicProfileAgeLabel(profile);
  const friendshipId = data.friendship?.id ?? null;
  const location = profile.canViewLocation
    ? [profile.city, profile.stateCode].filter(Boolean).join(", ")
    : "";

  return (
    <div className="page min-h-dvh bg-gray-50">
      <ProfileHeader title={`@${profile.username}`} onBack={onBack} />
      <main className="pb-[max(32px,env(safe-area-inset-bottom))]">
        <section className="relative bg-white pb-5">
          <div className="aspect-[16/7] overflow-hidden bg-gradient-to-br from-violet-100 via-rose-50 to-amber-50">
            {cover?.readUrl ? (
              <img
                src={cover.readUrl}
                alt={`Capa do perfil de ${profile.fullName}`}
                width={cover.width}
                height={cover.height}
                className="size-full object-cover"
              />
            ) : null}
          </div>
          <div className="px-4">
            <Avatar
              size="2xl"
              src={avatar?.readUrl}
              alt={avatar?.readUrl ? `Foto de perfil de ${profile.fullName}` : undefined}
              initials={initials(profile.fullName)}
              className="-mt-8 ring-4 ring-white"
              contentClassName="bg-violet-100 text-violet-900"
            />
            <div className="mt-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-gray-950">{profile.fullName}</h1>
                <p className="text-sm text-gray-500">@{profile.username}</p>
              </div>
              {badge ? (
                <span className="shrink-0 rounded-full bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800">
                  {badge}
                </span>
              ) : null}
            </div>
            {profile.bio ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">{profile.bio}</p> : null}
            {location || profile.church || ageLabel ? (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-600">
                {ageLabel ? (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays aria-hidden size={16} />{ageLabel}
                  </span>
                ) : null}
                {location ? <span className="inline-flex items-center gap-1.5"><MapPin aria-hidden size={16} />{location}</span> : null}
                {profile.church ? <span className="inline-flex items-center gap-1.5"><Church aria-hidden size={16} />{profile.church}</span> : null}
              </div>
            ) : null}
            <div className="mt-5">
              <ProfileActions
                state={state}
                friendshipId={friendshipId}
                pending={actions.isPending}
                onOwnProfile={onOpenOwnProfile ?? (() => onNavigate("/perfil"))}
                onRequest={() => runAction(() => actions.requestFriendship(profile.id), "Solicitação enviada.")}
                onRespond={(accept) => runAction(
                  () => actions.respondFriendship(friendshipId!, accept),
                  accept ? "Solicitação aceita." : "Solicitação recusada.",
                )}
                onRemove={() => runAction(() => actions.removeFriendship(friendshipId!), state === "friend" ? "Amizade removida." : "Solicitação cancelada.")}
                onBlock={() => runAction(actions.block, "Perfil bloqueado.")}
                onReport={() => onNavigate(buildPublicProfileReportPath(profile.id))}
              />
            </div>
            {statusMessage ? <p className="mt-3 text-sm text-emerald-700" role="status">{statusMessage}</p> : null}
            {actionError ? <p className="mt-3 text-sm text-red-700" role="alert">{actionError}</p> : null}
          </div>
        </section>

        <div className="space-y-3 px-4 py-4">
          {profile.personality.length || profile.favoriteSeason || profile.socialEnergy ? (
            <section className="rounded-3xl border border-gray-100 bg-white p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-950">
                <Sparkles aria-hidden size={17} /> Sobre
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  ...profile.personality,
                  profile.favoriteSeason ? `Estação: ${profile.favoriteSeason}` : null,
                  profile.socialEnergy ? `Energia: ${profile.socialEnergy}` : null,
                ].filter((item): item is string => Boolean(item)).map((item) => (
                  <span className="rounded-full bg-gray-100 px-3 py-2 text-sm text-gray-700" key={item}>{item}</span>
                ))}
              </div>
            </section>
          ) : null}
          <ChipSection title="Interesses" items={profile.interests} />
          <ChipSection title="Hobbies" items={profile.hobbies} />
          <ChipSection title="Fim de semana" items={profile.weekendPreferences} />
          <ChipSection title="Lugares que já conheceu" items={profile.visitedPlaces} />
          <ChipSection title="Lugares que quer conhecer" items={profile.desiredPlaces} />
          <FavoritesSection profile={profile} />
          {profile.canViewGallery && mediaQuery.isPending ? (
            <div className="h-40 animate-pulse rounded-3xl bg-gray-100" aria-label="Carregando galeria" />
          ) : null}
          {profile.canViewGallery ? <GallerySection media={media} /> : null}
          {!profile.canViewFavorites || !profile.canViewGallery || !profile.canViewLocation || !profile.canViewAge ? (
            <aside className="flex gap-3 rounded-3xl bg-white p-4 text-sm leading-5 text-gray-600">
              <LockKeyhole aria-hidden className="mt-0.5 shrink-0" size={18} />
              Algumas informações permanecem privadas conforme as escolhas deste perfil.
            </aside>
          ) : null}
          {state === "friend" ? (
            <aside className="flex gap-3 rounded-3xl bg-emerald-50 p-4 text-sm leading-5 text-emerald-900">
              <HeartHandshake aria-hidden className="mt-0.5 shrink-0" size={18} />
              Vocês são amigos. A amizade não altera permissões além das escolhas de privacidade desta pessoa.
            </aside>
          ) : null}
          {state === "own" ? (
            <aside className="flex gap-3 rounded-3xl bg-violet-50 p-4 text-sm leading-5 text-violet-900">
              <UserRoundCheck aria-hidden className="mt-0.5 shrink-0" size={18} />
              Esta é a visualização pública do seu perfil com suas regras atuais.
            </aside>
          ) : null}
        </div>
      </main>
    </div>
  );
}
