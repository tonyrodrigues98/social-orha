export const MAX_PROFILE_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_PROFILE_GALLERY_IMAGES = 9;
export const PROFILE_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/avif";

const supportedProfileImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

export type ImageDimensions = {
  width: number;
  height: number;
};

export type ProfileMediaValidation =
  | { ok: true; files: File[] }
  | {
    ok: false;
    code: "empty" | "limit" | "type" | "size";
    message: string;
  };

export function validateProfileMediaSelection(
  files: readonly File[],
  availableSlots: number,
): ProfileMediaValidation {
  if (files.length === 0) {
    return {
      ok: false,
      code: "empty",
      message: "Nenhuma imagem foi selecionada.",
    };
  }

  if (availableSlots <= 0) {
    return {
      ok: false,
      code: "limit",
      message: `Sua galeria já atingiu o limite de ${MAX_PROFILE_GALLERY_IMAGES} fotos.`,
    };
  }

  if (files.length > availableSlots) {
    return {
      ok: false,
      code: "limit",
      message: `Selecione no máximo ${availableSlots} foto${availableSlots === 1 ? "" : "s"} nesta etapa.`,
    };
  }

  if (files.some((file) => !supportedProfileImageTypes.has(file.type))) {
    return {
      ok: false,
      code: "type",
      message: "Use imagens JPEG, PNG, WebP ou AVIF.",
    };
  }

  if (files.some((file) => file.size <= 0 || file.size > MAX_PROFILE_IMAGE_BYTES)) {
    return {
      ok: false,
      code: "size",
      message: "Cada imagem deve ter conteúdo e no máximo 10 MB.",
    };
  }

  return { ok: true, files: [...files] };
}

/**
 * Decodes the selected file before it reaches prototype state. MIME metadata alone
 * is not enough to prove that a file is a usable image.
 */
export function loadLocalImageDimensions(file: File): Promise<ImageDimensions> {
  if (
    typeof Image === "undefined"
    || typeof URL === "undefined"
    || typeof URL.createObjectURL !== "function"
  ) {
    return Promise.reject(new Error("A validação de imagens não está disponível neste dispositivo."));
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    const cleanup = () => URL.revokeObjectURL(objectUrl);

    image.onload = () => {
      const dimensions = {
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
      cleanup();

      if (dimensions.width <= 0 || dimensions.height <= 0) {
        reject(new Error("A imagem selecionada não possui dimensões válidas."));
        return;
      }

      resolve(dimensions);
    };
    image.onerror = () => {
      cleanup();
      reject(new Error("A imagem selecionada está corrompida ou não pode ser lida."));
    };
    image.decoding = "async";
    image.src = objectUrl;
  });
}
