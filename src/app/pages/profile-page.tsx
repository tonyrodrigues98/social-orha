import { useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  BookOpen,
  Camera,
  Film,
  Gamepad2,
  LogOut,
  MicVocal,
  Music2,
  Pencil,
  Settings2,
  Sparkles,
  Trash2,
  Tv,
} from "lucide-react";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import { Drawer } from "@/components/godui/drawer";
import { roleLabels } from "@/domain/identity";
import {
  favoriteCollectionsFromDetails,
  type FavoriteCategory,
} from "@/domain/profile-data";
import type { PixelCrop, ProfileMediaWithUrl } from "@/domain/profile-media";
import { processProfileImage } from "@/infrastructure/media/profile-image-processor";
import { signOut } from "@/infrastructure/supabase/email-auth";
import { useAuth } from "../auth/auth-context";
import { NativeHeader } from "../components/native-header";
import { ProfileFavoriteCarousel } from "../components/profile-favorite-carousel";
import {
  useOwnIdentityQuery,
  useOwnProfileMediaQuery,
  useRemoveProfileMediaMutation,
  useUploadProfileMediaMutation,
} from "../profile/profile-queries";
import { ProfileImageCropDrawer } from "../profile/profile-image-crop-drawer";
import {
  ProfileSettingsDrawer,
  type ProfileSettingsPanel,
} from "../profile/profile-settings-drawer";
import { useAppUi } from "../ui-state-context";
import {
  MAX_PROFILE_GALLERY_IMAGES,
  PROFILE_IMAGE_ACCEPT,
  loadLocalImageDimensions,
  validateProfileMediaSelection,
} from "./profile-media";

const favoriteSections: ReadonlyArray<{
  category: FavoriteCategory;
  label: string;
  singularLabel: string;
  tone: "violet" | "coral" | "green" | "blue" | "amber" | "rose";
  icon: typeof Film;
}> = [
  { category: "movies", label: "Filmes", singularLabel: "Filme", tone: "violet", icon: Film },
  { category: "series", label: "Séries", singularLabel: "Série", tone: "blue", icon: Tv },
  { category: "songs", label: "Músicas", singularLabel: "Música", tone: "coral", icon: Music2 },
  { category: "artists", label: "Artistas", singularLabel: "Artista", tone: "rose", icon: MicVocal },
  { category: "books", label: "Livros", singularLabel: "Livro", tone: "green", icon: BookOpen },
  { category: "games", label: "Jogos", singularLabel: "Jogo", tone: "amber", icon: Gamepad2 },
];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function ProfileDetailGroup({ label, items }: { label: string; items: readonly string[] }) {
  if (!items.length) return null;
  return (
    <div className="grid gap-2">
      <h3 className="m-0 text-sm font-semibold text-primary">{label}</h3>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item}
            className="rounded-full bg-secondary px-3 py-2 text-sm text-secondary"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ProfilePage() {
  const { identity } = useAuth();
  const { announce } = useAppUi();
  const profileId = identity?.profile.id ?? "";
  const identityQuery = useOwnIdentityQuery(profileId, identity ?? undefined);
  const mediaQuery = useOwnProfileMediaQuery(profileId);
  const uploadMedia = useUploadProfileMediaMutation(profileId);
  const removeMedia = useRemoveProfileMediaMutation(profileId);
  const currentIdentity = identityQuery.data ?? identity;
  const media = useMemo(() => mediaQuery.data ?? [], [mediaQuery.data]);
  const coverMedia = media.find((item) => item.purpose === "cover") ?? null;
  const avatarMedia = media.find((item) => item.purpose === "avatar") ?? null;
  const galleryMedia = useMemo(
    () => media
      .filter((item) => item.purpose === "gallery")
      .sort((a, b) => a.sort_order - b.sort_order),
    [media],
  );
  const coverFileInput = useRef<HTMLInputElement>(null);
  const galleryFileInput = useRef<HTMLInputElement>(null);
  const [pendingCoverFile, setPendingCoverFile] = useState<File | null>(null);
  const [coverProcessing, setCoverProcessing] = useState(false);
  const [galleryProcessing, setGalleryProcessing] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [failedCoverUrl, setFailedCoverUrl] = useState<string | null>(null);
  const [failedGalleryUrls, setFailedGalleryUrls] = useState<ReadonlySet<string>>(() => new Set());
  const [lightboxMediaId, setLightboxMediaId] = useState<string | null>(null);
  const [managingGallery, setManagingGallery] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState<ProfileSettingsPanel | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{
    item: ProfileMediaWithUrl;
    position: number;
  } | null>(null);

  const gallerySlides = useMemo(
    () => galleryMedia
      .flatMap((item, index) => {
        const readUrl = item.readUrl;
        if (!readUrl || failedGalleryUrls.has(readUrl)) return [];
        return [{
          src: readUrl,
          alt: `Foto ${index + 1} da galeria de ${currentIdentity?.profile.full_name ?? "perfil"}`,
          width: item.width,
          height: item.height,
          mediaId: item.id,
        }];
      }),
    [currentIdentity?.profile.full_name, failedGalleryUrls, galleryMedia],
  );

  const lightboxIndex = lightboxMediaId === null
    ? -1
    : gallerySlides.findIndex((slide) => slide.mediaId === lightboxMediaId);
  const coverBusy = coverProcessing || (uploadMedia.isPending && pendingCoverFile !== null);
  const galleryBusy = galleryProcessing || (uploadMedia.isPending && pendingCoverFile === null);

  async function handleCoverSelection(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!files.length) return;

    const validation = validateProfileMediaSelection(files, 1);
    if (!validation.ok) {
      setCoverError(validation.message);
      announce(validation.message);
      return;
    }

    setCoverProcessing(true);
    setCoverError(null);
    try {
      await loadLocalImageDimensions(validation.files[0]);
      setPendingCoverFile(validation.files[0]);
    } catch (error) {
      const message = errorMessage(error, "A imagem de capa não pôde ser lida.");
      setCoverError(message);
      announce(message);
    } finally {
      setCoverProcessing(false);
    }
  }

  async function uploadCover(crop: PixelCrop) {
    if (!pendingCoverFile) return;
    setCoverProcessing(true);
    setCoverError(null);
    try {
      const image = await processProfileImage(pendingCoverFile, { purpose: "cover", crop });
      await uploadMedia.mutateAsync({ purpose: "cover", image });
      setFailedCoverUrl(null);
      setPendingCoverFile(null);
      announce("Imagem de capa salva.");
    } catch (error) {
      const message = errorMessage(error, "Não foi possível salvar a imagem de capa.");
      setCoverError(message);
      announce(message);
    } finally {
      setCoverProcessing(false);
    }
  }

  async function handleGallerySelection(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!files.length) return;

    const availableSlots = Math.max(0, MAX_PROFILE_GALLERY_IMAGES - galleryMedia.length);
    const validation = validateProfileMediaSelection(files, availableSlots);
    if (!validation.ok) {
      setGalleryError(validation.message);
      announce(validation.message);
      return;
    }

    setGalleryProcessing(true);
    setGalleryError(null);
    let uploadedCount = 0;
    try {
      for (const file of validation.files) {
        const image = await processProfileImage(file, { purpose: "gallery" });
        await uploadMedia.mutateAsync({ purpose: "gallery", image });
        uploadedCount += 1;
      }
      announce(uploadedCount === 1 ? "Foto adicionada à galeria." : `${uploadedCount} fotos adicionadas à galeria.`);
    } catch (error) {
      const fallback = uploadedCount
        ? `${uploadedCount} foto(s) foram salvas, mas não foi possível concluir o restante.`
        : "Não foi possível enviar as fotos da galeria.";
      const message = errorMessage(error, fallback);
      setGalleryError(message);
      announce(message);
    } finally {
      setGalleryProcessing(false);
    }
  }

  async function removeGalleryImage(item: ProfileMediaWithUrl) {
    setGalleryError(null);
    try {
      await removeMedia.mutateAsync(item);
      setFailedGalleryUrls((current) => {
        const next = new Set(current);
        if (item.readUrl) next.delete(item.readUrl);
        return next;
      });
      if (lightboxMediaId === item.id) setLightboxMediaId(null);
      setPendingRemoval(null);
      announce("Foto removida da galeria.");
    } catch (error) {
      const message = errorMessage(error, "Não foi possível remover esta foto.");
      setGalleryError(message);
      announce(message);
    }
  }

  function reportGalleryImageFailure(item: ProfileMediaWithUrl, position: number) {
    const readUrl = item.readUrl;
    if (!readUrl || failedGalleryUrls.has(readUrl)) return;
    const message = `A foto ${position + 1} não pôde ser carregada.`;
    setFailedGalleryUrls((current) => new Set(current).add(readUrl));
    setGalleryError(message);
    announce(message);
  }

  if (!currentIdentity) return null;

  const profile = currentIdentity.profile;
  const details = currentIdentity.details;
  const favorites = favoriteCollectionsFromDetails(currentIdentity.details);
  const identityTraits = [
    ...details.personality,
    details.favorite_season ? `Estação: ${details.favorite_season}` : null,
    details.social_energy ? `Energia: ${details.social_energy}` : null,
  ].filter((item): item is string => Boolean(item));
  const hasProfileDetails = [
    identityTraits,
    details.weekend_preferences,
    details.interests,
    details.hobbies,
    details.visited_places,
    details.desired_places,
  ].some((items) => items.length > 0);
  const completionSignals = [
    profile.full_name,
    profile.username,
    profile.birth_date,
    profile.state_code,
    profile.city,
    profile.bio,
    details.personality.length > 0,
    Boolean(details.favorite_season),
    Boolean(details.social_energy),
    details.weekend_preferences.length > 0,
    details.interests.length > 0,
    details.hobbies.length > 0,
    details.visited_places.length > 0 || details.desired_places.length > 0,
    Object.values(favorites).some((items) => items.length > 0),
    Boolean(avatarMedia),
    Boolean(coverMedia),
    galleryMedia.length > 0,
  ];
  const completionPercentage = Math.round(
    (completionSignals.filter(Boolean).length / completionSignals.length) * 100,
  );
  const displayName = profile.full_name?.trim() || "Seu perfil";
  const username = profile.username?.trim() || "usuario";
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "OR";
  const galleryIsFull = galleryMedia.length >= MAX_PROFILE_GALLERY_IMAGES;
  const coverReadUrl = coverMedia?.readUrl ?? null;
  const coverLoadFailed = coverMedia !== null
    && (!coverReadUrl || failedCoverUrl === coverReadUrl);
  const coverDisplayError = coverError
    ?? (coverMedia && !coverMedia.readUrl ? "A imagem de capa está temporariamente indisponível." : null);
  const profileQueryError = identityQuery.isError
    ? "Não foi possível atualizar os dados do perfil. A última versão carregada continua visível."
    : null;
  const mediaQueryError = mediaQuery.isError
    ? "Não foi possível carregar suas imagens agora. Tente novamente."
    : null;

  return (
    <div className="page profile-page">
      <NativeHeader title="Perfil" subtitle="Seu espaço, do seu jeito" />
      <main className="page-content">
        {profileQueryError ? (
          <div className="auth-error" role="alert">
            <span>{profileQueryError}</span>
            <button type="button" className="text-button" onClick={() => void identityQuery.refetch()}>
              Tentar novamente
            </button>
          </div>
        ) : null}
        <section className={`profile-cover ${coverReadUrl && !coverLoadFailed ? "has-cover-image" : ""}`}>
          {coverMedia && coverReadUrl && !coverLoadFailed ? (
            <>
              <img
                src={coverReadUrl}
                alt=""
                aria-hidden="true"
                width={coverMedia.width}
                height={coverMedia.height}
                decoding="async"
                onError={() => {
                  const message = "A imagem de capa não pôde ser carregada.";
                  setFailedCoverUrl(coverReadUrl);
                  setCoverError(message);
                  announce(message);
                }}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(140deg, rgb(217 214 239 / 0.68), rgb(231 207 214 / 0.54))",
                }}
              />
            </>
          ) : null}
          <button
            type="button"
            className="cover-edit"
            aria-label={coverMedia ? "Escolher nova imagem de capa" : "Adicionar imagem de capa"}
            aria-busy={coverBusy || undefined}
            disabled={coverBusy}
            onClick={() => coverFileInput.current?.click()}
            style={{ minWidth: 44, minHeight: 44, zIndex: 2 }}
          >
            <Camera size={17} aria-hidden="true" />
          </button>
          <input
            ref={coverFileInput}
            className="prototype-file-input"
            type="file"
            accept={PROFILE_IMAGE_ACCEPT}
            aria-label="Selecionar imagem de capa"
            onChange={(event) => void handleCoverSelection(event)}
          />
          <div className="profile-identity" style={{ position: "relative", zIndex: 1 }}>
            <Avatar
              key={avatarMedia?.readUrl ?? initials}
              size="2xl"
              src={avatarMedia?.readUrl ?? undefined}
              alt={avatarMedia?.readUrl ? `Foto de perfil de ${displayName}` : undefined}
              initials={initials}
              contentClassName="profile-main-avatar"
              border
            />
            <div>
              <h2>{displayName}</h2>
              <span>@{username} · {roleLabels[currentIdentity.role]}</span>
              <p>{profile.bio || "Conte um pouco sobre você."}</p>
            </div>
          </div>
          <button
            type="button"
            className="edit-profile-button"
            aria-label="Editar dados do perfil"
            onClick={() => setSettingsPanel({ type: "edit-profile" })}
            style={{ position: "relative", minHeight: 44, zIndex: 1 }}
          >
            <Pencil size={15} aria-hidden="true" /> Editar perfil
          </button>
        </section>
        {coverDisplayError ? (
          <div className="auth-error" role="alert">
            <span>{coverDisplayError}</span>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setCoverError(null);
                void mediaQuery.refetch();
              }}
            >
              Tentar novamente
            </button>
          </div>
        ) : null}

        <section className="profile-completion">
          <div className="completion-header">
            <span><strong>Seu perfil está ativo</strong><small>Você pode personalizá-lo quando quiser</small></span>
            <b>{completionPercentage}%</b>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="Conclusão do perfil"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={completionPercentage}
          >
            <span style={{ width: `${completionPercentage}%` }} />
          </div>
        </section>

        <section className="content-section" aria-labelledby="profile-details-title">
          <div className="section-heading">
            <div>
              <span className="section-overline">SOBRE VOCÊ</span>
              <h2 id="profile-details-title">O que torna seu perfil único</h2>
            </div>
            <button
              type="button"
              className="text-button"
              aria-label="Editar personalidade, interesses, hobbies e lugares"
              onClick={() => setSettingsPanel({ type: "details" })}
              style={{ minHeight: 44 }}
            >
              <Sparkles size={16} aria-hidden="true" /> Editar
            </button>
          </div>
          {hasProfileDetails ? (
            <div className="grid gap-4 rounded-3xl border border-secondary bg-primary p-4">
              <ProfileDetailGroup label="Seu jeito" items={identityTraits} />
              <ProfileDetailGroup label="Interesses" items={details.interests} />
              <ProfileDetailGroup label="Hobbies" items={details.hobbies} />
              <ProfileDetailGroup label="Fim de semana" items={details.weekend_preferences} />
              <ProfileDetailGroup label="Lugares que já conheceu" items={details.visited_places} />
              <ProfileDetailGroup label="Lugares que deseja conhecer" items={details.desired_places} />
            </div>
          ) : (
            <button
              type="button"
              className="grid min-h-24 w-full place-items-center rounded-3xl border border-dashed border-secondary bg-primary px-5 text-center text-sm text-tertiary"
              onClick={() => setSettingsPanel({ type: "details" })}
            >
              Adicione interesses, hobbies e lugares para encontrar pessoas com mais afinidade.
            </button>
          )}
        </section>

        <section className="content-section">
          <div className="section-heading">
            <div><span className="section-overline">SEUS FAVORITOS</span><h2>O que faz parte de você</h2></div>
            <button
              type="button"
              className="text-button"
              aria-label="Configurar privacidade do perfil"
              onClick={() => setSettingsPanel({ type: "privacy" })}
              style={{ minHeight: 44 }}
            >
              <Settings2 size={16} aria-hidden="true" /> Privacidade
            </button>
          </div>
          <div className="profile-favorite-sections">
            {favoriteSections.map((section) => (
              <ProfileFavoriteCarousel
                key={section.category}
                {...section}
                items={favorites[section.category].map((item) => item.label)}
                onEdit={(category) => setSettingsPanel({ type: "favorites", category })}
              />
            ))}
          </div>
        </section>

        <section className="content-section" aria-labelledby="profile-gallery-title">
          <div className="section-heading">
            <div>
              <span className="section-overline">GALERIA</span>
              <h2 id="profile-gallery-title">Momentos que contam sua história</h2>
            </div>
            <button
              type="button"
              className="text-button"
              aria-label={managingGallery ? "Concluir gerenciamento da galeria" : "Gerenciar fotos da galeria"}
              aria-pressed={managingGallery}
              onClick={() => setManagingGallery((current) => !current)}
              style={{ minHeight: 44 }}
            >
              {managingGallery ? "Concluir" : "Gerenciar"}
            </button>
          </div>
          {mediaQueryError ? (
            <div className="auth-error" role="alert">
              <span>{mediaQueryError}</span>
              <button type="button" className="text-button" onClick={() => void mediaQuery.refetch()}>
                Tentar novamente
              </button>
            </div>
          ) : null}
          {galleryError ? <p className="auth-error" role="alert">{galleryError}</p> : null}
          <div className="gallery-grid" aria-busy={galleryBusy || mediaQuery.isLoading || undefined}>
            <button
              type="button"
              className="gallery-add"
              aria-label={galleryIsFull ? "Galeria completa" : "Adicionar fotos à galeria"}
              aria-busy={galleryBusy || undefined}
              disabled={galleryBusy || galleryIsFull}
              onClick={() => galleryFileInput.current?.click()}
            >
              <Camera size={23} aria-hidden="true" />
              <span>{galleryBusy ? "Enviando…" : galleryIsFull ? "Galeria completa" : "Adicionar"}</span>
            </button>
            <input
              ref={galleryFileInput}
              className="prototype-file-input"
              type="file"
              accept={PROFILE_IMAGE_ACCEPT}
              aria-label="Selecionar fotos para a galeria"
              multiple
              onChange={(event) => void handleGallerySelection(event)}
            />
            {galleryMedia.map((item, index) => {
              const readUrl = item.readUrl;
              if (!readUrl || failedGalleryUrls.has(readUrl)) {
                return (
                  <div
                    key={item.id}
                    role="img"
                    aria-label={`Foto ${index + 1} indisponível`}
                    style={{ display: "grid", placeItems: "center", padding: 12, background: "var(--orha-card)", color: "var(--orha-subtle)", textAlign: "center" }}
                  >
                    <span>Imagem indisponível</span>
                    <button
                      type="button"
                      className="text-button"
                      aria-label={`Tentar carregar novamente a foto ${index + 1}`}
                      onClick={() => void mediaQuery.refetch()}
                      style={{ minHeight: 44 }}
                    >
                      Tentar novamente
                    </button>
                    {managingGallery ? (
                      <button
                        type="button"
                        aria-label={`Remover foto ${index + 1} da galeria`}
                        disabled={removeMedia.isPending}
                        onClick={() => setPendingRemoval({ item, position: index })}
                        style={{ minWidth: 44, minHeight: 44 }}
                      >
                        <Trash2 size={18} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                );
              }

              return (
                <div
                  key={item.id}
                  style={{ position: "relative", overflow: "hidden", background: "var(--orha-card)", aspectRatio: "1 / 1" }}
                >
                  <button
                    type="button"
                    aria-label={`Abrir foto ${index + 1} de ${galleryMedia.length}`}
                    onClick={() => setLightboxMediaId(item.id)}
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", padding: 0, border: 0, background: "transparent" }}
                  >
                    <img
                      className="gallery-image"
                      src={readUrl}
                      alt=""
                      width={item.width}
                      height={item.height}
                      loading="lazy"
                      decoding="async"
                      onError={() => reportGalleryImageFailure(item, index)}
                      style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </button>
                  {managingGallery ? (
                    <button
                      type="button"
                      aria-label={`Remover foto ${index + 1} da galeria`}
                      disabled={removeMedia.isPending}
                      onClick={() => setPendingRemoval({ item, position: index })}
                      style={{
                        position: "absolute",
                        top: 6,
                        right: 6,
                        display: "grid",
                        placeItems: "center",
                        width: 44,
                        height: 44,
                        border: "1px solid rgb(255 255 255 / 0.45)",
                        borderRadius: 999,
                        background: "rgb(20 20 22 / 0.88)",
                        color: "white",
                      }}
                    >
                      <Trash2 size={18} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          {mediaQuery.isLoading ? (
            <p className="prototype-empty" role="status">Carregando sua galeria…</p>
          ) : galleryMedia.length === 0 ? (
            <p className="prototype-empty">Sua galeria ainda não tem fotos.</p>
          ) : null}
        </section>
        <button type="button" className="profile-signout" onClick={() => void signOut()}>
          <LogOut size={17} aria-hidden="true" /> Sair da conta
        </button>
      </main>

      {pendingCoverFile ? (
        <ProfileImageCropDrawer
          file={pendingCoverFile}
          busy={coverBusy}
          onCancel={() => setPendingCoverFile(null)}
          onConfirm={(crop) => void uploadCover(crop)}
        />
      ) : null}

      <ProfileSettingsDrawer
        panel={settingsPanel}
        identity={currentIdentity}
        announce={announce}
        onClose={() => setSettingsPanel(null)}
      />

      <Drawer
        open={pendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open && !removeMedia.isPending) setPendingRemoval(null);
        }}
        title="Remover foto"
      >
        <div className="grid gap-4 pb-[env(safe-area-inset-bottom)]">
          <p className="m-0 text-sm text-secondary">
            {pendingRemoval
              ? `A foto ${pendingRemoval.position + 1} será removida da sua galeria.`
              : "A foto será removida da sua galeria."}
          </p>
          {galleryError ? <p className="auth-error" role="alert">{galleryError}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              color="secondary"
              size="lg"
              isDisabled={removeMedia.isPending}
              onPress={() => setPendingRemoval(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              color="primary-destructive"
              size="lg"
              isLoading={removeMedia.isPending}
              showTextWhileLoading
              onPress={() => {
                if (pendingRemoval) void removeGalleryImage(pendingRemoval.item);
              }}
            >
              {removeMedia.isPending ? "Removendo…" : "Remover foto"}
            </Button>
          </div>
        </div>
      </Drawer>

      <Lightbox
        open={lightboxIndex >= 0 && gallerySlides.length > 0}
        close={() => setLightboxMediaId(null)}
        index={Math.max(0, lightboxIndex)}
        slides={gallerySlides}
        on={{ view: ({ index }) => setLightboxMediaId(gallerySlides[index]?.mediaId ?? null) }}
        labels={{
          Previous: "Foto anterior",
          Next: "Próxima foto",
          Close: "Fechar galeria",
          Slide: "Foto",
          Carousel: "Galeria",
          Lightbox: "Visualizador de fotos do perfil",
          "Photo gallery": "Galeria de fotos do perfil",
          "{index} of {total}": "Foto {index} de {total}",
        }}
        carousel={{ finite: gallerySlides.length <= 1, imageFit: "contain" }}
        controller={{ closeOnBackdropClick: true, closeOnPullDown: true }}
        styles={{ root: { zIndex: 1200 } }}
      />
    </div>
  );
}
