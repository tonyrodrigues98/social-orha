export type InspectedMedia = Readonly<{
  mimeType: string;
  width: number | null;
  height: number | null;
}>;

export class MediaInspectionError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MediaInspectionError";
  }
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function unsigned16BigEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function unsigned16LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function unsigned24LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16);
}

function unsigned32BigEndian(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! * 0x1000000
    + (bytes[offset + 1]! << 16)
    + (bytes[offset + 2]! << 8)
    + bytes[offset + 3]!
  ) >>> 0;
}

function positiveDimensions(width: number, height: number): { width: number; height: number } {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 12_000 || height > 12_000) {
    throw new MediaInspectionError("invalid_dimensions");
  }
  return { width, height };
}

function inspectPng(bytes: Uint8Array): InspectedMedia | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((value, index) => bytes[index] === value)) return null;
  if (bytes.length < 24 || ascii(bytes, 12, 4) !== "IHDR") throw new MediaInspectionError("invalid_png");
  const dimensions = positiveDimensions(unsigned32BigEndian(bytes, 16), unsigned32BigEndian(bytes, 20));
  return { mimeType: "image/png", ...dimensions };
}

function inspectJpeg(bytes: Uint8Array): InspectedMedia | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 4 < bytes.length) {
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset]!;
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const segmentLength = unsigned16BigEndian(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) throw new MediaInspectionError("invalid_jpeg");
    if (startOfFrame.has(marker)) {
      if (segmentLength < 7) throw new MediaInspectionError("invalid_jpeg");
      const dimensions = positiveDimensions(
        unsigned16BigEndian(bytes, offset + 5),
        unsigned16BigEndian(bytes, offset + 3),
      );
      return { mimeType: "image/jpeg", ...dimensions };
    }
    offset += segmentLength;
  }
  throw new MediaInspectionError("invalid_jpeg");
}

function inspectWebp(bytes: Uint8Array): InspectedMedia | null {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return null;
  const variant = ascii(bytes, 12, 4);
  let dimensions: { width: number; height: number };
  if (variant === "VP8X") {
    dimensions = positiveDimensions(
      unsigned24LittleEndian(bytes, 24) + 1,
      unsigned24LittleEndian(bytes, 27) + 1,
    );
  } else if (variant === "VP8L") {
    if (bytes[20] !== 0x2f || bytes.length < 25) throw new MediaInspectionError("invalid_webp");
    const width = 1 + bytes[21]! + ((bytes[22]! & 0x3f) << 8);
    const height = 1 + ((bytes[22]! & 0xc0) >> 6) + (bytes[23]! << 2) + ((bytes[24]! & 0x0f) << 10);
    dimensions = positiveDimensions(width, height);
  } else if (variant === "VP8 ") {
    if (bytes.length < 30 || bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
      throw new MediaInspectionError("invalid_webp");
    }
    dimensions = positiveDimensions(
      unsigned16LittleEndian(bytes, 26) & 0x3fff,
      unsigned16LittleEndian(bytes, 28) & 0x3fff,
    );
  } else {
    throw new MediaInspectionError("invalid_webp");
  }
  return { mimeType: "image/webp", ...dimensions };
}

function findAscii(bytes: Uint8Array, value: string, maximumOffset = bytes.length): number {
  const limit = Math.min(maximumOffset, bytes.length - value.length + 1);
  for (let offset = 0; offset < limit; offset += 1) {
    let matches = true;
    for (let index = 0; index < value.length; index += 1) {
      if (bytes[offset + index] !== value.charCodeAt(index)) {
        matches = false;
        break;
      }
    }
    if (matches) return offset;
  }
  return -1;
}

function inspectIsoMedia(bytes: Uint8Array): InspectedMedia | null {
  if (bytes.length < 16 || ascii(bytes, 4, 4) !== "ftyp") return null;
  const boxLength = Math.min(unsigned32BigEndian(bytes, 0), bytes.length, 256);
  if (boxLength < 16) throw new MediaInspectionError("invalid_iso_media");
  const brands = new Set<string>();
  for (let offset = 8; offset + 4 <= boxLength; offset += 4) brands.add(ascii(bytes, offset, 4));

  if (["avif", "avis"].some((brand) => brands.has(brand))) {
    const propertyOffset = findAscii(bytes, "ispe", Math.min(bytes.length, 1_048_576));
    if (propertyOffset < 4 || propertyOffset + 16 > bytes.length) throw new MediaInspectionError("invalid_avif");
    const dimensions = positiveDimensions(
      unsigned32BigEndian(bytes, propertyOffset + 8),
      unsigned32BigEndian(bytes, propertyOffset + 12),
    );
    return { mimeType: "image/avif", ...dimensions };
  }

  const mp4Brands = ["isom", "iso2", "avc1", "mp41", "mp42", "M4A ", "M4V ", "dash"];
  if (mp4Brands.some((brand) => brands.has(brand))) {
    return { mimeType: "application/mp4", width: null, height: null };
  }
  throw new MediaInspectionError("unsupported_iso_media");
}

function inspectAudio(bytes: Uint8Array): InspectedMedia | null {
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE") {
    return { mimeType: "audio/wav", width: null, height: null };
  }
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { mimeType: "audio/webm", width: null, height: null };
  }
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === "OggS") {
    return { mimeType: "audio/ogg", width: null, height: null };
  }
  if (
    (bytes.length >= 3 && ascii(bytes, 0, 3) === "ID3")
    || (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)
  ) {
    return { mimeType: "audio/mpeg", width: null, height: null };
  }
  return null;
}

function declaredMimeMatches(detected: string, declared: string): boolean {
  if (detected === declared) return true;
  if (detected === "application/mp4" && (declared === "audio/mp4" || declared === "video/mp4")) return true;
  return false;
}

export function inspectMedia(
  bytes: Uint8Array,
  expected: { mimeType: string; byteSize: number; width?: number | null; height?: number | null },
): InspectedMedia {
  if (bytes.byteLength < 4 || bytes.byteLength !== expected.byteSize) {
    throw new MediaInspectionError("byte_size_mismatch");
  }
  const detected = inspectPng(bytes)
    ?? inspectJpeg(bytes)
    ?? inspectWebp(bytes)
    ?? inspectIsoMedia(bytes)
    ?? inspectAudio(bytes);
  if (!detected) throw new MediaInspectionError("unknown_signature");
  if (!declaredMimeMatches(detected.mimeType, expected.mimeType.toLocaleLowerCase("en-US"))) {
    throw new MediaInspectionError("mime_signature_mismatch");
  }

  if (detected.width !== null && detected.height !== null) {
    if (
      (expected.width != null && detected.width !== expected.width)
      || (expected.height != null && detected.height !== expected.height)
    ) {
      throw new MediaInspectionError("dimension_mismatch");
    }
  }
  return detected;
}
