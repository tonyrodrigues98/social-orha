import { useEffect, useState, type ReactNode } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChevronRight,
  Image,
  MessageCircleMore,
  Search,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Tab, TabList, TabPanel, TabPanels, Tabs } from "react-aria-components";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import {
  useExploreInterests,
  useExplorePublicPosts,
} from "@/domains/explore";
import {
  useCommunities,
  useProfiles,
  type Community,
  type SocialPageQuery,
  type SocialProfile,
} from "@/domains/social";
import { useAuth } from "../auth/auth-context";
import { buildCommunityPath, ROUTE_PATHS } from "../router-policy";
import { useAppUi } from "../ui-state-context";
import { profileInitials } from "./explore-presentation";

type ExploreTab = "people" | "communities" | "interests" | "posts";

const tabs: Array<{ id: ExploreTab; label: string }> = [
  { id: "people", label: "Pessoas" },
  { id: "communities", label: "Comunidades" },
  { id: "interests", label: "Interesses" },
  { id: "posts", label: "Publicações" },
];

function useDebouncedValue(value: string, delay = 300): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

function ResultState({
  query,
  empty,
  children,
}: {
  query: {
    status: "idle" | "loading" | "ready" | "error";
    error: string | null;
    items: unknown[];
    reload: () => Promise<void>;
  };
  empty: string;
  children: ReactNode;
}) {
  if (query.status === "idle" || query.status === "loading") {
    return (
      <div className="grid min-h-36 place-items-center rounded-3xl border border-gray-100 bg-white p-6 text-center text-sm text-gray-500" role="status">
        Buscando no ORHA…
      </div>
    );
  }
  if (query.status === "error") {
    return (
      <div className="grid min-h-36 place-items-center gap-3 rounded-3xl border border-red-100 bg-red-50 p-6 text-center" role="alert">
        <p className="m-0 text-sm text-red-800">{query.error ?? "Não foi possível carregar os resultados."}</p>
        <Button color="secondary" size="sm" onPress={() => void query.reload()}>
          Tentar novamente
        </Button>
      </div>
    );
  }
  if (!query.items.length) {
    return (
      <div className="grid min-h-36 place-items-center rounded-3xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
        <p className="m-0 max-w-64 text-sm leading-5 text-gray-600">{empty}</p>
      </div>
    );
  }
  return children;
}

function LoadMore({
  query,
  label,
}: {
  query: {
    hasMore: boolean;
    isLoadingMore: boolean;
    loadMore: () => Promise<void>;
  };
  label: string;
}) {
  if (!query.hasMore) return null;
  return (
    <Button
      color="secondary"
      size="md"
      className="mt-3 w-full"
      isLoading={query.isLoadingMore}
      showTextWhileLoading
      onPress={() => void query.loadMore()}
    >
      {query.isLoadingMore ? "Carregando…" : label}
    </Button>
  );
}

function PeopleResults({ query }: { query: SocialPageQuery<SocialProfile> }) {
  const navigate = useNavigate();
  return (
    <ResultState
      query={query}
      empty="Nenhuma pessoa visível corresponde a esta busca. Perfis privados e bloqueados nunca aparecem aqui."
    >
      <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        {query.items.map((profile) => (
          <button
            type="button"
            key={profile.id}
            className="flex min-h-16 w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left outline-none last:border-b-0 active:bg-gray-50 focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-inset"
            onClick={() => void navigate({
              to: ROUTE_PATHS.publicProfile,
              params: { username: profile.username },
            })}
          >
            <Avatar
              size="lg"
              initials={profileInitials(profile.fullName)}
              contentClassName="bg-violet-100 text-violet-800"
            />
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-[15px] font-semibold text-gray-950">{profile.fullName}</strong>
              <span className="block truncate text-xs text-gray-500">
                @{profile.username}
                {profile.interests[0] ? ` · ${profile.interests[0]}` : ""}
              </span>
            </span>
            <ChevronRight aria-hidden size={18} className="shrink-0 text-gray-400" />
          </button>
        ))}
      </div>
      <LoadMore query={query} label="Carregar mais pessoas" />
    </ResultState>
  );
}

function CommunityResults({ query }: { query: SocialPageQuery<Community> }) {
  const navigate = useNavigate();
  return (
    <ResultState query={query} empty="Nenhuma comunidade pública ou acessível corresponde a esta busca.">
      <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        {query.items.map((community) => (
          <button
            type="button"
            key={community.id}
            className="flex min-h-16 w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left outline-none last:border-b-0 active:bg-gray-50 focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-inset"
            onClick={() => void navigate({ to: buildCommunityPath(community.id) })}
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-xs font-bold text-emerald-800">
              {community.name.slice(0, 2).toLocaleUpperCase("pt-BR")}
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-[15px] font-semibold text-gray-950">{community.name}</strong>
              <span className="block truncate text-xs text-gray-500">
                {community.category} · {community.memberCount} {community.memberCount === 1 ? "membro" : "membros"}
              </span>
            </span>
            <ChevronRight aria-hidden size={18} className="shrink-0 text-gray-400" />
          </button>
        ))}
      </div>
      <LoadMore query={query} label="Carregar mais comunidades" />
    </ResultState>
  );
}

function InterestResults({
  query,
  onChoose,
}: {
  query: ReturnType<typeof useExploreInterests>;
  onChoose: (interest: string) => void;
}) {
  return (
    <ResultState
      query={query}
      empty="Ainda não há interesses compartilhados por pessoas suficientes para aparecer com privacidade nesta busca."
    >
      <div className="grid grid-cols-2 gap-2">
        {query.items.map((interest) => (
          <button
            type="button"
            key={interest.key}
            className="flex min-h-24 flex-col items-start justify-between rounded-3xl border border-violet-100 bg-violet-50 p-4 text-left outline-none active:bg-violet-100 focus-visible:ring-2 focus-visible:ring-violet-600"
            onClick={() => onChoose(interest.label)}
          >
            <Sparkles aria-hidden size={20} className="text-violet-600" />
            <span className="min-w-0 max-w-full">
              <strong className="block truncate text-sm font-semibold text-violet-950">{interest.label}</strong>
              <small className="block text-xs text-violet-700">
                {interest.profileCount} pessoas
              </small>
            </span>
          </button>
        ))}
      </div>
      <LoadMore query={query} label="Carregar mais interesses" />
    </ResultState>
  );
}

function PostResults({ query }: { query: ReturnType<typeof useExplorePublicPosts> }) {
  const { openDrawer } = useAppUi();
  const navigate = useNavigate();
  return (
    <ResultState query={query} empty="Nenhuma publicação pública corresponde a esta busca.">
      <div className="grid gap-3">
        {query.items.map((post) => (
          <article key={post.id} className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
            <button
              type="button"
              className="flex min-h-14 w-full items-center gap-3 px-4 pt-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-inset"
              onClick={() => void navigate({
                to: ROUTE_PATHS.publicProfile,
                params: { username: post.authorUsername },
              })}
            >
              <Avatar
                size="md"
                initials={profileInitials(post.authorName)}
                contentClassName="bg-gray-100 text-gray-700"
              />
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm font-semibold text-gray-950">{post.authorName}</strong>
                <span className="block truncate text-xs text-gray-500">
                  @{post.authorUsername}
                  {post.communityName ? ` em ${post.communityName}` : ""}
                </span>
              </span>
              <time className="shrink-0 text-[11px] text-gray-400" dateTime={post.createdAt}>
                {formatDistanceToNowStrict(new Date(post.createdAt), { addSuffix: true, locale: ptBR })}
              </time>
            </button>
            <button
              type="button"
              className="w-full px-4 pb-4 pt-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-inset"
              onClick={() => openDrawer({
                type: "topic",
                topic: post.body,
                postId: post.id,
                communityId: post.communityId ?? undefined,
                reactionCount: post.reactionCount,
                viewerReaction: post.viewerReaction,
              })}
            >
              <p className="m-0 line-clamp-4 whitespace-pre-wrap text-[15px] leading-6 text-gray-900">{post.body}</p>
              <span className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                {post.mediaCount ? <span className="inline-flex items-center gap-1"><Image aria-hidden size={14} /> {post.mediaCount}</span> : null}
                <span className="inline-flex items-center gap-1"><MessageCircleMore aria-hidden size={14} /> {post.commentCount}</span>
                <span className="inline-flex items-center gap-1"><Sparkles aria-hidden size={14} /> {post.reactionCount}</span>
              </span>
            </button>
          </article>
        ))}
      </div>
      <LoadMore query={query} label="Carregar mais publicações" />
    </ResultState>
  );
}

export function ExploreDiscovery() {
  const { identity } = useAuth();
  const { announce } = useAppUi();
  const [tab, setTab] = useState<ExploreTab>("people");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim());
  const profiles = useProfiles(debouncedSearch);
  const communities = useCommunities(debouncedSearch);
  const interests = useExploreInterests(debouncedSearch);
  const posts = useExplorePublicPosts(debouncedSearch);
  const visibleProfiles: SocialPageQuery<SocialProfile> = {
    ...profiles,
    items: profiles.items.filter((profile) => profile.id !== identity?.profile.id),
  };

  const chooseInterest = (interest: string) => {
    setSearch(interest);
    setTab("people");
    announce(`Mostrando pessoas que gostam de ${interest}.`);
  };

  return (
    <section className="content-section" aria-labelledby="explore-discovery-heading">
      <div className="section-heading">
        <div>
          <span className="section-overline">DESCOBERTA REAL</span>
          <h2 id="explore-discovery-heading">Encontre seu próximo vínculo</h2>
        </div>
      </div>
      <Input
        type="search"
        size="lg"
        icon={Search}
        value={search}
        maxLength={80}
        placeholder="Pessoas, comunidades, gostos ou publicações"
        aria-label="Pesquisar no Explorar"
        inputClassName="text-[16px]"
        wrapperClassName="rounded-2xl ring-gray-200"
        onChange={setSearch}
      />
      <p className="mb-3 mt-2 text-xs leading-5 text-gray-500" aria-live="polite">
        {debouncedSearch ? `Resultados autorizados para “${debouncedSearch}”.` : "Resultados públicos e permitidos para sua conta."}
      </p>
      <Tabs selectedKey={tab} onSelectionChange={(key) => setTab(key as ExploreTab)}>
        <TabList
          aria-label="Tipos de descoberta"
          className="mb-3 flex gap-1 overflow-x-auto rounded-2xl bg-gray-100 p-1 [scrollbar-width:none]"
        >
          {tabs.map((item) => (
            <Tab
              key={item.id}
              id={item.id}
              className={({ isSelected }) => `min-h-11 shrink-0 cursor-pointer rounded-xl px-3 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-violet-600 ${
                isSelected ? "bg-white text-gray-950 shadow-sm" : "text-gray-600"
              }`}
            >
              {item.label}
            </Tab>
          ))}
        </TabList>
        <TabPanels>
          <TabPanel id="people" className="outline-none">
            <PeopleResults query={visibleProfiles} />
          </TabPanel>
          <TabPanel id="communities" className="outline-none">
            <CommunityResults query={communities} />
          </TabPanel>
          <TabPanel id="interests" className="outline-none">
            <InterestResults query={interests} onChoose={chooseInterest} />
          </TabPanel>
          <TabPanel id="posts" className="outline-none">
            <PostResults query={posts} />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </section>
  );
}
