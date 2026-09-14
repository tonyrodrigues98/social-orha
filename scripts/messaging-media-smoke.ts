import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";

const STAGING_PROJECT_REF = "bgeauxljwjbtbwpbzpoo";
const STAGING_ORIGIN = `https://${STAGING_PROJECT_REF}.supabase.co`;
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

type SmokeEnvironment = {
  supabaseUrl: string;
  publishableKey: string;
  serviceRoleKey: string;
  workspace: string;
};

export type MessagingMediaSmokeResult = {
  checks: readonly string[];
  cleanupVerified: boolean;
};

type TemporaryPrincipal = {
  id: string;
  client: SupabaseClient;
};

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment: ${name}.`);
  return value;
}

export function validateMessagingSmokeTarget(
  supabaseUrl: string,
  linkedProjectRef: string,
): string {
  const url = new URL(supabaseUrl);
  if (
    url.origin !== STAGING_ORIGIN ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    linkedProjectRef.trim() !== STAGING_PROJECT_REF
  ) {
    throw new Error(
      "Messaging-media smoke is restricted to the linked ORHA staging project.",
    );
  }
  return url.origin;
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

function makeWavBytes(): Buffer {
  const samples = Buffer.from([128, 142, 154, 142, 128, 114, 102, 114]);
  const bytes = Buffer.alloc(44 + samples.length);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(36 + samples.length, 4);
  bytes.write("WAVE", 8, "ascii");
  bytes.write("fmt ", 12, "ascii");
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8_000, 24);
  bytes.writeUInt32LE(8_000, 28);
  bytes.writeUInt16LE(1, 32);
  bytes.writeUInt16LE(8, 34);
  bytes.write("data", 36, "ascii");
  bytes.writeUInt32LE(samples.length, 40);
  samples.copy(bytes, 44);
  return bytes;
}

async function createPrincipal(
  admin: SupabaseClient,
  supabaseUrl: string,
  publishableKey: string,
  label: "a" | "b",
): Promise<TemporaryPrincipal> {
  const unique = randomUUID();
  const email = `orha-messaging-smoke-${label}-${unique}@example.invalid`;
  const password = `Orha-Messaging-${unique}!`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { test_scope: "messaging-media-smoke" },
  });
  if (created.error || !created.data.user) {
    throw new Error("Could not create a temporary messaging-smoke user.");
  }

  const userClient = client(supabaseUrl, publishableKey);
  const signedIn = await userClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signedIn.error || !signedIn.data.session) {
    await admin.auth.admin.deleteUser(created.data.user.id, false);
    throw new Error("Temporary messaging-smoke user could not authenticate.");
  }
  await userClient.realtime.setAuth(signedIn.data.session.access_token);

  const updated = await admin
    .from("profiles")
    .update({
      full_name: `ORHA Messaging Smoke ${label.toUpperCase()}`,
      username: `msg_${label}_${unique.replaceAll("-", "").slice(0, 18)}`,
      birth_date: "1990-01-01",
      state_code: "SP",
      city: "São Paulo",
      bio: "Perfil efêmero de validação do staging.",
      onboarding_step: 5,
    })
    .eq("id", created.data.user.id)
    .select("id")
    .single();
  if (updated.error || updated.data.id !== created.data.user.id) {
    await admin.auth.admin.deleteUser(created.data.user.id, false);
    throw new Error("Could not prepare the messaging-smoke profile.");
  }
  const completed = await userClient.rpc("complete_own_onboarding");
  if (
    completed.error ||
    requiredId(rpcRow(completed.data).id, "Onboarding") !== created.data.user.id
  ) {
    await admin.auth.admin.deleteUser(created.data.user.id, false);
    throw new Error("Could not complete the messaging-smoke onboarding.");
  }
  return { id: created.data.user.id, client: userClient };
}

async function subscribeToConversation(
  userClient: SupabaseClient,
  conversationId: string,
  clientMessageId: string,
): Promise<{
  channel: RealtimeChannel;
  event: Promise<Record<string, unknown>>;
}> {
  let resolveEvent: (row: Record<string, unknown>) => void = () => undefined;
  const event = new Promise<Record<string, unknown>>((resolve) => {
    resolveEvent = resolve;
  });
  let resolveReplication: () => void = () => undefined;
  let rejectReplication: (error: Error) => void = () => undefined;
  const replication = new Promise<void>((resolve, reject) => {
    resolveReplication = resolve;
    rejectReplication = reject;
  });
  const channel = userClient
    .channel(`conversation:${conversationId}`, {
      config: {
        private: true,
        broadcast: { ack: true, self: false, replication_ready: true },
        presence: { key: "receiver" },
      },
    })
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        const row = record(payload.new);
        if (row.client_message_id === clientMessageId) resolveEvent(row);
      },
    )
    .on("system", {}, (payload) => {
      if (payload.extension !== "system") return;
      if (payload.status === "ok") resolveReplication();
      else {
        rejectReplication(
          new Error("Realtime replication connection did not become ready."),
        );
      }
    });

  const subscribed = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Realtime subscription did not become ready.")),
      15_000,
    );
    channel.subscribe((status, error) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolve();
      } else if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        clearTimeout(timeout);
        reject(
          new Error(
            `Realtime subscription failed with ${status}${error?.message ? `: ${error.message}` : "."}`,
          ),
        );
      }
    });
  });
  await Promise.race([
    Promise.all([subscribed, replication]),
    delay(20_000).then(() => {
      throw new Error("Realtime replication readiness timed out.");
    }),
  ]);
  return { channel, event };
}

async function waitForRealtimeEvent(
  event: Promise<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  return Promise.race([
    event,
    delay(15_000).then(() => {
      throw new Error("Realtime did not deliver the persisted message.");
    }),
  ]);
}

async function verifyPrivateOperationalChannel(
  userClient: SupabaseClient,
  topic: string,
): Promise<void> {
  let resolveReplication: () => void = () => undefined;
  let rejectReplication: (error: Error) => void = () => undefined;
  const replication = new Promise<void>((resolve, reject) => {
    resolveReplication = resolve;
    rejectReplication = reject;
  });
  const channel = userClient
    .channel(topic, {
      config: {
        private: true,
        broadcast: { ack: false, self: false, replication_ready: true },
      },
    })
    .on("system", {}, (payload) => {
      if (payload.extension !== "system") return;
      if (payload.status === "ok") resolveReplication();
      else
        rejectReplication(new Error("Private operational channel was denied."));
    });
  const subscribed = new Promise<void>((resolve, reject) => {
    channel.subscribe((status, error) => {
      if (status === "SUBSCRIBED") resolve();
      if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        reject(
          new Error(
            `Private operational channel failed with ${status}${error?.message ? `: ${error.message}` : "."}`,
          ),
        );
      }
    });
  });
  try {
    await Promise.race([
      Promise.all([subscribed, replication]),
      delay(20_000).then(() => {
        throw new Error("Private operational channel readiness timed out.");
      }),
    ]);
  } finally {
    await userClient.removeChannel(channel);
  }
}

async function uploadAndVerifyMessageMedia(input: {
  sender: TemporaryPrincipal;
  receiver: TemporaryPrincipal;
  conversationId: string;
  kind: "image" | "audio";
  bytes: Buffer;
  fileName: string;
  mimeType: string;
  checks: string[];
  objectPaths: string[];
}): Promise<{ messageId: string; attachmentId: string; objectPath: string }> {
  const clientMessageId = randomUUID();
  const objectPath = `${input.sender.id}/${input.conversationId}/${clientMessageId}/${input.fileName}`;
  input.objectPaths.push(objectPath);
  const uploaded = await input.sender.client.storage
    .from("chat-media")
    .upload(objectPath, input.bytes, {
      contentType: input.mimeType,
      cacheControl: "3600",
      upsert: false,
    });
  if (uploaded.error) throw new Error(`Could not upload ${input.kind} bytes.`);
  input.checks.push(`${input.kind}-private-upload`);

  const waveform = input.kind === "audio" ? [0.1, 0.35, 0.8, 0.45, 0.2] : null;
  const verified = await input.sender.client.functions.invoke("media-verify", {
    body: {
      scope: "message",
      conversationId: input.conversationId,
      clientMessageId,
      kind: input.kind,
      body: null,
      replyToMessageId: null,
      objectPath,
      mimeType: input.mimeType,
      byteSize: input.bytes.length,
      durationSeconds: input.kind === "audio" ? 1 : null,
      waveform,
      width: input.kind === "image" ? 1 : null,
      height: input.kind === "image" ? 1 : null,
    },
  });
  if (verified.error)
    throw new Error(`media-verify rejected valid ${input.kind} bytes.`);
  const messageId = requiredId(
    record(record(verified.data).message).id,
    `${input.kind} message`,
  );
  input.checks.push(`${input.kind}-edge-validated`);

  const attachment = await input.receiver.client
    .from("message_attachments")
    .select("id,object_path,mime_type,byte_size,waveform")
    .eq("message_id", messageId)
    .single();
  if (
    attachment.error ||
    attachment.data.object_path !== objectPath ||
    attachment.data.mime_type !== input.mimeType ||
    Number(attachment.data.byte_size) !== input.bytes.length ||
    (input.kind === "audio" &&
      JSON.stringify(attachment.data.waveform) !== JSON.stringify(waveform))
  ) {
    throw new Error(
      `Receiver could not read persisted ${input.kind} metadata.`,
    );
  }
  const attachmentId = requiredId(
    attachment.data.id,
    `${input.kind} attachment`,
  );
  const signed = await input.receiver.client.storage
    .from("chat-media")
    .createSignedUrl(objectPath, 60);
  if (signed.error || !signed.data.signedUrl) {
    throw new Error(`Receiver could not authorize ${input.kind} download.`);
  }
  const downloaded = await fetch(signed.data.signedUrl, { redirect: "error" });
  const downloadedBytes = Buffer.from(await downloaded.arrayBuffer());
  if (!downloaded.ok || !downloadedBytes.equals(input.bytes)) {
    throw new Error(`Receiver downloaded invalid ${input.kind} bytes.`);
  }
  input.checks.push(`${input.kind}-participant-signed-download`);
  return { messageId, attachmentId, objectPath };
}

async function cleanup(
  admin: SupabaseClient,
  principals: TemporaryPrincipal[],
  objectPaths: { chat: string[]; evidence: string[] },
): Promise<boolean> {
  await Promise.all(
    principals.map((principal) =>
      principal.client.auth.signOut().catch(() => undefined),
    ),
  );
  if (objectPaths.chat.length) {
    const removed = await admin.storage
      .from("chat-media")
      .remove(objectPaths.chat);
    if (removed.error)
      throw new Error("Could not clean messaging-smoke objects.");
  }
  if (objectPaths.evidence.length) {
    const removed = await admin.storage
      .from("report-evidence")
      .remove(objectPaths.evidence);
    if (removed.error)
      throw new Error("Could not clean report-evidence objects.");
  }
  for (const principal of principals) {
    const exists = await admin.auth.admin.getUserById(principal.id);
    if (exists.data.user) {
      const deleted = await admin.auth.admin.deleteUser(principal.id, false);
      if (deleted.error)
        throw new Error("Could not clean messaging-smoke Auth user.");
    }
  }

  const [authChecks, chatObjects, evidenceObjects] = await Promise.all([
    Promise.all(
      principals.map((principal) => admin.auth.admin.getUserById(principal.id)),
    ),
    objectPaths.chat.length
      ? admin.storage
          .from("chat-media")
          .list(objectPaths.chat[0]!.split("/").slice(0, 3).join("/"))
      : Promise.resolve({ data: [], error: null }),
    objectPaths.evidence.length
      ? admin.storage
          .from("report-evidence")
          .list(objectPaths.evidence[0]!.split("/").slice(0, 2).join("/"))
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (chatObjects.error || evidenceObjects.error) {
    throw new Error("Could not verify messaging-media cleanup.");
  }
  return (
    authChecks.every((result) => !result.data.user) &&
    (chatObjects.data?.length ?? 0) === 0 &&
    (evidenceObjects.data?.length ?? 0) === 0
  );
}

export async function runMessagingMediaSmoke(
  environment: SmokeEnvironment,
): Promise<MessagingMediaSmokeResult> {
  const linkedRef = await readFile(
    path.join(environment.workspace, "supabase", ".temp", "project-ref"),
    "utf8",
  );
  const supabaseUrl = validateMessagingSmokeTarget(
    environment.supabaseUrl,
    linkedRef,
  );
  const admin = client(supabaseUrl, environment.serviceRoleKey);
  const anonymous = client(supabaseUrl, environment.publishableKey);
  const principals: TemporaryPrincipal[] = [];
  const objectPaths = { chat: [] as string[], evidence: [] as string[] };
  const checks: string[] = [];
  let realtimeChannel: RealtimeChannel | null = null;
  let cleanupVerified: boolean | undefined;

  try {
    const sender = await createPrincipal(
      admin,
      supabaseUrl,
      environment.publishableKey,
      "a",
    );
    principals.push(sender);
    const receiver = await createPrincipal(
      admin,
      supabaseUrl,
      environment.publishableKey,
      "b",
    );
    principals.push(receiver);
    checks.push("two-temporary-onboarded-users");

    await verifyPrivateOperationalChannel(
      receiver.client,
      `notifications:${receiver.id}`,
    );
    checks.push("private-notifications-realtime-ready");
    await verifyPrivateOperationalChannel(
      receiver.client,
      `support:${receiver.id}`,
    );
    checks.push("private-support-realtime-ready");

    const requested = await sender.client.rpc("request_conversation", {
      p_target_profile_id: receiver.id,
      p_opening_message: "Solicitação efêmera do smoke de mídia.",
    });
    const requestId = requiredId(
      rpcRow(requested.data).id,
      "Conversation request",
    );
    if (requested.error) throw new Error("Could not request the conversation.");
    const accepted = await receiver.client.rpc(
      "respond_to_conversation_request",
      { p_request_id: requestId, p_accept: true },
    );
    if (accepted.error)
      throw new Error("Could not accept the conversation request.");
    const conversationId = requiredId(
      rpcRow(accepted.data).conversation_id,
      "Accepted conversation",
    );
    checks.push("conversation-request-accepted");

    const textClientMessageId = randomUUID();
    const subscription = await subscribeToConversation(
      receiver.client,
      conversationId,
      textClientMessageId,
    );
    realtimeChannel = subscription.channel;
    const text = await sender.client.rpc("send_message", {
      p_conversation_id: conversationId,
      p_kind: "text",
      p_body: "Mensagem efêmera de validação Realtime.",
      p_reply_to_message_id: null,
      p_client_message_id: textClientMessageId,
    });
    if (text.error) throw new Error("Could not persist the text message.");
    const textMessageId = requiredId(rpcRow(text.data).id, "Text message");
    const realtimeRow = await waitForRealtimeEvent(subscription.event);
    if (realtimeRow.id !== textMessageId) {
      throw new Error("Realtime delivered a different message.");
    }
    checks.push("text-realtime-delivery");

    const image = await uploadAndVerifyMessageMedia({
      sender,
      receiver,
      conversationId,
      kind: "image",
      bytes: PNG_BYTES,
      fileName: "smoke.png",
      mimeType: "image/png",
      checks,
      objectPaths: objectPaths.chat,
    });
    const wavBytes = makeWavBytes();
    const audio = await uploadAndVerifyMessageMedia({
      sender,
      receiver,
      conversationId,
      kind: "audio",
      bytes: wavBytes,
      fileName: "smoke.wav",
      mimeType: "audio/wav",
      checks,
      objectPaths: objectPaths.chat,
    });

    const anonymousRead = await anonymous.storage
      .from("chat-media")
      .createSignedUrl(audio.objectPath, 60);
    if (!anonymousRead.error) {
      throw new Error(
        "Anonymous access was authorized for private chat media.",
      );
    }
    checks.push("anonymous-chat-media-denied");

    const receipt = await receiver.client.rpc("mark_message_read", {
      p_message_id: audio.messageId,
    });
    if (receipt.error)
      throw new Error("Could not persist the message read receipt.");
    const receiptRow = await admin
      .from("message_receipts")
      .select("delivered_at,read_at")
      .eq("message_id", audio.messageId)
      .eq("profile_id", receiver.id)
      .maybeSingle();
    if (
      receiptRow.error ||
      !receiptRow.data?.delivered_at ||
      !receiptRow.data.read_at
    ) {
      throw new Error("The read receipt was not persisted.");
    }
    checks.push("read-receipt-persisted");

    const reported = await receiver.client.rpc("create_report", {
      p_target_type: "message",
      p_target_id: audio.messageId,
      p_category: "harassment",
      p_details: "Evidência efêmera para validar o fluxo de moderação.",
    });
    if (reported.error) throw new Error("Could not create the message report.");
    const reportId = requiredId(rpcRow(reported.data).id, "Message report");
    const retained = await admin
      .from("report_target_attachments")
      .select("source_id,object_path")
      .eq("report_id", reportId)
      .eq("source_id", audio.attachmentId)
      .single();
    if (retained.error || retained.data.object_path !== audio.objectPath) {
      throw new Error(
        "The report did not retain the exact reported attachment.",
      );
    }
    checks.push("reported-audio-retained");

    const evidencePath = `${receiver.id}/${reportId}/smoke.png`;
    objectPaths.evidence.push(evidencePath);
    const reserved = await receiver.client.rpc("reserve_report_evidence", {
      p_report_id: reportId,
      p_object_path: evidencePath,
      p_mime_type: "image/png",
      p_byte_size: PNG_BYTES.length,
    });
    if (reserved.error) throw new Error("Could not reserve report evidence.");
    const evidenceId = requiredId(rpcRow(reserved.data).id, "Report evidence");
    const uploadedEvidence = await receiver.client.storage
      .from("report-evidence")
      .upload(evidencePath, PNG_BYTES, {
        contentType: "image/png",
        cacheControl: "3600",
        upsert: false,
      });
    if (uploadedEvidence.error)
      throw new Error("Could not upload report evidence.");
    const verifiedEvidence = await receiver.client.functions.invoke(
      "media-verify",
      {
        body: {
          scope: "report_evidence",
          mediaId: evidenceId,
        },
      },
    );
    if (verifiedEvidence.error)
      throw new Error("Could not validate report evidence.");
    const evidenceRow = await admin
      .from("report_evidence")
      .select("status,retention_until")
      .eq("id", evidenceId)
      .single();
    if (
      evidenceRow.error ||
      evidenceRow.data.status !== "ready" ||
      !evidenceRow.data.retention_until
    ) {
      throw new Error("Report evidence did not become retained and ready.");
    }
    checks.push("report-evidence-private-validated");

    const reporterRead = await receiver.client.storage
      .from("report-evidence")
      .createSignedUrl(evidencePath, 60);
    if (!reporterRead.error) {
      throw new Error("Reporter unexpectedly retained direct evidence access.");
    }
    checks.push("reporter-evidence-read-denied");

    if (image.messageId === audio.messageId) {
      throw new Error("Distinct media messages were deduplicated incorrectly.");
    }
    checks.push("distinct-media-idempotency-keys");
  } finally {
    if (realtimeChannel) await realtimeChannel.unsubscribe();
    cleanupVerified = await cleanup(admin, principals, objectPaths);
  }

  return { checks, cleanupVerified: cleanupVerified ?? false };
}

async function main(): Promise<void> {
  const result = await runMessagingMediaSmoke({
    supabaseUrl: requiredEnvironment("ORHA_STAGING_SUPABASE_URL"),
    publishableKey: requiredEnvironment(
      "ORHA_STAGING_SUPABASE_PUBLISHABLE_KEY",
    ),
    serviceRoleKey: requiredEnvironment("ORHA_E2E_SERVICE_ROLE_KEY"),
    workspace: process.cwd(),
  });
  const checks = result.checks.length + Number(result.cleanupVerified);
  console.log(
    `ORHA messaging-media staging smoke: ${checks}/${checks} passed.`,
  );
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  void main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Messaging-media smoke failed.",
    );
    process.exitCode = 1;
  });
}
