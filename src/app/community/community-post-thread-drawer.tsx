import { useMemo, useState } from "react";
import { Flag, MessageCircleReply, Trash2, X } from "lucide-react";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import { TextArea } from "@/components/base/textarea/textarea";
import { Drawer } from "@/components/godui/drawer";
import { buildPostCommentReportPath } from "@/domain/community-management";
import {
  useComments,
  usePostActions,
  type CommunityPost,
  type PostComment,
  type ReactionKind,
} from "@/domains/social";
import { useCommunityManagementActions } from "./community-management-hooks";

const commentReactionOptions: Array<{ kind: ReactionKind; label: string }> = [
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

function CommentCard({
  comment,
  depth,
  currentUserId,
  canManage,
  pending,
  confirmDelete,
  onReply,
  onReact,
  onReport,
  onAskDelete,
  onCancelDelete,
  onDelete,
  onOpenProfile,
}: {
  comment: PostComment;
  depth: number;
  currentUserId: string | null;
  canManage: boolean;
  pending: boolean;
  confirmDelete: boolean;
  onReply: () => void;
  onReact: (kind: ReactionKind | null) => void;
  onReport: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  onOpenProfile?: (username: string) => void;
}) {
  const authorName = comment.author?.fullName ?? "Perfil indisponível";
  const canDelete = comment.authorId === currentUserId || canManage;
  return (
    <article
      className={`rounded-2xl border border-gray-100 bg-white p-3 ${depth ? "ml-7" : ""}`}
      data-testid={`community-comment-${comment.id}`}
    >
      <header className="flex items-center gap-2">
        <button
          type="button"
          disabled={!comment.author || !onOpenProfile}
          onClick={() => {
            if (comment.author && onOpenProfile) onOpenProfile(comment.author.username);
          }}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-violet-600 disabled:cursor-default"
        >
          <Avatar
            size="sm"
            initials={initials(authorName)}
            contentClassName="bg-gray-100 text-gray-700"
          />
          <span className="min-w-0 flex-1">
            <strong className="block truncate text-sm text-gray-950">{authorName}</strong>
            <time className="block text-xs text-gray-500" dateTime={comment.createdAt}>
              {new Date(comment.createdAt).toLocaleString("pt-BR")}
            </time>
          </span>
        </button>
        <button
          type="button"
          aria-label="Denunciar comentário"
          onClick={onReport}
          className="grid size-11 place-items-center rounded-full text-gray-500 outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
        >
          <Flag aria-hidden size={16} />
        </button>
        {canDelete ? (
          <button
            type="button"
            aria-label="Excluir comentário"
            onClick={onAskDelete}
            className="grid size-11 place-items-center rounded-full text-red-600 outline-none focus-visible:ring-2 focus-visible:ring-red-600"
          >
            <Trash2 aria-hidden size={16} />
          </button>
        ) : null}
      </header>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-5 text-gray-800">
        {comment.body}
      </p>
      <div
        className="mt-2 flex snap-x gap-1.5 overflow-x-auto pb-1"
        role="group"
        aria-label="Reagir ao comentário"
      >
        {commentReactionOptions.map(({ kind, label }) => {
          const selected = comment.viewerReaction === kind;
          return (
            <button
              type="button"
              aria-pressed={selected}
              disabled={pending}
              onClick={() => onReact(selected ? null : kind)}
              className={`min-h-11 shrink-0 rounded-full border px-2.5 text-[11px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-violet-600 ${
                selected
                  ? "border-violet-600 bg-violet-50 text-violet-800"
                  : "border-gray-200 text-gray-600"
              }`}
              data-testid={`community-comment-reaction-${kind}-${comment.id}`}
              key={kind}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex min-h-11 items-center justify-between gap-2 text-xs text-gray-500">
        <span>{comment.reactionCount} {comment.reactionCount === 1 ? "reação" : "reações"}</span>
        <button
          type="button"
          onClick={onReply}
          className="flex min-h-11 items-center gap-1 rounded-full px-3 font-semibold text-violet-700 outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
        >
          <MessageCircleReply aria-hidden size={15} /> Responder
        </button>
      </div>
      {confirmDelete ? (
        <div className="mt-2 rounded-2xl bg-red-50 p-3" role="alertdialog" aria-label="Confirmar exclusão do comentário">
          <p className="text-sm font-medium text-red-900">Excluir este comentário?</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button color="secondary" size="sm" isDisabled={pending} onPress={onCancelDelete}>
              Cancelar
            </Button>
            <Button color="primary-destructive" size="sm" isLoading={pending} onPress={onDelete}>
              Excluir
            </Button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function CommunityPostThreadDrawer({
  communityId,
  post,
  currentUserId,
  canManage,
  onClose,
  onNavigate,
  onOpenProfile,
}: {
  communityId: string;
  post: CommunityPost | null;
  currentUserId: string | null;
  canManage: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
  onOpenProfile?: (username: string) => void;
}) {
  const commentsQuery = useComments(post?.id ?? null);
  const postActions = usePostActions();
  const management = useCommunityManagementActions(communityId);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<PostComment | null>(null);
  const [deleteCommentId, setDeleteCommentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const comments = commentsQuery.items;
  const orderedComments = useMemo(() => {
    const roots = comments.filter((comment) => !comment.parentCommentId);
    const children = new Map<string, PostComment[]>();
    for (const comment of comments) {
      if (!comment.parentCommentId) continue;
      const current = children.get(comment.parentCommentId) ?? [];
      current.push(comment);
      children.set(comment.parentCommentId, current);
    }
    const flattened: Array<{ comment: PostComment; depth: number }> = [];
    const append = (comment: PostComment, depth: number) => {
      flattened.push({ comment, depth: Math.min(depth, 2) });
      for (const child of children.get(comment.id) ?? []) append(child, depth + 1);
    };
    for (const root of roots) append(root, 0);
    return flattened;
  }, [comments]);
  const pending = postActions.isPending || management.isPending;

  const run = async (operation: () => Promise<unknown>, success: string) => {
    setError(null);
    setStatus(null);
    try {
      await operation();
      setStatus(success);
      return true;
    } catch (cause) {
      setError(cause instanceof Error && cause.message.trim()
        ? cause.message
        : "Não foi possível concluir esta ação.");
      return false;
    }
  };

  const submit = async () => {
    if (!post) return;
    const commentBody = body.trim();
    if (!commentBody) {
      setError("Escreva um comentário antes de publicar.");
      return;
    }
    const succeeded = await run(
      () => postActions.createComment({
        postId: post.id,
        parentCommentId: replyTo?.id ?? null,
        body: commentBody,
      }),
      replyTo ? "Resposta publicada." : "Comentário publicado.",
    );
    if (succeeded) {
      setBody("");
      setReplyTo(null);
    }
  };

  return (
    <Drawer
      open={Boolean(post)}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      title="Conversa da publicação"
      className="max-h-[94dvh] rounded-t-[28px]"
    >
      {post ? (
        <div className="grid gap-3 pb-[max(8px,env(safe-area-inset-bottom))]">
          <div className="rounded-2xl bg-gray-50 p-3">
            <strong className="text-sm text-gray-950">{post.author?.fullName ?? "Perfil indisponível"}</strong>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-gray-700">{post.body}</p>
          </div>

          {commentsQuery.status === "loading" ? (
            <div className="h-24 animate-pulse rounded-2xl bg-gray-100" aria-label="Carregando comentários" />
          ) : commentsQuery.status === "error" ? (
            <div className="rounded-2xl bg-red-50 p-3" role="alert">
              <p className="text-sm text-red-800">{commentsQuery.error}</p>
              <Button color="secondary-destructive" size="sm" className="mt-2" onPress={() => void commentsQuery.reload()}>
                Tentar novamente
              </Button>
            </div>
          ) : orderedComments.length ? (
            <div className="grid gap-2">
              {orderedComments.map(({ comment, depth }) => (
                <CommentCard
                  comment={comment}
                  depth={depth}
                  currentUserId={currentUserId}
                  canManage={canManage}
                  pending={pending}
                  confirmDelete={deleteCommentId === comment.id}
                  onReply={() => {
                    setReplyTo(comment);
                    setBody("");
                  }}
                  onReact={(kind) => void run(
                    () => postActions.setReaction({
                      targetType: "comment",
                      targetId: comment.id,
                      kind,
                    }),
                    kind ? "Reação registrada." : "Reação removida.",
                  )}
                  onReport={() => onNavigate(buildPostCommentReportPath(comment.id))}
                  onAskDelete={() => setDeleteCommentId(comment.id)}
                  onCancelDelete={() => setDeleteCommentId(null)}
                  onDelete={() => void run(
                    () => management.removeComment(comment.id),
                    "Comentário excluído.",
                  ).then((succeeded) => {
                    if (succeeded) setDeleteCommentId(null);
                  })}
                  onOpenProfile={onOpenProfile}
                  key={comment.id}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl bg-gray-50 px-4 py-7 text-center text-sm text-gray-500">
              Nenhum comentário ainda. Comece a conversa com respeito.
            </p>
          )}
          {commentsQuery.hasMore ? (
            <Button
              color="secondary"
              size="sm"
              isLoading={commentsQuery.isLoadingMore}
              onPress={() => void commentsQuery.loadMore()}
            >
              Carregar mais comentários
            </Button>
          ) : null}

          <form
            className="sticky bottom-0 rounded-2xl border border-gray-100 bg-white p-3 shadow-lg"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {replyTo ? (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-900">
                <span className="truncate">Respondendo a {replyTo.author?.fullName ?? "um comentário"}</span>
                <button
                  type="button"
                  aria-label="Cancelar resposta"
                  onClick={() => setReplyTo(null)}
                  className="grid size-11 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
                >
                  <X aria-hidden size={16} />
                </button>
              </div>
            ) : null}
            <TextArea
              aria-label={replyTo ? "Texto da resposta" : "Texto do comentário"}
              placeholder={replyTo ? "Escreva sua resposta" : "Participe da conversa"}
              value={body}
              onChange={setBody}
              rows={3}
              maxLength={3_000}
              isDisabled={pending}
            />
            <Button
              type="submit"
              color="primary"
              size="md"
              className="mt-2 w-full"
              isLoading={pending}
              isDisabled={!body.trim()}
            >
              {replyTo ? "Responder" : "Comentar"}
            </Button>
          </form>
          {status ? <p className="text-sm text-emerald-700" role="status">{status}</p> : null}
          {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
        </div>
      ) : null}
    </Drawer>
  );
}
