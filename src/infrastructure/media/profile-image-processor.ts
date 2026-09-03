import type {
  PixelCrop,
  ProcessedProfileImage,
  ProfileMediaPurpose,
} from "@/domain/profile-media";
import {
  MAX_PROFILE_IMAGE_BYTES,
  MAX_PROFILE_IMAGE_DIMENSION,
} from "./profile-image-validation";

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  release?: () => void;
};

export type RenderImageRequest = {
  source: CanvasImageSource;
  crop: PixelCrop;
  outputWidth: number;
  outputHeight: number;
  mimeType: "image/webp";
  quality: number;
};

export type ProfileImageProcessorEnvironment = {
  decode: (file: File) => Promise<DecodedImage>;
  render: (request: RenderImageRequest) => Promise<Blob>;
};

const maxOutputByPurpose: Record<ProfileMediaPurpose, { width: number; height: number }> = {
  avatar: { width: 512, height: 512 },
  cover: { width: 1600, height: 900 },
  gallery: { width: 2048, height: 2048 },
};

function clampCrop(crop: PixelCrop | undefined, width: number, height: number): PixelCrop {
  if (!crop) return { x: 0, y: 0, width, height };
  const x = Math.max(0, Math.min(Math.floor(crop.x), width - 1));
  const y = Math.max(0, Math.min(Math.floor(crop.y), height - 1));
  const cropWidth = Math.max(1, Math.min(Math.floor(crop.width), width - x));
  const cropHeight = Math.max(1, Math.min(Math.floor(crop.height), height - y));
  return { x, y, width: cropWidth, height: cropHeight };
}

export function fitImageWithin(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
) {
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function outputName(fileName: string) {
  const stem = fileName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-") || "imagem";
  return `${stem}.webp`;
}

export async function processProfileImage(
  file: File,
  options: {
    purpose: ProfileMediaPurpose;
    crop?: PixelCrop;
    signal?: AbortSignal;
  },
  environment: ProfileImageProcessorEnvironment = browserImageProcessorEnvironment,
): Promise<ProcessedProfileImage> {
  options.signal?.throwIfAborted();
  const decoded = await environment.decode(file);
  try {
    options.signal?.throwIfAborted();
    if (
      decoded.width <= 0
      || decoded.height <= 0
      || decoded.width > MAX_PROFILE_IMAGE_DIMENSION
      || decoded.height > MAX_PROFILE_IMAGE_DIMENSION
    ) {
      throw new Error("A imagem deve ter dimensões válidas de até 12.000 pixels por lado.");
    }
    const crop = clampCrop(options.crop, decoded.width, decoded.height);
    const maximum = maxOutputByPurpose[options.purpose];
    const output = fitImageWithin(crop.width, crop.height, maximum.width, maximum.height);
    const blob = await environment.render({
      source: decoded.source,
      crop,
      outputWidth: output.width,
      outputHeight: output.height,
      mimeType: "image/webp",
      quality: 0.86,
    });
    options.signal?.throwIfAborted();
    if (blob.size <= 0 || blob.size > MAX_PROFILE_IMAGE_BYTES) {
      throw new Error("A imagem processada deve ter conteúdo e no máximo 10 MB.");
    }
    return {
      file: new File([blob], outputName(file.name), {
        type: blob.type || "image/webp",
        lastModified: Date.now(),
      }),
      ...output,
    };
  } finally {
    decoded.release?.();
  }
}

async function decodeInBrowser(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Safari can expose createImageBitmap while rejecting a format that an
      // HTMLImageElement still decodes. Continue through the browser fallback.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = objectUrl;
  try {
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function renderInBrowser(request: RenderImageRequest): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = request.outputWidth;
  canvas.height = request.outputHeight;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return Promise.reject(new Error("O editor de imagem não está disponível."));
  context.drawImage(
    request.source,
    request.crop.x,
    request.crop.y,
    request.crop.width,
    request.crop.height,
    0,
    0,
    request.outputWidth,
    request.outputHeight,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Não foi possível gerar a imagem editada.")),
      request.mimeType,
      request.quality,
    );
  });
}

export const browserImageProcessorEnvironment: ProfileImageProcessorEnvironment = {
  decode: decodeInBrowser,
  render: renderInBrowser,
};
