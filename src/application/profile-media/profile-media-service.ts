import type {
  ProcessedProfileImage,
  ProfileMedia,
  ProfileMediaPurpose,
  ProfileMediaWithUrl,
} from "@/domain/profile-media";
import type {
  ProfileBinaryStore,
  ProfileMediaRepository,
} from "@/infrastructure/supabase/profile-media-repository";

export class ProfileMediaService {
  constructor(
    private readonly repository: ProfileMediaRepository,
    private readonly storage: ProfileBinaryStore,
  ) {}

  async listOwn(profileId: string): Promise<ProfileMediaWithUrl[]> {
    const media = await this.repository.listOwn(profileId);
    const signedUrls = await Promise.allSettled(
      media.map((item) => this.storage.createReadUrl(item)),
    );
    return media.map((item, index) => {
      const signedUrl = signedUrls[index];
      return {
        ...item,
        readUrl: signedUrl?.status === "fulfilled" ? signedUrl.value : null,
      };
    });
  }

  async upload(
    purpose: ProfileMediaPurpose,
    image: ProcessedProfileImage,
  ): Promise<ProfileMedia> {
    const reservation = await this.repository.reserve({
      purpose,
      mimeType: image.file.type,
      byteSize: image.file.size,
      width: image.width,
      height: image.height,
    });

    try {
      await this.storage.upload(reservation, image.file);
    } catch (error) {
      await this.cleanReservation(reservation);
      throw error;
    }

    let finalized: ProfileMedia;
    try {
      finalized = await this.repository.finalize(reservation.id);
    } catch (error) {
      await this.cleanReservation(reservation);
      throw error;
    }

    return finalized;
  }

  async remove(media: ProfileMedia): Promise<void> {
    await this.repository.remove(media.id);
  }

  reorderGallery(mediaIds: readonly string[]): Promise<ProfileMedia[]> {
    return this.repository.reorderGallery(mediaIds);
  }

  private async cleanReservation(media: ProfileMedia): Promise<void> {
    // Metadata is moved to `deleting`; the trusted cleanup worker removes the
    // private object and only then completes the database cleanup.
    await this.repository.remove(media.id).catch(() => undefined);
  }
}
