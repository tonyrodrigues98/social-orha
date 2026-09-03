export type ProfileMediaPurpose = "avatar" | "cover" | "gallery";
export type ProfileMediaStatus = "pending" | "ready" | "deleting" | "failed";

export type ProfileMedia = {
  id: string;
  profile_id: string;
  purpose: ProfileMediaPurpose;
  bucket_id: string;
  object_path: string;
  mime_type: string;
  byte_size: number;
  width: number;
  height: number;
  sort_order: number;
  status: ProfileMediaStatus;
  created_at: string;
  updated_at: string;
};

export type ProfileMediaWithUrl = ProfileMedia & {
  readUrl: string | null;
};

export type ReserveProfileMediaInput = {
  purpose: ProfileMediaPurpose;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
};

export type ProcessedProfileImage = {
  file: File;
  width: number;
  height: number;
};

export type PixelCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const PROFILE_MEDIA_BUCKET = "profile-media";
export const PROFILE_MEDIA_SIGNED_URL_SECONDS = 60 * 60;
