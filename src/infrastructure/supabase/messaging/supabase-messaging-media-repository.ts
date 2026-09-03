import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MessageMedia,
  MessagingMediaRepository,
  NewMessageMedia,
  StoredMessageMedia,
} from "@/domains/messaging";

export const MESSAGE_MEDIA_BUCKET = "chat-media";
const SIGNED_URL_TTL_SECONDS = 15 * 60;
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const MIME_KIND = new Map<string, NewMessageMedia["kind"]>([
  ["image/jpeg", "image"],
  ["image/png", "image"],
  ["image/webp", "image"],
  ["image/avif", "image"],
  ["audio/webm", "audio"],
  ["audio/mp4", "audio"],
  ["audio/mpeg", "audio"],
  ["audio/ogg", "audio"],
  ["audio/wav", "audio"],
]);

function safeSegment(value: string, label: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new Error(`${label} inválido para armazenamento.`);
  return value;
}

function safeFileName(value: string) {
  const cleaned = value.normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (cleaned || "arquivo").slice(0, 120);
}

function normalizedMime(value: string) {
  return value.toLocaleLowerCase("en-US").split(";", 1)[0]?.trim() ?? "";
}

function assertSafeSignedUrl(value: string) {
  const parsed = new URL(value);
  const localHttp = parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  if (parsed.protocol !== "https:" && !localHttp) throw new Error("O Storage retornou uma URL não segura.");
  return parsed.toString();
}

function isExistingObjectError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { statusCode?: string | number; status?: string | number; message?: string };
  const status = String(candidate.statusCode ?? candidate.status ?? "");
  return status === "409" || /already exists|duplicate/i.test(candidate.message ?? "");
}

export function validateMessageMedia(media: NewMessageMedia) {
  if (media.blob.size <= 0) throw new Error("O arquivo está vazio.");
  const mimeType = normalizedMime(media.mimeType || media.blob.type);
  if (MIME_KIND.get(mimeType) !== media.kind) throw new Error("Formato de mídia não permitido nesta conversa.");
  if (mimeType === "audio/wav" && !media.fileName.toLocaleLowerCase("en-US").endsWith(".wav")) {
    throw new Error("O nome do arquivo WAV precisa terminar em .wav.");
  }
  if (media.blob.size > MAX_MEDIA_BYTES) throw new Error("O arquivo excede o limite de 25 MB.");
  if (media.waveform && (media.waveform.length > 256 || media.waveform.some((value) => !Number.isFinite(value)))) {
    throw new Error("A forma de onda do áudio é inválida.");
  }
}

async function validateMessageMediaSignature(media: NewMessageMedia) {
  const mimeType = normalizedMime(media.mimeType || media.blob.type);
  if (mimeType !== "audio/wav") return;
  const bytes = new Uint8Array(await media.blob.slice(0, 12).arrayBuffer());
  const hasRiffHeader = bytes.length === 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45;
  if (!hasRiffHeader) throw new Error("O arquivo WAV não possui um cabeçalho RIFF/WAVE válido.");
}

export class SupabaseMessagingMediaRepository implements MessagingMediaRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly signedUrlTtlSeconds = SIGNED_URL_TTL_SECONDS,
  ) {}

  async upload(input: {
    conversationId: string;
    userId: string;
    clientMessageId: string;
    index: number;
    media: NewMessageMedia;
  }): Promise<StoredMessageMedia> {
    validateMessageMedia(input.media);
    await validateMessageMediaSignature(input.media);
    const fileName = safeFileName(input.media.fileName);
    const mimeType = normalizedMime(input.media.mimeType || input.media.blob.type);
    const storagePath = [
      safeSegment(input.userId, "Usuário"),
      safeSegment(input.conversationId, "Conversa"),
      safeSegment(input.clientMessageId, "Mensagem"),
      `${Math.max(0, input.index)}-${fileName}`,
    ].join("/");
    const { error } = await this.client.storage.from(MESSAGE_MEDIA_BUCKET).upload(storagePath, input.media.blob, {
      contentType: mimeType,
      cacheControl: "3600",
      upsert: false,
    });
    if (error && !isExistingObjectError(error)) throw error;
    const signedUrl = await this.createSignedUrl(MESSAGE_MEDIA_BUCKET, storagePath);
    return {
      kind: input.media.kind,
      bucket: MESSAGE_MEDIA_BUCKET,
      storagePath,
      signedUrl,
      fileName,
      mimeType,
      sizeBytes: input.media.blob.size,
      width: input.media.width ?? null,
      height: input.media.height ?? null,
      durationSeconds: input.media.durationSeconds ?? null,
      waveform: input.media.waveform?.slice(0, 256) ?? null,
    };
  }

  async remove(bucket: string, storagePaths: string[]): Promise<void> {
    const safePaths = storagePaths.filter((path) => path && !path.startsWith("/") && !path.includes(".."));
    if (!safePaths.length) return;
    const { error } = await this.client.storage.from(bucket).remove(safePaths);
    if (error) throw error;
  }

  async createSignedUrl(bucket: string, storagePath: string): Promise<string> {
    if (!bucket || !storagePath || storagePath.startsWith("/") || storagePath.includes("..")) {
      throw new Error("Caminho de mídia inválido.");
    }
    const { data, error } = await this.client.storage.from(bucket).createSignedUrl(storagePath, this.signedUrlTtlSeconds);
    if (error) throw error;
    if (!data?.signedUrl) throw new Error("O Supabase não retornou uma URL assinada.");
    return assertSafeSignedUrl(data.signedUrl);
  }

  async hydrateMedia(media: Omit<MessageMedia, "signedUrl">[]): Promise<MessageMedia[]> {
    return Promise.all(media.map(async (item) => ({
      ...item,
      signedUrl: await this.createSignedUrl(item.bucket, item.storagePath),
    })));
  }
}
