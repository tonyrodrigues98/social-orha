import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.2";
import { assertPost, corsHeaders, errorResponse, jsonResponse, optionsResponse, parseJsonObject } from "../_shared/http.ts";
import { inspectMedia, MediaInspectionError } from "../_shared/media-signatures.ts";
import { createServiceClient, EdgeHttpError, requireAuthenticatedUser } from "../_shared/runtime.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PendingMediaRow = {
  id: string;
  bucket_id: string;
  object_path: string;
  mime_type: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  status: string;
  profile_id?: string;
  owner_id?: string;
};

type RejectedMedia = {
  scope: "profile" | "post" | "community_branding" | "report_evidence";
  id: string;
  ownerId: string;
  bucket: string;
  objectPath: string;
  reasonCode: string;
};

function requiredUuid(body: Record<string, unknown>, key: string): string {
  const value = typeof body[key] === "string" ? body[key] : "";
  if (!uuidPattern.test(value)) throw new EdgeHttpError(400, "invalid_identifier", "Identificador de mídia inválido.");
  return value;
}

function optionalUuid(body: Record<string, unknown>, key: string): string | null {
  if (body[key] == null || body[key] === "") return null;
  return requiredUuid(body, key);
}

function requiredString(body: Record<string, unknown>, key: string, maximumLength = 300): string {
  const value = typeof body[key] === "string" ? body[key].trim() : "";
  if (!value || value.length > maximumLength) {
    throw new EdgeHttpError(400, "invalid_media_metadata", "Metadados de mídia inválidos.");
  }
  return value;
}

function optionalString(body: Record<string, unknown>, key: string, maximumLength: number): string | null {
  if (body[key] == null) return null;
  if (typeof body[key] !== "string") throw new EdgeHttpError(400, "invalid_message_body", "Mensagem inválida.");
  const value = body[key].trim();
  if (!value) return null;
  if (value.length > maximumLength) throw new EdgeHttpError(400, "invalid_message_body", "Mensagem inválida.");
  return value;
}

function optionalNumber(body: Record<string, unknown>, key: string): number | null {
  const value = body[key];
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new EdgeHttpError(400, "invalid_media_metadata", "Metadados de mídia inválidos.");
  }
  return value;
}

function normalizedWaveform(value: unknown): number[] | null {
  if (value == null) return null;
  if (!Array.isArray(value) || value.length > 256) {
    throw new EdgeHttpError(400, "invalid_waveform", "A forma de onda é inválida.");
  }
  const waveform = value.map(Number);
  if (waveform.some((sample) => !Number.isFinite(sample) || sample < 0 || sample > 1)) {
    throw new EdgeHttpError(400, "invalid_waveform", "A forma de onda é inválida.");
  }
  return waveform;
}

async function downloadAndInspect(
  service: SupabaseClient,
  media: Pick<PendingMediaRow, "bucket_id" | "object_path" | "mime_type" | "byte_size" | "width" | "height">,
): Promise<void> {
  const { data, error } = await service.storage.from(media.bucket_id).download(media.object_path);
  if (error || !data) throw new EdgeHttpError(503, "media_download_failed", "Não foi possível verificar a mídia agora.");
  const bytes = new Uint8Array(await data.arrayBuffer());
  inspectMedia(bytes, {
    mimeType: media.mime_type,
    byteSize: Number(media.byte_size),
    width: media.width,
    height: media.height,
  });
}

async function verifyReservedMedia(
  request: Request,
  service: SupabaseClient,
  userId: string,
  scope: "profile" | "post" | "community_branding" | "report_evidence",
  mediaId: string,
): Promise<Response> {
  const table = scope === "profile"
    ? "profile_media"
    : scope === "post"
      ? "post_media"
      : scope === "community_branding"
        ? "community_branding_media"
        : "report_evidence";
  const ownerColumn = scope === "profile" ? "profile_id" : scope === "report_evidence" ? "uploader_id" : "owner_id";
  const columns = scope === "report_evidence"
    ? `id,${ownerColumn},bucket_id,object_path,mime_type,byte_size,status`
    : `id,${ownerColumn},bucket_id,object_path,mime_type,byte_size,width,height,status`;
  const lookup = await service
    .from(table)
    .select(columns)
    .eq("id", mediaId)
    .eq(ownerColumn, userId)
    .eq("status", "pending")
    .maybeSingle();
  if (lookup.error) throw new EdgeHttpError(500, "media_lookup_failed", "Não foi possível localizar a mídia.");
  if (!lookup.data) throw new EdgeHttpError(404, "pending_media_not_found", "Mídia pendente não encontrada.");
  const lookupRow = lookup.data as unknown as Omit<PendingMediaRow, "width" | "height">
    & Partial<Pick<PendingMediaRow, "width" | "height">>;
  const media = {
    ...lookupRow,
    width: lookupRow.width ?? null,
    height: lookupRow.height ?? null,
  } satisfies PendingMediaRow;

  try {
    await downloadAndInspect(service, media);
  } catch (cause) {
    if (cause instanceof MediaInspectionError) {
      throw Object.assign(
        new EdgeHttpError(422, "media_validation_failed", "O conteúdo do arquivo não corresponde ao formato informado."),
        {
          rejectedMedia: {
            scope,
            id: media.id,
            ownerId: userId,
            bucket: media.bucket_id,
            objectPath: media.object_path,
            reasonCode: cause.code,
          } satisfies RejectedMedia,
        },
      );
    }
    throw cause;
  }

  const rpc = scope === "profile"
    ? "finalize_validated_profile_media"
    : scope === "post"
      ? "finalize_validated_post_media"
      : scope === "community_branding"
        ? "finalize_validated_community_branding"
        : "finalize_validated_report_evidence";
  const parameters = scope === "profile"
    ? { p_media_id: media.id, p_profile_id: userId }
    : scope === "report_evidence"
      ? { p_evidence_id: media.id, p_owner_id: userId }
      : { p_media_id: media.id, p_owner_id: userId };
  const result = await service.rpc(rpc, parameters);
  const ready = Array.isArray(result.data) ? result.data[0] : result.data;
  if (result.error || !ready) throw new EdgeHttpError(500, "media_promotion_failed", "A promoção da mídia falhou.");
  return jsonResponse(request, { media: ready });
}

function assertMessageKind(kind: string, mimeType: string): asserts kind is "image" | "audio" {
  const validImages = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
  const validAudio = new Set(["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav"]);
  const valid = (kind === "image" && validImages.has(mimeType))
    || (kind === "audio" && validAudio.has(mimeType));
  if (!valid) throw new EdgeHttpError(422, "message_media_kind_mismatch", "O arquivo não corresponde à mensagem.");
}

async function verifyMessageMedia(
  request: Request,
  service: SupabaseClient,
  userId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const conversationId = requiredUuid(body, "conversationId");
  const clientMessageId = requiredUuid(body, "clientMessageId");
  const replyToMessageId = optionalUuid(body, "replyToMessageId");
  const kind = requiredString(body, "kind", 16);
  const messageBody = optionalString(body, "body", 5_000);
  const objectPath = requiredString(body, "objectPath");
  const mimeType = requiredString(body, "mimeType", 80).toLocaleLowerCase("en-US").split(";", 1)[0]!;
  const byteSize = optionalNumber(body, "byteSize");
  const width = optionalNumber(body, "width");
  const height = optionalNumber(body, "height");
  const durationSeconds = optionalNumber(body, "durationSeconds");
  const waveform = normalizedWaveform(body.waveform);
  assertMessageKind(kind, mimeType);
  if (!byteSize || !Number.isInteger(byteSize) || byteSize < 1 || byteSize > 26_214_400) {
    throw new EdgeHttpError(400, "invalid_media_size", "O tamanho da mídia é inválido.");
  }
  if (kind === "image" && (
    typeof width !== "number" || typeof height !== "number"
    || !Number.isInteger(width) || !Number.isInteger(height)
    || width < 1 || height < 1 || width > 12_000 || height > 12_000
    || durationSeconds !== null || waveform !== null
  )) {
    throw new EdgeHttpError(400, "invalid_image_metadata", "As dimensões da imagem são inválidas.");
  }
  if (kind === "audio" && (
    durationSeconds === null || durationSeconds <= 0 || durationSeconds > 3_600
    || !waveform?.length || width !== null || height !== null
  )) {
    throw new EdgeHttpError(400, "invalid_audio_metadata", "Os metadados do áudio são inválidos.");
  }

  const expectedPrefix = `${userId}/${conversationId}/${clientMessageId}/`;
  if (!objectPath.startsWith(expectedPrefix) || objectPath.includes("..") || objectPath.startsWith("/")) {
    throw new EdgeHttpError(403, "invalid_media_path", "O caminho da mídia não pertence à mensagem.");
  }

  try {
    await downloadAndInspect(service, {
      bucket_id: "chat-media",
      object_path: objectPath,
      mime_type: mimeType,
      byte_size: byteSize,
      width,
      height,
    });
  } catch (cause) {
    if (cause instanceof MediaInspectionError) {
      await service.storage.from("chat-media").remove([objectPath]);
      throw new EdgeHttpError(422, "media_validation_failed", "O conteúdo do arquivo não corresponde ao formato informado.");
    }
    throw cause;
  }

  const result = await service.rpc("send_validated_message_media", {
    p_conversation_id: conversationId,
    p_kind: kind,
    p_body: messageBody,
    p_reply_to_message_id: replyToMessageId,
    p_client_message_id: clientMessageId,
    p_owner_id: userId,
    p_object_path: objectPath,
    p_mime_type: mimeType,
    p_byte_size: byteSize,
    p_duration_seconds: durationSeconds,
    p_waveform: waveform,
    p_width: width,
    p_height: height,
  });
  const message = Array.isArray(result.data) ? result.data[0] : result.data;
  if (result.error || !message) {
    throw new EdgeHttpError(500, "message_media_commit_failed", "Não foi possível enviar a mídia validada.");
  }
  return jsonResponse(request, { message });
}

async function handle(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    try {
      return optionsResponse(request);
    } catch (cause) {
      return errorResponse(request, cause);
    }
  }
  let service: ReturnType<typeof createServiceClient> | null = null;
  try {
    assertPost(request);
    corsHeaders(request);
    service = createServiceClient();
    const [{ user }, body] = await Promise.all([
      requireAuthenticatedUser(request),
      parseJsonObject(request, 32_768),
    ]);
    const scope = body.scope;
    if (scope === "profile" || scope === "post" || scope === "community_branding" || scope === "report_evidence") {
      return await verifyReservedMedia(request, service, user.id, scope, requiredUuid(body, "mediaId"));
    }
    if (scope === "message") return await verifyMessageMedia(request, service, user.id, body);
    throw new EdgeHttpError(400, "invalid_media_scope", "Escopo de mídia inválido.");
  } catch (cause) {
    const rejected = (cause as { rejectedMedia?: RejectedMedia } | null)?.rejectedMedia;
    if (rejected && service) {
      await service.storage.from(rejected.bucket).remove([rejected.objectPath]);
      if (rejected.scope === "community_branding") {
        await service.rpc("reject_community_branding_validation", {
          p_media_id: rejected.id,
          p_owner_id: rejected.ownerId,
          p_reason_code: rejected.reasonCode,
        });
      } else if (rejected.scope === "report_evidence") {
        await service.rpc("reject_report_evidence_validation", {
          p_evidence_id: rejected.id,
          p_owner_id: rejected.ownerId,
          p_reason_code: rejected.reasonCode,
        });
      } else {
        await service.rpc("reject_media_validation", {
          p_scope: rejected.scope,
          p_media_id: rejected.id,
          p_owner_id: rejected.ownerId,
          p_reason_code: rejected.reasonCode,
        });
      }
    }
    return errorResponse(request, cause);
  }
}

export default { fetch: handle };
