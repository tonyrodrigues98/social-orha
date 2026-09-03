import { ChevronRight, MessageCircleMore, Plus, UsersRound } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useCommunities, usePosts } from "@/domains/social";
import { NativeHeader } from "../components/native-header";
import { buildCommunityPath } from "../router-policy";
import { useAppUi } from "../ui-state-context";

export function CommunityPage() {
  const { openDrawer } = useAppUi();
  const routeNavigate = useNavigate();
  const communitiesQuery = useCommunities();
  const postsQuery = usePosts();
  return (
    <div className="page">
      <NativeHeader title="Comunidade" subtitle="Encontre gente que entende você" />
      <main className="page-content">
        <section className="community-hero">
          <span className="floating-symbol"><UsersRound size={26} /></span>
          <span className="section-overline light">ONDE A CONVERSA ACONTECE</span>
          <h2>Assuntos em comum.<br />Pessoas de verdade.</h2>
          <p>Entre para conversar, participar e criar vínculos.</p>
          <button type="button" className="light-action" onClick={() => openDrawer({ type: "create-community" })}><Plus size={17} /> Criar comunidade</button>
        </section>

        <section className="content-section">
          <div className="section-heading">
            <div><span className="section-overline">EM ALTA</span><h2>Conversas acontecendo agora</h2></div>
            <button type="button" className="text-button" onClick={() => openDrawer({ type: "create-post" })}>Publicar</button>
          </div>
          {postsQuery.status === "loading" ? (
            <p className="prototype-empty" role="status">Carregando conversas…</p>
          ) : postsQuery.status === "error" ? (
            <p className="prototype-empty" role="alert">Não foi possível carregar as conversas agora.</p>
          ) : postsQuery.items.length ? (
            <>
              <div className="topic-grid">
                {postsQuery.items.map((post, index) => (
                  <button
                    type="button"
                    className={`topic-card ${index % 2 === 0 ? "violet" : "green"}`}
                    key={post.id}
                    onClick={() => openDrawer({
                      type: "topic",
                      topic: post.body,
                      postId: post.id,
                      communityId: post.communityId ?? undefined,
                      reactionCount: post.reactionCount,
                      viewerReaction: post.viewerReaction,
                    })}
                  >
                    <MessageCircleMore size={21} />
                    <strong>{post.body}</strong>
                    <small>
                      {post.commentCount} {post.commentCount === 1 ? "comentário" : "comentários"}
                      {" · "}
                      {post.reactionCount} {post.reactionCount === 1 ? "reação" : "reações"}
                    </small>
                  </button>
                ))}
              </div>
              {postsQuery.hasMore ? (
                <button
                  type="button"
                  className="text-button"
                  disabled={postsQuery.isLoadingMore}
                  onClick={() => void postsQuery.loadMore()}
                >
                  {postsQuery.isLoadingMore ? "Carregando…" : "Carregar mais conversas"}
                </button>
              ) : null}
            </>
          ) : <p className="prototype-empty">Nenhuma conversa publicada ainda.</p>}
        </section>

        <section className="content-section">
          <div className="section-heading">
            <div><span className="section-overline">PARA VOCÊ</span><h2>Comunidades sugeridas</h2></div>
          </div>
          <div className="community-list elevated-list">
            {communitiesQuery.status === "loading" ? (
              <p className="prototype-empty" role="status">Carregando comunidades…</p>
            ) : communitiesQuery.status === "error" ? (
              <p className="prototype-empty" role="alert">Não foi possível carregar comunidades agora.</p>
            ) : communitiesQuery.items.length ? (
              <>
                {communitiesQuery.items.map((community) => (
                  <button type="button" className="community-row" key={community.id} onClick={() => void routeNavigate({ to: buildCommunityPath(community.id) })}>
                    <span className="community-monogram">
                      {community.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="community-copy"><strong>{community.name}</strong><small>{community.description || `${community.memberCount} ${community.memberCount === 1 ? "membro" : "membros"}`}</small></span>
                    <ChevronRight size={18} aria-hidden />
                  </button>
                ))}
                {communitiesQuery.hasMore ? (
                  <button
                    type="button"
                    className="text-button"
                    disabled={communitiesQuery.isLoadingMore}
                    onClick={() => void communitiesQuery.loadMore()}
                  >
                    {communitiesQuery.isLoadingMore ? "Carregando…" : "Carregar mais comunidades"}
                  </button>
                ) : null}
              </>
            ) : <p className="prototype-empty">Nenhuma comunidade disponível agora.</p>}
          </div>
        </section>
      </main>
    </div>
  );
}
