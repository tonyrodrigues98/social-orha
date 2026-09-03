import type { CommunityVisibility } from "@/domains/social";

export const COMMUNITY_MEDIA_BUCKET = "community-media";
export const COMMUNITY_MEDIA_SIGNED_URL_SECONDS = 60 * 60;
export const MAX_COMMUNITY_MEDIA_BYTES = 25 * 1024 * 1024;
export const MAX_COMMUNITY_MEDIA_ITEMS = 6;

export type CommunityAssetKind = "avatar" | "cover";

export type CommunityUpdate = {
  name: string;
  description: string | null;
  category: string;
  visibility: CommunityVisibility;
};

export type CommunityRuleDraft = {
  title: string;
  description: string;
  sortOrder: number;
};

export type CommunityAssetUrls = {
  avatarUrl: string | null;
  coverUrl: string | null;
};

export type CommunityPostMedia = {
  id: string;
  postId: string;
  ownerId: string;
  bucketId: typeof COMMUNITY_MEDIA_BUCKET;
  objectPath: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  sortOrder: number;
  createdAt: string;
  readUrl: string | null;
};

export type CommunityMediaDimensions = {
  width: number | null;
  height: number | null;
};

const supportedPostMediaTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "video/mp4",
]);

const supportedCommunityAssetTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

export function normalizeCommunityCategory(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "general";
}

export function validateCommunityUpdate(input: CommunityUpdate): CommunityUpdate {
  const name = input.name.trim();
  const description = input.description?.trim() || null;
  const category = normalizeCommunityCategory(input.category);
  if (name.length < 3 || name.length > 100) {
    throw new Error("O nome da comunidade deve ter entre 3 e 100 caracteres.");
  }
  if (description && description.length > 2_000) {
    throw new Error("A descrição deve ter no máximo 2.000 caracteres.");
  }
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(category)) {
    throw new Error("Escolha uma categoria válida.");
  }
  return { ...input, name, description, category };
}

export function validateCommunityRule(input: CommunityRuleDraft): CommunityRuleDraft {
  const title = input.title.trim();
  const description = input.description.trim();
  if (title.length < 2 || title.length > 100) {
    throw new Error("O título da regra deve ter entre 2 e 100 caracteres.");
  }
  if (description.length < 2 || description.length > 1_000) {
    throw new Error("A descrição da regra deve ter entre 2 e 1.000 caracteres.");
  }
  if (!Number.isInteger(input.sortOrder) || input.sortOrder < 0 || input.sortOrder > 49) {
    throw new Error("A posição da regra é inválida.");
  }
  return { title, description, sortOrder: input.sortOrder };
}

export function nextCommunityRuleOrder(existingOrders: readonly number[]): number | null {
  const used = new Set(existingOrders.filter((order) => Number.isInteger(order) && order >= 0 && order <= 49));
  for (let order = 0; order <= 49; order += 1) {
    if (!used.has(order)) return order;
  }
  return null;
}

export function validateCommunityMediaFile(
  file: File,
  purpose: CommunityAssetKind | "post",
): void {
  const supported = purpose === "post"
    ? supportedPostMediaTypes
    : supportedCommunityAssetTypes;
  if (!supported.has(file.type)) {
    throw new Error(
      purpose === "post"
        ? "Use imagens JPEG, PNG, WebP ou AVIF, ou vídeo MP4."
        : "Use uma imagem JPEG, PNG, WebP ou AVIF.",
    );
  }
  if (file.size <= 0 || file.size > MAX_COMMUNITY_MEDIA_BYTES) {
    throw new Error("O arquivo deve ter conteúdo e no máximo 25 MB.");
  }
}

export function extensionForCommunityMedia(mimeType: string): string {
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
    "video/mp4": "mp4",
  };
  const extension = extensions[mimeType];
  if (!extension) throw new Error("O tipo de mídia não é permitido.");
  return extension;
}

export function buildPostCommentReportPath(commentId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(commentId)) {
    throw new Error("Comentário inválido.");
  }
  return `/denunciar/post_comment/${encodeURIComponent(commentId)}`;
}
