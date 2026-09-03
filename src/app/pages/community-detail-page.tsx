import { useMemo, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  Flag,
  Heart,
  ImagePlus,
  LockKeyhole,
  MessageCircleMore,
  Pencil,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRoundCheck,
  UserRoundX,
  UsersRound,
} from "lucide-react";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import { FileTrigger } from "@/components/base/file-upload-trigger/file-upload-trigger";
import { TextArea } from "@/components/base/textarea/textarea";
import {
  MAX_COMMUNITY_MEDIA_ITEMS,
  validateCommunityMediaFile,
  type CommunityPostMedia,
} from "@/domain/community-management";
import {
  useCommunity,
  useCommunityActions,
  useCommunityRules,
  useMemberships,
  usePost,
  usePostActions,
  usePosts,
  type CommunityMembership,
  type CommunityPost,
  type ReactionKind,
} from "@/domains/social";
import { processProfileImage } from "@/infrastructure/media/profile-image-processor";
import { useAuth } from "../auth/auth-context";
import {
  buildCommunityPostReportPath,
  buildCommunityReportPath,
  canPublishInCommunity,
  communityCategoryLabel,
  communityMembershipActionLabel,
  resolveCommunityAccessState,
} from "../community/community-detail-model";
import {
  groupPostMediaByPost,
  useCommunityAssets,
  useCommunityManagementActions,
  useCommunityPostMedia,
} from "../community/community-management-hooks";
import { CommunityManagerDrawer } from "../community/community-manager-drawer";
import { CommunityPostThreadDrawer } from "../community/community-post-thread-drawer";

export type CommunityDetailPageProps = {
  communityId: string;
  onBack: () => void;
  onNavigate: (path: string) => void;
  onOpenPost?: (post: CommunityPost) => void;
  initialPostId?: string | null;
  onCloseInitialPost?: () => void;
  onOpenProfile?: (username: string) => void;
};

const reactionOptions: Array<{ kind: ReactionKind; label: string }> = [
  { kind: "like", label: "Curtir" },
  { kind: "love", label: "Amei" },
  { kind: "amen", label: "Amém" },
  { kind: "pray", label: "Oração" },
  { kind: "support", label: "Apoio" },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("pt-BR") ?? "")
    .join("");
}

function CommunityHeader({ title, onBack }: { title: string; onBack: () => void }) {
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

function CommunityRouteState({
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
      <CommunityHeader title="Comunidade" onBack={onBack} />
      <main className="grid min-h-[70dvh] place-items-center px-7 text-center">
        <div>
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-gray-100 text-gray-600">{icon}</span>
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

function MemberRow({
  membership,
  onOpenProfile,
  canChangeRole,
  pending,
  onChangeRole,
  canBan,
  onBan,
}: {
  membership: CommunityMembership;
  onOpenProfile?: (username: string) => void;
  canChangeRole?: boolean;
  pending?: boolean;
  onChangeRole?: () => void;
  canBan?: boolean;
  onBan?: () => void;
}) {
  const profile = membership.profile;
  const displayName = profile?.fullName ?? "Perfil indisponível";
  return (
    <div className="flex min-h-14 w-full items-center gap-2 rounded-2xl px-2">
      <button
        type="button"
        disabled={!profile || !onOpenProfile}
        onClick={() => {
          if (profile && onOpenProfile) onOpenProfile(profile.username);
        }}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl text-left outline-none active:bg-gray-50 focus-visible:ring-2 focus-visible:ring-violet-600 disabled:cursor-default"
      >
        <Avatar
          size="md"
          initials={initials(displayName)}
          contentClassName="bg-violet-50 text-violet-800"
        />
        <span className="min-w-0 flex-1">
          <strong className="block truncate text-sm text-gray-950">{displayName}</strong>
          <small className="block truncate text-xs text-gray-500">
            {profile ? `@${profile.username.replace(/^@/, "")}` : "Dados protegidos"}
          </small>
        </span>
      </button>
      {canChangeRole && onChangeRole ? (
        <button
          type="button"
          disabled={pending}
          onClick={onChangeRole}
          className="min-h-11 shrink-0 rounded-full border border-gray-200 px-2.5 text-[11px] font-semibold text-gray-700 outline-none focus-visible:ring-2 focus-visible:ring-violet-600 disabled:opacity-50"
        >
          {membership.role === "moderator" ? "Tornar membro" : "Tornar mod."}
        </button>
      ) : membership.role !== "member" ? (
        <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
          {membership.role === "owner" ? "Responsável" : "Moderação"}
        </span>
      ) : null}
      {canBan && onBan ? (
        <button
          type="button"
          aria-label={`Remover ${displayName} da comunidade`}
          disabled={pending}
          onClick={onBan}
          className="grid size-11 shrink-0 place-items-center rounded-full text-red-600 outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-50"
        >
          <UserRoundX aria-hidden size={17} />
        </button>
      ) : null}
    </div>
  );
}

function PostCard({
  post,
  media,
  currentUserId,
  pending,
  canDelete,
  confirmDelete,
  onOpen,
  onOpenProfile,
  onReact,
  onReport,
  onAskDelete,
  onCancelDelete,
  onDelete,
  onRemoveMedia,
}: {
  post: CommunityPost;
  media: readonly CommunityPostMedia[];
  currentUserId: string | null;
  pending: boolean;
  canDelete: boolean;
  confirmDelete: boolean;
  onOpen?: () => void;
  onOpenProfile?: (username: string) => void;
  onReact: (kind: ReactionKind | null) => void;
  onReport: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  onRemoveMedia: (media: CommunityPostMedia) => void;
}) {
  const authorName = post.author?.fullName ?? "Perfil indisponível";
  return (
    <article
      className="rounded-3xl border border-gray-100 bg-white p-4"
      data-testid={`community-post-${post.id}`}
    >
      <header className="flex items-center gap-3">
        <button
          type="button"
          disabled={!post.author || !onOpenProfile}
          onClick={() => {
            if (post.author && onOpenProfile) onOpenProfile(post.author.username);
          }}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-violet-600 disabled:cursor-default"
        >
          <Avatar size="md" initials={initials(authorName)} contentClassName="bg-gray-100 text-gray-700" />
          <span className="min-w-0 flex-1">
            <strong className="block truncate text-sm text-gray-950">{authorName}</strong>
            <time className="block text-xs text-gray-500" dateTime={post.createdAt}>
              {new Date(post.createdAt).toLocaleString("pt-BR")}
            </time>
          </span>
        </button>
        <div className="flex shrink-0">
          <button
            type="button"
            aria-label="Denunciar publicação"
            onClick={onReport}
            className="grid size-11 place-items-center rounded-full text-gray-500 outline-none active:bg-gray-100 focus-visible:ring-2 focus-visible:ring-violet-600"
          >
            <Flag aria-hidden size={17} />
          </button>
          {canDelete ? (
            <button
              type="button"
              aria-label="Excluir publicação"
              onClick={onAskDelete}
              className="grid size-11 place-items-center rounded-full text-red-600 outline-none active:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-600"
            >
              <Trash2 aria-hidden size={17} />
            </button>
          ) : null}
        </div>
      </header>
      <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-6 text-gray-800">{post.body}</p>
      {media.length ? (
        <div className={`mt-3 grid gap-1 overflow-hidden rounded-2xl ${media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {media.map((item) => (
            <div className="relative min-h-40 overflow-hidden bg-gray-100" key={item.id}>
              {item.readUrl ? (
                item.mimeType === "video/mp4" ? (
                  <video
                    src={item.readUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="size-full max-h-[420px] object-cover"
                    aria-label="Vídeo da publicação"
                  />
                ) : (
                  <img
                    src={item.readUrl}
                    alt=""
                    width={item.width ?? 1200}
                    height={item.height ?? 900}
                    loading="lazy"
                    decoding="async"
                    className="size-full max-h-[420px] object-cover"
                  />
                )
              ) : (
                <span className="grid min-h-40 place-items-center px-3 text-center text-xs text-gray-500">
                  Mídia temporariamente indisponível
                </span>
              )}
              {item.ownerId === currentUserId ? (
                <button
                  type="button"
                  aria-label="Remover mídia da publicação"
                  disabled={pending}
                  onClick={() => onRemoveMedia(item)}
                  className="absolute right-2 top-2 grid size-11 place-items-center rounded-full bg-black/75 text-white outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
                >
                  <Trash2 aria-hidden size={16} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-4 flex snap-x gap-2 overflow-x-auto pb-1" role="group" aria-label="Reagir à publicação">
        {reactionOptions.map(({ kind, label }) => {
          const selected = post.viewerReaction === kind;
          return (
            <button
              type="button"
              aria-pressed={selected}
              disabled={pending}
              className={`min-h-11 shrink-0 snap-start rounded-full border px-3 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-violet-600 ${
                selected
                  ? "border-violet-600 bg-violet-50 text-violet-800"
                  : "border-gray-200 bg-white text-gray-600"
              }`}
              onClick={() => onReact(selected ? null : kind)}
              data-testid={`community-post-reaction-${kind}-${post.id}`}
              key={kind}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3 text-xs text-gray-500">
        <span>{post.reactionCount} {post.reactionCount === 1 ? "reação" : "reações"}</span>
        {onOpen ? (
          <button
            type="button"
            className="min-h-11 rounded-full px-3 font-semibold text-violet-700 outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
            onClick={onOpen}
            data-testid={`community-post-comments-${post.id}`}
          >
            {post.commentCount} {post.commentCount === 1 ? "comentário" : "comentários"}
          </button>
        ) : (
          <span>{post.commentCount} {post.commentCount === 1 ? "comentário" : "comentários"}</span>
        )}
      </div>
      {confirmDelete ? (
        <div className="mt-3 rounded-2xl bg-red-50 p-3" role="alertdialog" aria-label="Confirmar exclusão da publicação">
          <p className="text-sm font-medium text-red-900">Excluir esta publicação e seus comentários?</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button color="secondary" size="sm" isDisabled={pending} onPress={onCancelDelete}>Cancelar</Button>
            <Button color="primary-destructive" size="sm" isLoading={pending} onPress={onDelete}>Excluir</Button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function CommunityDetailPage({
  communityId,
  onBack,
  onNavigate,
  onOpenPost,
  initialPostId = null,
  onCloseInitialPost,
  onOpenProfile,
}: CommunityDetailPageProps) {
  const { identity } = useAuth();
  const currentUserId = identity?.profile.id ?? null;
  const communityQuery = useCommunity(communityId);
  const rulesQuery = useCommunityRules(communityId);
  const membershipsQuery = useMemberships({ communityId });
  const postsQuery = usePosts({ communityId });
  const initialPostQuery = usePost(communityId, initialPostId);
  const communityActions = useCommunityActions();
  const postActions = usePostActions();
  const managementActions = useCommunityManagementActions(communityId);
  const communityAssets = useCommunityAssets(
    communityId,
    communityQuery.data?.avatarPath ?? null,
    communityQuery.data?.coverPath ?? null,
  );
  const postIds = useMemo(() => postsQuery.items.map((post) => post.id), [postsQuery.items]);
  const postMediaQuery = useCommunityPostMedia(postIds);
  const postMediaByPost = useMemo(
    () => groupPostMediaByPost(postMediaQuery.data),
    [postMediaQuery.data],
  );
  const [postBody, setPostBody] = useState("");
  const [postFiles, setPostFiles] = useState<File[]>([]);
  const [managerOpen, setManagerOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null);
  const [deletePostId, setDeletePostId] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState<CommunityMembership | null>(null);
  const [banReason, setBanReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const threadPost = initialPostId ? initialPostQuery.data : selectedPost;
  const initialPostUnavailable = Boolean(initialPostId)
    && (initialPostQuery.status === "error"
      || (initialPostQuery.status === "ready" && !initialPostQuery.data));

  if (communityQuery.status === "loading") {
    return (
      <CommunityRouteState
        title="Carregando comunidade"
        description="Verificando participação, regras e conteúdo disponível."
        icon={<Sparkles aria-hidden className="animate-pulse" size={28} />}
        onBack={onBack}
      />
    );
  }
  if (communityQuery.status === "error") {
    return (
      <CommunityRouteState
        title="Não foi possível abrir a comunidade"
        description={communityQuery.error ?? "A comunidade não respondeu agora."}
        icon={<UsersRound aria-hidden size={28} />}
        onBack={onBack}
        retry={() => void communityQuery.reload()}
      />
    );
  }
  if (!communityQuery.data) {
    return (
      <CommunityRouteState
        title="Comunidade privada ou indisponível"
        description="Este endereço não está disponível para sua conta."
        icon={<LockKeyhole aria-hidden size={28} />}
        onBack={onBack}
      />
    );
  }

  const community = communityQuery.data;
  const access = resolveCommunityAccessState(community.viewerMembership);
  const membershipLabel = communityMembershipActionLabel(community, access);
  const canPublish = canPublishInCommunity(access);
  const canManage = access === "owner" || access === "moderator";
  const activeMembers = membershipsQuery.items.filter((membership) => membership.status === "active");
  const pendingMembers = canManage
    ? membershipsQuery.items.filter((membership) => membership.status === "pending")
    : [];
  const bannedMembers = canManage
    ? membershipsQuery.items.filter((membership) => membership.status === "banned")
    : [];

  const runAction = async (action: () => Promise<unknown>, success: string) => {
    setActionError(null);
    setStatusMessage(null);
    try {
      await action();
      setStatusMessage(success);
      return true;
    } catch (error) {
      setActionError(
        error instanceof Error && error.message.trim()
          ? error.message
          : "Não foi possível concluir esta ação.",
      );
      return false;
    }
  };

  const updateMembership = async () => {
    if (access === "banned" || access === "owner") return;
    if (access === "member" || access === "moderator" || access === "pending") {
      await runAction(
        () => communityActions.leave(community.id),
        access === "pending" ? "Solicitação cancelada." : "Você saiu da comunidade.",
      );
      return;
    }
    setActionError(null);
    setStatusMessage(null);
    try {
      const membership = await communityActions.join(community.id);
      setStatusMessage(
        membership.status === "pending"
          ? "Solicitação enviada à moderação."
          : "Você entrou na comunidade.",
      );
    } catch (error) {
      setActionError(error instanceof Error && error.message.trim()
        ? error.message
        : "Não foi possível atualizar sua participação.");
    }
  };

  const createPost = async () => {
    const body = postBody.trim();
    if (!body) {
      setActionError("Escreva algo antes de publicar.");
      return;
    }
    setActionError(null);
    setStatusMessage(null);
    let created: CommunityPost;
    try {
      created = await postActions.createPost({
        communityId: community.id,
        body,
        visibility: "community",
      });
      setPostBody("");
      setPostFiles([]);
    } catch (error) {
      setActionError(error instanceof Error && error.message.trim()
        ? error.message
        : "Não foi possível criar a publicação.");
      return;
    }

    let uploaded = 0;
    try {
      for (const [index, sourceFile] of postFiles.entries()) {
        if (sourceFile.type === "video/mp4") {
          await managementActions.uploadPostMedia({
            postId: created.id,
            file: sourceFile,
            dimensions: { width: null, height: null },
            sortOrder: index,
          });
        } else {
          const image = await processProfileImage(sourceFile, { purpose: "gallery" });
          await managementActions.uploadPostMedia({
            postId: created.id,
            file: image.file,
            dimensions: { width: image.width, height: image.height },
            sortOrder: index,
          });
        }
        uploaded += 1;
      }
      setStatusMessage(postFiles.length
        ? "Publicação e mídia salvas."
        : "Publicação criada.");
    } catch {
      setActionError(
        uploaded
          ? `A publicação foi criada com ${uploaded} mídia(s), mas não foi possível enviar o restante.`
          : "A publicação foi criada, mas a mídia não pôde ser enviada. Você pode removê-la e tentar novamente.",
      );
    }
  };

  const selectPostMedia = (files: FileList | null) => {
    const selected = Array.from(files ?? []);
    if (!selected.length) return;
    const available = MAX_COMMUNITY_MEDIA_ITEMS - postFiles.length;
    if (selected.length > available) {
      setActionError(`Você pode adicionar no máximo ${MAX_COMMUNITY_MEDIA_ITEMS} mídias por publicação.`);
      return;
    }
    try {
      for (const file of selected) validateCommunityMediaFile(file, "post");
      setPostFiles((current) => [...current, ...selected]);
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "A mídia selecionada não é permitida.");
    }
  };

  return (
    <div className="page min-h-dvh bg-gray-50">
      <CommunityHeader title={community.name} onBack={onBack} />
      <main className="pb-[max(32px,env(safe-area-inset-bottom))]">
        {initialPostId && initialPostQuery.status === "loading" ? (
          <div
            className="mx-4 mt-4 rounded-2xl border border-gray-100 bg-white px-4 py-3 text-sm text-gray-600"
            role="status"
          >
            Abrindo publicação…
          </div>
        ) : null}
        {initialPostUnavailable ? (
          <div className="mx-4 mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4" role="alert">
            <strong className="text-sm text-gray-950">Publicação indisponível</strong>
            <p className="mt-1 text-sm leading-5 text-gray-600">
              Esta publicação não pode ser aberta agora.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {initialPostQuery.status === "error" ? (
                <Button color="secondary" size="sm" onPress={() => void initialPostQuery.reload()}>
                  Tentar novamente
                </Button>
              ) : null}
              <Button color="tertiary" size="sm" onPress={onCloseInitialPost}>
                Voltar à comunidade
              </Button>
            </div>
          </div>
        ) : null}
        <section className="bg-white px-4 py-5">
          {communityAssets.data?.coverUrl ? (
            <div className="-mx-4 -mt-5 mb-4 aspect-[16/7] overflow-hidden bg-violet-50">
              <img
                src={communityAssets.data.coverUrl}
                alt=""
                width={1600}
                height={700}
                className="size-full object-cover"
              />
            </div>
          ) : null}
          <div className="flex items-start gap-4">
            <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-3xl bg-violet-100 text-xl font-semibold text-violet-900">
              {communityAssets.data?.avatarUrl ? (
                <img
                  src={communityAssets.data.avatarUrl}
                  alt=""
                  width={128}
                  height={128}
                  className="size-full object-cover"
                />
              ) : community.name.slice(0, 2).toLocaleUpperCase("pt-BR")}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold tracking-tight text-gray-950">{community.name}</h1>
              <div className="mt-1 flex flex-wrap gap-2 text-xs font-medium text-gray-600">
                <span>{communityCategoryLabel(community.category)}</span>
                <span aria-hidden>·</span>
                <span>{community.visibility === "private" ? "Privada" : "Pública"}</span>
              </div>
            </div>
            {canManage ? (
              <button
                type="button"
                aria-label="Administrar comunidade"
                onClick={() => setManagerOpen(true)}
                className="grid size-11 shrink-0 place-items-center rounded-full border border-gray-200 text-gray-700 outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
              >
                <Pencil aria-hidden size={17} />
              </button>
            ) : null}
          </div>
          {community.description ? <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-gray-700">{community.description}</p> : null}
          <div className="mt-4 flex gap-4 text-sm text-gray-600">
            <span><strong className="text-gray-950">{community.memberCount}</strong> membros</span>
            <span><strong className="text-gray-950">{community.postCount}</strong> publicações</span>
          </div>
          <div className="mt-5 grid gap-2">
            {membershipLabel ? (
              <Button
                color={access === "member" || access === "moderator" || access === "pending" ? "secondary" : "primary"}
                size="md"
                isDisabled={access === "banned" || communityActions.isPending}
                isLoading={communityActions.isPending}
                onPress={() => void updateMembership()}
              >
                {membershipLabel}
              </Button>
            ) : (
              <div className="flex min-h-11 items-center gap-2 rounded-2xl bg-violet-50 px-4 text-sm font-semibold text-violet-800">
                <ShieldCheck aria-hidden size={18} /> Você administra esta comunidade
              </div>
            )}
            <Button
              color="secondary"
              size="md"
              iconLeading={Flag}
              onPress={() => onNavigate(buildCommunityReportPath(community.id))}
            >
              Denunciar comunidade
            </Button>
          </div>
          {statusMessage ? <p className="mt-3 text-sm text-emerald-700" role="status">{statusMessage}</p> : null}
          {actionError ? <p className="mt-3 text-sm text-red-700" role="alert">{actionError}</p> : null}
        </section>

        <div className="space-y-4 px-4 py-4">
          {rulesQuery.status === "loading" ? (
            <div className="h-28 animate-pulse rounded-3xl bg-gray-100" aria-label="Carregando regras" />
          ) : rulesQuery.status === "error" ? (
            <section className="rounded-3xl border border-red-200 bg-red-50 p-4" role="alert">
              <p className="text-sm text-red-800">{rulesQuery.error}</p>
              <Button color="secondary-destructive" size="sm" className="mt-2" onPress={() => void rulesQuery.reload()}>
                Tentar carregar regras
              </Button>
            </section>
          ) : rulesQuery.items.length ? (
            <section className="rounded-3xl border border-gray-100 bg-white p-4">
              <h2 className="flex items-center gap-2 font-semibold text-gray-950">
                <ShieldCheck aria-hidden size={18} /> Regras
              </h2>
              <ol className="mt-3 space-y-3 pl-5">
                {rulesQuery.items.map((rule) => (
                  <li className="pl-1 text-sm leading-5 text-gray-700" key={rule.id}>
                    <strong className="block text-gray-950">{rule.title}</strong>
                    <span>{rule.description}</span>
                  </li>
                ))}
              </ol>
              {rulesQuery.hasMore ? (
                <Button color="secondary" size="sm" className="mt-3 w-full" isLoading={rulesQuery.isLoadingMore} onPress={() => void rulesQuery.loadMore()}>
                  Ver mais regras
                </Button>
              ) : null}
            </section>
          ) : (
            <section className="rounded-3xl border border-gray-100 bg-white p-4">
              <h2 className="flex items-center gap-2 font-semibold text-gray-950">
                <ShieldCheck aria-hidden size={18} /> Regras
              </h2>
              <p className="mt-2 text-sm text-gray-500">Nenhuma regra adicional foi cadastrada.</p>
            </section>
          )}

          {membershipsQuery.status === "loading" ? (
            <div className="h-32 animate-pulse rounded-3xl bg-gray-100" aria-label="Carregando membros" />
          ) : membershipsQuery.status === "error" ? (
            <section className="rounded-3xl border border-red-200 bg-red-50 p-4" role="alert">
              <p className="text-sm text-red-800">{membershipsQuery.error}</p>
              <Button color="secondary-destructive" size="sm" className="mt-2" onPress={() => void membershipsQuery.reload()}>
                Tentar carregar membros
              </Button>
            </section>
          ) : (
            <section className="rounded-3xl border border-gray-100 bg-white p-4">
              <h2 className="flex items-center gap-2 font-semibold text-gray-950">
                <UsersRound aria-hidden size={18} /> Membros
              </h2>
              {activeMembers.length ? (
                <div className="mt-2 divide-y divide-gray-100">
                  {activeMembers.map((membership) => (
                    <MemberRow
                      membership={membership}
                      onOpenProfile={onOpenProfile}
                      canChangeRole={
                        access === "owner"
                        && membership.role !== "owner"
                        && membership.profileId !== currentUserId
                      }
                      pending={managementActions.isPending}
                      onChangeRole={() => void runAction(
                        () => managementActions.setMemberRole(
                          membership.profileId,
                          membership.role === "moderator" ? "member" : "moderator",
                        ),
                        membership.role === "moderator"
                          ? "Função alterada para membro."
                          : "Membro promovido à moderação.",
                      )}
                      canBan={
                        membership.profileId !== currentUserId
                        && membership.role !== "owner"
                        && (access === "owner" || (access === "moderator" && membership.role === "member"))
                      }
                      onBan={() => {
                        setBanTarget(membership);
                        setBanReason("");
                      }}
                      key={`${membership.communityId}:${membership.profileId}`}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-gray-500">Nenhum membro visível nesta página.</p>
              )}
              {membershipsQuery.hasMore ? (
                <Button color="secondary" size="sm" className="mt-3 w-full" isLoading={membershipsQuery.isLoadingMore} onPress={() => void membershipsQuery.loadMore()}>
                  Carregar mais membros
                </Button>
              ) : null}
            </section>
          )}

          {banTarget ? (
            <section className="rounded-3xl border border-red-200 bg-red-50 p-4" role="alertdialog" aria-label="Confirmar remoção do membro">
              <h2 className="font-semibold text-red-950">
                Remover {banTarget.profile?.fullName ?? "este membro"}?
              </h2>
              <p className="mt-1 text-sm leading-5 text-red-800">
                A pessoa perderá o acesso e só poderá retornar após liberação da moderação.
              </p>
              <TextArea
                label="Motivo da ação"
                value={banReason}
                onChange={setBanReason}
                rows={3}
                maxLength={1_000}
                isRequired
                isDisabled={managementActions.isPending}
                className="mt-3"
              />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  color="secondary"
                  size="md"
                  isDisabled={managementActions.isPending}
                  onPress={() => {
                    setBanTarget(null);
                    setBanReason("");
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  color="primary-destructive"
                  size="md"
                  isLoading={managementActions.isPending}
                  isDisabled={banReason.trim().length < 3}
                  onPress={() => void runAction(
                    () => managementActions.banMember(banTarget.profileId, banReason),
                    "Membro removido da comunidade.",
                  ).then((succeeded) => {
                    if (succeeded) {
                      setBanTarget(null);
                      setBanReason("");
                    }
                  })}
                >
                  Remover membro
                </Button>
              </div>
            </section>
          ) : null}

          {pendingMembers.length ? (
            <section className="rounded-3xl border border-amber-100 bg-amber-50 p-4">
              <h2 className="font-semibold text-gray-950">Solicitações de entrada</h2>
              <div className="mt-3 space-y-3">
                {pendingMembers.map((membership) => (
                  <div className="rounded-2xl bg-white p-3" key={`${membership.communityId}:${membership.profileId}`}>
                    <strong className="block text-sm text-gray-950">
                      {membership.profile?.fullName ?? "Perfil indisponível"}
                    </strong>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Button
                        color="primary"
                        size="sm"
                        isDisabled={communityActions.isPending}
                        onPress={() => void runAction(
                          () => communityActions.respond(community.id, membership.profileId, true),
                          "Solicitação aceita.",
                        )}
                      >
                        Aceitar
                      </Button>
                      <Button
                        color="secondary"
                        size="sm"
                        isDisabled={communityActions.isPending}
                        onPress={() => void runAction(
                          () => communityActions.respond(community.id, membership.profileId, false),
                          "Solicitação recusada.",
                        )}
                      >
                        Recusar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {bannedMembers.length ? (
            <section className="rounded-3xl border border-gray-200 bg-white p-4">
              <h2 className="flex items-center gap-2 font-semibold text-gray-950">
                <UserRoundX aria-hidden size={18} /> Participações bloqueadas
              </h2>
              <div className="mt-3 grid gap-2">
                {bannedMembers.map((membership) => (
                  <div className="flex min-h-14 items-center gap-3 rounded-2xl bg-gray-50 p-2" key={`${membership.communityId}:${membership.profileId}`}>
                    <Avatar
                      size="sm"
                      initials={initials(membership.profile?.fullName ?? "Perfil")}
                      contentClassName="bg-gray-200 text-gray-700"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">
                      {membership.profile?.fullName ?? "Perfil indisponível"}
                    </span>
                    <Button
                      color="secondary"
                      size="sm"
                      isLoading={managementActions.isPending}
                      onPress={() => void runAction(
                        () => managementActions.unbanMember(membership.profileId),
                        "Participação liberada.",
                      )}
                    >
                      Liberar
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {canPublish ? (
            <section className="rounded-3xl border border-violet-100 bg-white p-4">
              <h2 className="flex items-center gap-2 font-semibold text-gray-950">
                <MessageCircleMore aria-hidden size={18} /> Criar publicação
              </h2>
              <TextArea
                aria-label="Texto da publicação"
                placeholder="Compartilhe algo com a comunidade"
                value={postBody}
                onChange={setPostBody}
                rows={4}
                maxLength={10_000}
                className="mt-3"
                hint={`${postBody.length}/10.000`}
              />
              <div className="mt-3 grid gap-2">
                <FileTrigger
                  acceptedFileTypes={["image/jpeg", "image/png", "image/webp", "image/avif", "video/mp4"]}
                  allowsMultiple
                  onSelect={selectPostMedia}
                >
                  <button
                    type="button"
                    disabled={postFiles.length >= MAX_COMMUNITY_MEDIA_ITEMS || managementActions.isPending}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 outline-none focus-visible:ring-2 focus-visible:ring-violet-600 disabled:opacity-50"
                  >
                    <ImagePlus aria-hidden size={17} />
                    Adicionar imagem ou vídeo ({postFiles.length}/{MAX_COMMUNITY_MEDIA_ITEMS})
                  </button>
                </FileTrigger>
                {postFiles.length ? (
                  <ul className="grid gap-1" aria-label="Mídias selecionadas">
                    {postFiles.map((file, index) => (
                      <li className="flex min-h-11 items-center gap-2 rounded-xl bg-gray-50 px-3 text-xs text-gray-700" key={`${file.name}:${file.lastModified}:${index}`}>
                        <span className="min-w-0 flex-1 truncate">{file.name}</span>
                        <button
                          type="button"
                          aria-label={`Remover ${file.name}`}
                          onClick={() => setPostFiles((current) => current.filter((_item, position) => position !== index))}
                          className="grid size-11 shrink-0 place-items-center rounded-full text-red-600 outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                        >
                          <Trash2 aria-hidden size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <Button
                color="primary"
                size="md"
                className="mt-3 w-full"
                isLoading={postActions.isPending || managementActions.isPending}
                isDisabled={!postBody.trim()}
                onPress={() => void createPost()}
              >
                Publicar
              </Button>
            </section>
          ) : access === "pending" ? (
            <aside className="flex gap-3 rounded-3xl bg-white p-4 text-sm leading-5 text-gray-600">
              <UserRoundCheck aria-hidden className="mt-0.5 shrink-0" size={18} />
              Sua solicitação precisa ser aceita antes de publicar.
            </aside>
          ) : null}

          <section aria-labelledby="community-posts-title">
            <h2 id="community-posts-title" className="mb-3 flex items-center gap-2 font-semibold text-gray-950">
              <Heart aria-hidden size={18} /> Publicações
            </h2>
            {postMediaQuery.isError ? (
              <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 p-3" role="alert">
                <p className="text-sm text-amber-900">As publicações carregaram, mas algumas mídias estão indisponíveis.</p>
                <Button color="secondary" size="sm" className="mt-2" onPress={() => void postMediaQuery.refetch()}>
                  Tentar carregar mídias
                </Button>
              </div>
            ) : null}
            {postsQuery.status === "loading" ? (
              <div className="h-48 animate-pulse rounded-3xl bg-gray-100" aria-label="Carregando publicações" />
            ) : postsQuery.status === "error" ? (
              <div className="rounded-3xl border border-red-200 bg-red-50 p-4" role="alert">
                <p className="text-sm text-red-800">{postsQuery.error}</p>
                <Button color="secondary-destructive" size="sm" className="mt-3" onPress={() => void postsQuery.reload()}>
                  Tentar novamente
                </Button>
              </div>
            ) : postsQuery.items.length ? (
              <div className="space-y-3">
                {postsQuery.items.map((post) => (
                  <PostCard
                    post={post}
                    media={postMediaByPost.get(post.id) ?? []}
                    currentUserId={currentUserId}
                    pending={postActions.isPending || managementActions.isPending}
                    canDelete={post.authorId === currentUserId || canManage}
                    confirmDelete={deletePostId === post.id}
                    onOpen={() => {
                      if (onOpenPost) onOpenPost(post);
                      else setSelectedPost(post);
                    }}
                    onOpenProfile={onOpenProfile}
                    onReact={(kind) => void runAction(
                      () => postActions.setReaction({ targetType: "post", targetId: post.id, kind }),
                      kind ? "Reação registrada." : "Reação removida.",
                    )}
                    onReport={() => onNavigate(buildCommunityPostReportPath(post.id))}
                    onAskDelete={() => setDeletePostId(post.id)}
                    onCancelDelete={() => setDeletePostId(null)}
                    onDelete={() => void runAction(
                      () => managementActions.removePost(post.id),
                      "Publicação excluída.",
                    ).then((succeeded) => {
                      if (succeeded) setDeletePostId(null);
                    })}
                    onRemoveMedia={(media) => void runAction(
                      () => managementActions.removePostMedia(media),
                      "Mídia removida.",
                    )}
                    key={post.id}
                  />
                ))}
                {postsQuery.hasMore ? (
                  <Button color="secondary" size="md" className="w-full" isLoading={postsQuery.isLoadingMore} onPress={() => void postsQuery.loadMore()}>
                    Carregar mais publicações
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="rounded-3xl border border-gray-100 bg-white px-6 py-10 text-center">
                <MessageCircleMore aria-hidden className="mx-auto text-gray-400" size={28} />
                <h3 className="mt-3 font-semibold text-gray-950">Nenhuma publicação ainda</h3>
                <p className="mt-1 text-sm text-gray-500">A comunidade começa com a primeira conversa real.</p>
              </div>
            )}
          </section>
        </div>
      </main>
      <CommunityManagerDrawer
        open={managerOpen}
        community={community}
        rules={rulesQuery.items}
        avatarUrl={communityAssets.data?.avatarUrl ?? null}
        coverUrl={communityAssets.data?.coverUrl ?? null}
        hasMoreRules={rulesQuery.hasMore}
        loadingMoreRules={rulesQuery.isLoadingMore}
        rulesAvailable={rulesQuery.status === "ready"}
        onLoadMoreRules={() => void rulesQuery.loadMore()}
        onOpenChange={setManagerOpen}
        onArchived={onBack}
      />
      <CommunityPostThreadDrawer
        communityId={community.id}
        post={threadPost}
        currentUserId={currentUserId}
        canManage={canManage}
        onClose={() => {
          if (initialPostId) onCloseInitialPost?.();
          else setSelectedPost(null);
        }}
        onNavigate={onNavigate}
        onOpenProfile={onOpenProfile}
      />
    </div>
  );
}
