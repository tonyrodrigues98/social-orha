import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.2";
import { EdgeHttpError } from "./runtime.ts";

export type ExportFilter =
  | Readonly<{ column: string; value: string; and?: readonly (readonly [string, string])[] }>
  | Readonly<{ or: string }>;

export type ExportDataset = Readonly<{
  key: string;
  table: string;
  columns?: string;
  filter: (userId: string) => ExportFilter;
}>;

export const exportDatasets: readonly ExportDataset[] = [
  { key: "profile", table: "profiles", filter: (id) => ({ column: "id", value: id }) },
  { key: "profileDetails", table: "profile_details", filter: (id) => ({ column: "profile_id", value: id }) },
  { key: "profilePrivacy", table: "profile_privacy", filter: (id) => ({ column: "profile_id", value: id }) },
  { key: "profileModerationState", table: "profile_moderation_state", filter: (id) => ({ column: "profile_id", value: id }) },
  { key: "roles", table: "user_roles", filter: (id) => ({ column: "user_id", value: id }) },
  { key: "settings", table: "user_settings", filter: (id) => ({ column: "profile_id", value: id }) },
  { key: "notificationPreferences", table: "notification_preferences", filter: (id) => ({ column: "profile_id", value: id }) },
  { key: "lifecycleRequests", table: "account_lifecycle_requests", filter: (id) => ({ column: "user_id", value: id }) },
  { key: "outgoingBlocks", table: "blocks", filter: (id) => ({ column: "blocker_id", value: id }) },
  { key: "friendships", table: "friendships", filter: (id) => ({ or: `requester_id.eq.${id},addressee_id.eq.${id}` }) },
  { key: "communitiesOwned", table: "communities", filter: (id) => ({ column: "owner_id", value: id }) },
  { key: "communityMemberships", table: "community_memberships", filter: (id) => ({ column: "profile_id", value: id }) },
  { key: "postsAuthored", table: "community_posts", filter: (id) => ({ column: "author_id", value: id }) },
  { key: "postMediaOwned", table: "post_media", filter: (id) => ({ column: "owner_id", value: id }) },
  { key: "communityBrandingOwned", table: "community_branding_media", filter: (id) => ({ column: "owner_id", value: id }) },
  { key: "commentsAuthored", table: "post_comments", filter: (id) => ({ column: "author_id", value: id }) },
  { key: "postReactions", table: "post_reactions", filter: (id) => ({ column: "reactor_id", value: id }) },
  { key: "conversationRequests", table: "conversation_requests", filter: (id) => ({ or: `requester_id.eq.${id},recipient_id.eq.${id}` }) },
  { key: "conversationMemberships", table: "conversation_members", filter: (id) => ({ column: "profile_id", value: id }) },
  { key: "conversationPreferences", table: "conversation_preferences", filter: (id) => ({ column: "profile_id", value: id }) },
  { key: "messagesAuthored", table: "messages", filter: (id) => ({ column: "sender_id", value: id }) },
  { key: "messageAttachmentsOwned", table: "message_attachments", filter: (id) => ({ column: "owner_id", value: id }) },
  { key: "messageReactions", table: "message_reactions", filter: (id) => ({ column: "reactor_id", value: id }) },
  { key: "messageReceipts", table: "message_receipts", filter: (id) => ({ column: "profile_id", value: id }) },
  { key: "notifications", table: "notifications", filter: (id) => ({ column: "recipient_id", value: id }) },
  {
    key: "reportsSubmitted",
    table: "reports",
    columns: "id,reporter_id,target_type,target_id,category,details,status,assigned_to,resolution,created_at,updated_at,resolved_at",
    filter: (id) => ({ column: "reporter_id", value: id }),
  },
  { key: "reportEvidenceOwned", table: "report_evidence", filter: (id) => ({ column: "uploader_id", value: id }) },
  {
    key: "sanctionsReceived",
    table: "sanctions",
    filter: (id) => ({ column: "target_id", value: id, and: [["target_type", "profile"]] }),
  },
] as const;

const pageSize = 500;
const maximumRowsPerDataset = 10_000;

async function fetchDataset(
  service: SupabaseClient,
  dataset: ExportDataset,
  userId: string,
): Promise<unknown[]> {
  const rows: unknown[] = [];
  const filter = dataset.filter(userId);
  for (let offset = 0; offset < maximumRowsPerDataset; offset += pageSize) {
    let query = service.from(dataset.table).select(dataset.columns ?? "*");
    if ("or" in filter) {
      query = query.or(filter.or);
    } else {
      query = query.eq(filter.column, filter.value);
      for (const [column, value] of filter.and ?? []) query = query.eq(column, value);
    }
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) throw new EdgeHttpError(500, "export_query_failed", "Não foi possível reunir os dados da conta.");
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
  throw new EdgeHttpError(413, "export_dataset_too_large", "Sua exportação precisa de processamento assistido.");
}

export type MediaReference = Readonly<{ bucket: string; objectPath: string }>;

function stringField(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field ? field : null;
}

export function collectMediaReferences(data: Record<string, unknown[]>): MediaReference[] {
  const references: MediaReference[] = [];
  const collect = (key: string, defaultBucket: string) => {
    for (const row of data[key] ?? []) {
      const objectPath = stringField(row, "object_path");
      const bucket = stringField(row, "bucket_id") ?? defaultBucket;
      if (objectPath) references.push({ bucket, objectPath });
    }
  };
  collect("profileMediaOwned", "profile-media");
  collect("postMediaOwned", "community-media");
  collect("communityBrandingOwned", "community-media");
  collect("messageAttachmentsOwned", "chat-media");
  collect("reportEvidenceOwned", "report-evidence");

  for (const row of data.communitiesOwned ?? []) {
    for (const key of ["avatar_path", "cover_path"] as const) {
      const objectPath = stringField(row, key);
      if (objectPath) references.push({ bucket: "community-media", objectPath });
    }
  }
  return [...new Map(references.map((item) => [`${item.bucket}:${item.objectPath}`, item])).values()];
}

export async function buildAccountExport(
  service: SupabaseClient,
  input: {
    requestId: string;
    user: {
      id: string;
      email?: string;
      created_at: string;
      updated_at?: string;
      last_sign_in_at?: string;
      email_confirmed_at?: string;
      phone_confirmed_at?: string;
      user_metadata: Record<string, unknown>;
      app_metadata: Record<string, unknown>;
    };
  },
): Promise<Record<string, unknown>> {
  const data: Record<string, unknown[]> = {};
  for (const dataset of exportDatasets) {
    data[dataset.key] = await fetchDataset(service, dataset, input.user.id);
  }
  data.profileMediaOwned = await fetchDataset(
    service,
    { key: "profileMediaOwned", table: "profile_media", filter: (id) => ({ column: "profile_id", value: id }) },
    input.user.id,
  );

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    requestId: input.requestId,
    account: {
      id: input.user.id,
      email: input.user.email ?? null,
      createdAt: input.user.created_at,
      updatedAt: input.user.updated_at ?? null,
      lastSignInAt: input.user.last_sign_in_at ?? null,
      emailConfirmedAt: input.user.email_confirmed_at ?? null,
      phoneConfirmedAt: input.user.phone_confirmed_at ?? null,
      userMetadata: input.user.user_metadata,
      appMetadata: input.user.app_metadata,
    },
    data,
    media: collectMediaReferences(data),
    notes: [
      "A mídia privada é listada por bucket e caminho; o artefato não contém URLs assinadas que expirariam antes dele.",
      "A exportação inclui dados da própria conta e conteúdo criado pelo titular; não revela quem bloqueou o titular.",
    ],
  };
}

export function encodeAccountExport(exported: Record<string, unknown>): Uint8Array<ArrayBuffer> {
  const bytes = new TextEncoder().encode(JSON.stringify(exported));
  if (bytes.byteLength > 26_214_400) {
    throw new EdgeHttpError(413, "export_artifact_too_large", "Sua exportação precisa de processamento assistido.");
  }
  return bytes;
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
}
