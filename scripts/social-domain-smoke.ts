import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseSocialRepository } from "../src/infrastructure/supabase/social/social-repository";
import type { SocialRepository } from "../src/domains/social/repository";
import { validateSocialSmokeTarget } from "./social-domain-smoke-target";

export { validateSocialSmokeTarget } from "./social-domain-smoke-target";

type SmokeEnvironment = {
  supabaseUrl: string;
  publishableKey: string;
  serviceRoleKey: string;
  workspace: string;
};

type TemporaryPrincipal = {
  id: string;
  username: string;
  client: SupabaseClient;
  social: SocialRepository;
};

export type SocialDomainSmokeResult = {
  checks: readonly string[];
  cleanupVerified: boolean;
};

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment: ${name}.`);
  return value;
}

function client(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function rpcRow(value: unknown): Record<string, unknown> {
  return record(Array.isArray(value) ? value[0] : value);
}

function requiredId(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) {
    throw new Error(`${label} did not return a UUID.`);
  }
  return value;
}

async function createPrincipal(
  admin: SupabaseClient,
  supabaseUrl: string,
  publishableKey: string,
  label: "a" | "b",
): Promise<TemporaryPrincipal> {
  const unique = randomUUID();
  const email = `orha-social-smoke-${label}-${unique}@example.invalid`;
  const password = `Orha-Social-${unique}!`;
  const username = `social_${label}_${unique.replaceAll("-", "").slice(0, 17)}`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { test_scope: "social-domain-smoke" },
  });
  if (created.error || !created.data.user) {
    throw new Error("Could not create a temporary social-smoke user.");
  }

  const userClient = client(supabaseUrl, publishableKey);
  const signedIn = await userClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signedIn.error || !signedIn.data.session) {
    await admin.auth.admin.deleteUser(created.data.user.id, false);
    throw new Error("Temporary social-smoke user could not authenticate.");
  }

  const updated = await admin
    .from("profiles")
    .update({
      full_name: `ORHA Social Smoke ${label.toUpperCase()}`,
      username,
      birth_date: "1990-01-01",
      state_code: "SP",
      city: "São Paulo",
      bio: "Perfil efêmero de validação social do staging.",
      onboarding_step: 5,
    })
    .eq("id", created.data.user.id)
    .select("id")
    .single();
  if (updated.error || updated.data.id !== created.data.user.id) {
    await admin.auth.admin.deleteUser(created.data.user.id, false);
    throw new Error("Could not prepare the social-smoke profile.");
  }
  const completed = await userClient.rpc("complete_own_onboarding");
  if (
    completed.error ||
    requiredId(rpcRow(completed.data).id, "Onboarding") !== created.data.user.id
  ) {
    await admin.auth.admin.deleteUser(created.data.user.id, false);
    throw new Error("Could not complete the social-smoke onboarding.");
  }

  return {
    id: created.data.user.id,
    username,
    client: userClient,
    social: createSupabaseSocialRepository(userClient),
  };
}

async function expectRejected(
  operation: () => Promise<unknown>,
  label: string,
): Promise<void> {
  try {
    await operation();
  } catch {
    return;
  }
  throw new Error(`${label} was unexpectedly authorized.`);
}

async function requireNotification(
  principal: TemporaryPrincipal,
  eventType: string,
  entityId: string,
): Promise<void> {
  const result = await principal.client
    .from("notifications")
    .select("id,type,entity_id")
    .eq("type", eventType)
    .eq("entity_id", entityId)
    .limit(1);
  if (result.error || result.data.length !== 1) {
    throw new Error(`Notification ${eventType} was not persisted.`);
  }
}

async function cleanup(
  admin: SupabaseClient,
  principals: TemporaryPrincipal[],
  communityIds: string[],
): Promise<boolean> {
  await Promise.all(
    principals.map((principal) =>
      principal.client.auth.signOut().catch(() => undefined),
    ),
  );

  if (communityIds.length) {
    const removedCommunities = await admin
      .from("communities")
      .delete()
      .in("id", communityIds);
    if (removedCommunities.error) {
      throw new Error("Could not clean social-smoke communities.");
    }
  }

  for (const principal of principals) {
    const exists = await admin.auth.admin.getUserById(principal.id);
    if (exists.data.user) {
      const deleted = await admin.auth.admin.deleteUser(principal.id, false);
      if (deleted.error) {
        throw new Error("Could not clean social-smoke Auth user.");
      }
    }
  }

  const [authChecks, profileCheck, communityCheck] = await Promise.all([
    Promise.all(
      principals.map((principal) => admin.auth.admin.getUserById(principal.id)),
    ),
    principals.length
      ? admin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .in(
            "id",
            principals.map((principal) => principal.id),
          )
      : Promise.resolve({ count: 0, error: null }),
    communityIds.length
      ? admin
          .from("communities")
          .select("id", { count: "exact", head: true })
          .in("id", communityIds)
      : Promise.resolve({ count: 0, error: null }),
  ]);
  if (profileCheck.error || communityCheck.error) {
    throw new Error("Could not verify social-smoke cleanup.");
  }
  return (
    authChecks.every((result) => !result.data.user) &&
    profileCheck.count === 0 &&
    communityCheck.count === 0
  );
}

export async function runSocialDomainSmoke(
  environment: SmokeEnvironment,
): Promise<SocialDomainSmokeResult> {
  const linkedRef = await readFile(
    path.join(environment.workspace, "supabase", ".temp", "project-ref"),
    "utf8",
  );
  const supabaseUrl = validateSocialSmokeTarget(
    environment.supabaseUrl,
    linkedRef,
  );
  const admin = client(supabaseUrl, environment.serviceRoleKey);
  const anonymous = client(supabaseUrl, environment.publishableKey);
  const principals: TemporaryPrincipal[] = [];
  const communityIds: string[] = [];
  const checks: string[] = [];
  let cleanupVerified: boolean | undefined;

  try {
    const principalA = await createPrincipal(
      admin,
      supabaseUrl,
      environment.publishableKey,
      "a",
    );
    principals.push(principalA);
    const principalB = await createPrincipal(
      admin,
      supabaseUrl,
      environment.publishableKey,
      "b",
    );
    principals.push(principalB);
    checks.push("two-temporary-onboarded-users");

    const discovered = await principalA.social.listProfiles({
      search: principalB.username,
      limit: 5,
    });
    if (!discovered.items.some((profile) => profile.id === principalB.id)) {
      throw new Error("Completed profile was not discoverable server-side.");
    }
    checks.push("profile-discovery");

    await expectRejected(
      () => principalA.social.requestFriendship(principalA.id),
      "Self friendship",
    );
    checks.push("self-friendship-denied");

    const friendship = await principalA.social.requestFriendship(principalB.id);
    if (
      friendship.requesterId !== principalA.id ||
      friendship.addresseeId !== principalB.id ||
      friendship.status !== "pending"
    ) {
      throw new Error("Friendship request returned an invalid relationship.");
    }
    await requireNotification(principalB, "friendship_request", friendship.id);
    checks.push("friendship-request-notified");

    const idempotent = await principalB.social.requestFriendship(principalA.id);
    if (idempotent.id !== friendship.id || idempotent.status !== "pending") {
      throw new Error("Concurrent friendship pair was not deduplicated.");
    }
    checks.push("friendship-pair-deduplicated");

    const incoming = await principalB.social.listFriendships({
      status: "pending",
      direction: "incoming",
    });
    if (!incoming.items.some((item) => item.id === friendship.id)) {
      throw new Error(
        "Incoming friendship request was not readable by its recipient.",
      );
    }
    const accepted = await principalB.social.respondToFriendship(
      friendship.id,
      true,
    );
    if (accepted.status !== "accepted" || !accepted.acceptedAt) {
      throw new Error("Friendship acceptance was not persisted.");
    }
    await requireNotification(principalA, "friendship_accepted", friendship.id);
    checks.push("friendship-accepted-notified");

    const spoofedFriendship = principalA.client.from("friendships").insert({
      requester_id: principalB.id,
      addressee_id: principalA.id,
      status: "accepted",
    });
    await expectRejected(
      () =>
        Promise.resolve(spoofedFriendship).then((result) => {
          if (result.error) throw result.error;
        }),
      "Direct privileged friendship insert",
    );
    checks.push("direct-friendship-write-denied");

    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const community = await principalA.social.createCommunity({
      name: `Comunidade Smoke ${suffix}`,
      slug: `social-smoke-${suffix}`,
      description:
        "Comunidade efêmera para validar persistência e autorização.",
      category: "faith",
      visibility: "public",
    });
    communityIds.push(community.id);
    if (community.ownerId !== principalA.id) {
      throw new Error("Community ownership was not assigned server-side.");
    }
    checks.push("community-created-with-server-owner");

    const communities = await principalB.social.listCommunities({
      search: community.name,
      limit: 5,
    });
    if (!communities.items.some((item) => item.id === community.id)) {
      throw new Error("Public community was not discoverable.");
    }
    const membership = await principalB.social.joinCommunity(community.id);
    if (
      membership.profileId !== principalB.id ||
      membership.status !== "active" ||
      membership.role !== "member"
    ) {
      throw new Error(
        "Public community membership was not persisted as active.",
      );
    }
    checks.push("community-discovered-and-joined");

    const unauthorizedUpdate = await principalB.client
      .from("communities")
      .update({ name: "Alteração indevida" })
      .eq("id", community.id)
      .select("id");
    if (!unauthorizedUpdate.error && unauthorizedUpdate.data.length !== 0) {
      throw new Error("Non-manager community update was not denied by RLS.");
    }
    const unchangedCommunity = await principalA.social.getCommunity(
      community.id,
    );
    if (!unchangedCommunity || unchangedCommunity.name !== community.name) {
      throw new Error("Unauthorized community update changed persisted data.");
    }
    checks.push("community-manager-authority-enforced");

    const post = await principalA.social.createPost({
      communityId: community.id,
      body: "Publicação efêmera de validação social.",
      visibility: "community",
    });
    const visiblePosts = await principalB.social.listPosts({
      communityId: community.id,
      limit: 10,
    });
    if (!visiblePosts.items.some((item) => item.id === post.id)) {
      throw new Error("Community member could not read the persisted post.");
    }
    checks.push("community-post-persisted-and-visible");

    const comment = await principalB.social.createComment({
      postId: post.id,
      body: "Comentário efêmero de validação.",
    });
    const comments = await principalA.social.listComments(post.id, {
      limit: 10,
    });
    if (!comments.items.some((item) => item.id === comment.id)) {
      throw new Error("Post author could not read the persisted comment.");
    }
    await requireNotification(principalA, "post_commented", comment.id);
    checks.push("post-comment-persisted-and-notified");

    const postReaction = await principalB.social.setReaction({
      targetType: "post",
      targetId: post.id,
      kind: "amen",
    });
    if (!postReaction || postReaction.kind !== "amen") {
      throw new Error("Post reaction was not persisted.");
    }
    await requireNotification(principalA, "content_reacted", post.id);
    const commentReaction = await principalA.social.setReaction({
      targetType: "comment",
      targetId: comment.id,
      kind: "support",
    });
    if (!commentReaction || commentReaction.kind !== "support") {
      throw new Error("Comment reaction was not persisted.");
    }
    await requireNotification(principalB, "content_reacted", comment.id);
    checks.push("post-and-comment-reactions-notified");

    await principalB.social.leaveCommunity(community.id);
    const leftMembership = await principalB.client
      .from("community_memberships")
      .select("status,joined_at")
      .eq("community_id", community.id)
      .eq("profile_id", principalB.id)
      .single();
    if (
      leftMembership.error ||
      leftMembership.data.status !== "left" ||
      leftMembership.data.joined_at !== null
    ) {
      throw new Error(
        "Leaving the community did not persist the expected state.",
      );
    }
    const rejoined = await principalB.social.joinCommunity(community.id);
    if (rejoined.status !== "active" || !rejoined.joinedAt) {
      throw new Error("Community rejoin did not restore active membership.");
    }
    checks.push("community-leave-and-rejoin");

    const blockMutation = await principalB.client.rpc("block_profile", {
      p_target_profile_id: principalA.id,
      p_reason: "Validação efêmera de bloqueio global.",
    });
    const block = rpcRow(blockMutation.data);
    if (blockMutation.error || block.blocked_id !== principalA.id) {
      throw new Error("Block did not persist the target profile.");
    }
    const removedFriendship = await principalA.social.getFriendshipWith(
      principalB.id,
    );
    if (removedFriendship !== null) {
      throw new Error("Global block did not remove the existing friendship.");
    }
    if ((await principalB.social.getProfile(principalA.id)) !== null) {
      throw new Error("Blocked profile remained visible to the blocker.");
    }
    await expectRejected(
      () => principalA.social.requestFriendship(principalB.id),
      "Friendship across a global block",
    );
    checks.push("global-block-removes-and-prevents-friendship");

    const unblock = await principalB.client.rpc("unblock_profile", {
      p_target_profile_id: principalA.id,
    });
    if (unblock.error) throw new Error("Could not remove the global block.");
    if (
      (await principalB.social.getProfile(principalA.id))?.id !== principalA.id
    ) {
      throw new Error("Unblocked profile did not become visible again.");
    }
    const requestedAgain = await principalA.social.requestFriendship(
      principalB.id,
    );
    await principalB.social.respondToFriendship(requestedAgain.id, false);
    checks.push("unblock-restores-consensual-contact");

    const anonymousProfiles = await anonymous.rpc("search_visible_profiles", {
      search_term: principalA.username,
      page_size: 5,
      page_offset: 0,
    });
    if (!anonymousProfiles.error) {
      throw new Error(
        "Anonymous profile discovery was unexpectedly authorized.",
      );
    }
    const anonymousCommunities = await anonymous
      .from("communities")
      .select("id")
      .eq("id", community.id);
    if (!anonymousCommunities.error) {
      throw new Error(
        "Anonymous community reads were unexpectedly authorized.",
      );
    }
    checks.push("anonymous-social-data-denied");
  } finally {
    cleanupVerified = await cleanup(admin, principals, communityIds);
  }

  return { checks, cleanupVerified: cleanupVerified ?? false };
}

async function main(): Promise<void> {
  const result = await runSocialDomainSmoke({
    supabaseUrl: requiredEnvironment("ORHA_STAGING_SUPABASE_URL"),
    publishableKey: requiredEnvironment(
      "ORHA_STAGING_SUPABASE_PUBLISHABLE_KEY",
    ),
    serviceRoleKey: requiredEnvironment("ORHA_E2E_SERVICE_ROLE_KEY"),
    workspace: process.cwd(),
  });
  const checks = result.checks.length + Number(result.cleanupVerified);
  console.log(`ORHA social-domain staging smoke: ${checks}/${checks} passed.`);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  void main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Social-domain smoke failed.",
    );
    process.exitCode = 1;
  });
}
