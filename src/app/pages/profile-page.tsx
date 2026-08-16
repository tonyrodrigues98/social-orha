import { useMemo, useRef, useState, type ChangeEvent, type SyntheticEvent } from "react";
import { BookOpen, Camera, Film, Gamepad2, LogOut, MicVocal, Music2, Pencil, Settings2, Tv } from "lucide-react";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { Avatar } from "@/components/base/avatar/avatar";
import { roleLabels } from "@/domain/identity";
import { signOut } from "@/infrastructure/supabase/email-auth";
import { useAuth } from "../auth/auth-context";
import { NativeHeader } from "../components/native-header";
import { ProfileFavoriteCarousel } from "../components/profile-favorite-carousel";
import { type FavoriteCategory, usePrototype } from "../prototype-context";
import {
  MAX_PROFILE_GALLERY_IMAGES,
  PROFILE_IMAGE_ACCEPT,
  loadLocalImageDimensions,
  validateProfileMediaSelection,
  type ImageDimensions,
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

export function ProfilePage() {
  const { identity } = useAuth();
  const {
    profile,
    favorites,
    galleryImages,
    setCoverImage,
    addGalleryImages,
    openDrawer,
    announce,
  } = usePrototype();
  const coverFileInput = useRef<HTMLInputElement>(null);
  const galleryFileInput = useRef<HTMLInputElement>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [galleryBusy, setGalleryBusy] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [failedCoverImage, setFailedCoverImage] = useState<string | null>(null);
  const [failedGalleryImages, setFailedGalleryImages] = useState<ReadonlySet<string>>(() => new Set());
  const [galleryDimensions, setGalleryDimensions] = useState<Record<string, ImageDimensions>>({});
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const gallerySlides = useMemo(
    () => galleryImages
      .filter((image) => !failedGalleryImages.has(image))
      .map((image) => {
        const originalIndex = galleryImages.indexOf(image);
        const dimensions = galleryDimensions[image] ?? { width: 1024, height: 1024 };
        return {
          src: image,
          alt: `Foto ${originalIndex + 1} da galeria de ${profile.fullName}`,
          ...dimensions,
        };
      }),
    [failedGalleryImages, galleryDimensions, galleryImages, profile.fullName],
  );

  const lightboxIndex = lightboxImage === null
    ? -1
    : gallerySlides.findIndex((slide) => slide.src === lightboxImage);

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

    setCoverBusy(true);
    setCoverError(null);
    try {
      await loadLocalImageDimensions(validation.files[0]);
      setCoverImage(validation.files[0]);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "A imagem de capa não pôde ser lida.";
      setCoverError(message);
      announce(message);
    } finally {
      setCoverBusy(false);
    }
  }

  async function handleGallerySelection(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!files.length) return;

    const availableSlots = Math.max(0, MAX_PROFILE_GALLERY_IMAGES - galleryImages.length);
    const validation = validateProfileMediaSelection(files, availableSlots);
    if (!validation.ok) {
      setGalleryError(validation.message);
      announce(validation.message);
      return;
    }

    setGalleryBusy(true);
    setGalleryError(null);
    try {
      await Promise.all(validation.files.map(loadLocalImageDimensions));
      addGalleryImages(validation.files);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Uma das imagens da galeria não pôde ser lida.";
      setGalleryError(message);
      announce(message);
    } finally {
      setGalleryBusy(false);
    }
  }

  function rememberGalleryDimensions(image: string, event: SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
    if (width <= 0 || height <= 0) return;
    setGalleryDimensions((current) => {
      const previous = current[image];
      if (previous?.width === width && previous.height === height) return current;
      return { ...current, [image]: { width, height } };
    });
  }

  function reportGalleryImageFailure(image: string, position: number) {
    if (failedGalleryImages.has(image)) return;
    const message = `A foto ${position + 1} não pôde ser carregada.`;
    setFailedGalleryImages((current) => new Set(current).add(image));
    setGalleryError(message);
    announce(message);
  }

  if (!identity) return null;

  const initials = profile.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "OR";
  const galleryIsFull = galleryImages.length >= MAX_PROFILE_GALLERY_IMAGES;
  const coverLoadFailed = profile.coverImage !== null && failedCoverImage === profile.coverImage;

  return (
    <div className="page profile-page">
      <NativeHeader title="Perfil" subtitle="Seu espaço, do seu jeito" />
      <main className="page-content">
        <section className={`profile-cover ${profile.coverImage && !coverLoadFailed ? "has-cover-image" : ""}`}>
          {profile.coverImage && !coverLoadFailed ? (
            <>
              <img
                src={profile.coverImage}
                alt=""
                aria-hidden="true"
                width={1280}
                height={720}
                decoding="async"
                onError={() => {
                  const message = "A imagem de capa não pôde ser carregada.";
                  setFailedCoverImage(profile.coverImage);
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
            aria-label={profile.coverImage ? "Escolher nova imagem de capa" : "Adicionar imagem de capa"}
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
            <Avatar size="2xl" initials={initials} contentClassName="profile-main-avatar" border />
            <div>
              <h2>{profile.fullName}</h2>
              <span>@{profile.username} · {roleLabels[identity.role]}</span>
              <p>{profile.bio}</p>
            </div>
          </div>
          <button
            type="button"
            className="edit-profile-button"
            aria-label="Editar dados do perfil"
            onClick={() => openDrawer({ type: "edit-profile" })}
            style={{ position: "relative", minHeight: 44, zIndex: 1 }}
          >
            <Pencil size={15} aria-hidden="true" /> Editar perfil
          </button>
        </section>
        {coverError ? <p className="auth-error" role="alert">{coverError}</p> : null}

        <section className="profile-completion">
          <div className="completion-header">
            <span><strong>Seu perfil está ativo</strong><small>Você pode personalizá-lo quando quiser</small></span>
            <b>100%</b>
          </div>
          <div className="progress-track"><span style={{ width: "100%" }} /></div>
        </section>

        <section className="content-section">
          <div className="section-heading">
            <div><span className="section-overline">SEUS FAVORITOS</span><h2>O que faz parte de você</h2></div>
            <button
              type="button"
              className="text-button"
              aria-label="Configurar privacidade do perfil"
              onClick={() => openDrawer({ type: "privacy" })}
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
                items={favorites[section.category]}
                onEdit={(category) => openDrawer({ type: "favorites", category })}
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
              aria-label="Gerenciar fotos da galeria"
              onClick={() => openDrawer({ type: "gallery" })}
              style={{ minHeight: 44 }}
            >
              Gerenciar
            </button>
          </div>
          {galleryError ? <p className="auth-error" role="alert">{galleryError}</p> : null}
          <div className="gallery-grid">
            <button
              type="button"
              className="gallery-add"
              aria-label={galleryIsFull ? "Galeria completa" : "Adicionar fotos à galeria"}
              aria-busy={galleryBusy || undefined}
              disabled={galleryBusy || galleryIsFull}
              onClick={() => galleryFileInput.current?.click()}
            >
              <Camera size={23} aria-hidden="true" />
              <span>{galleryBusy ? "Validando…" : galleryIsFull ? "Galeria completa" : "Adicionar"}</span>
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
            {galleryImages.map((image, index) => {
              const failed = failedGalleryImages.has(image);
              if (failed) {
                return (
                  <div
                    key={image}
                    role="img"
                    aria-label={`Foto ${index + 1} indisponível`}
                    style={{ display: "grid", placeItems: "center", padding: 12, background: "var(--orha-card)", color: "var(--orha-subtle)", textAlign: "center" }}
                  >
                    <span>Imagem indisponível</span>
                  </div>
                );
              }

              return (
                <button
                  key={image}
                  type="button"
                  aria-label={`Abrir foto ${index + 1} de ${galleryImages.length}`}
                  onClick={() => {
                    const slideIndex = gallerySlides.findIndex((slide) => slide.src === image);
                    if (slideIndex >= 0) setLightboxImage(image);
                  }}
                  style={{ position: "relative", overflow: "hidden", padding: 0, border: 0, background: "var(--orha-card)", aspectRatio: "1 / 1" }}
                >
                  <img
                    className="gallery-image"
                    src={image}
                    alt=""
                    width={320}
                    height={320}
                    loading="lazy"
                    decoding="async"
                    onLoad={(event) => rememberGalleryDimensions(image, event)}
                    onError={() => reportGalleryImageFailure(image, index)}
                    style={{ display: "block", height: "100%" }}
                  />
                </button>
              );
            })}
          </div>
          {galleryImages.length === 0 ? (
            <p className="prototype-empty">Sua galeria ainda não tem fotos.</p>
          ) : null}
        </section>
        <button type="button" className="profile-signout" onClick={() => void signOut()}>
          <LogOut size={17} aria-hidden="true" /> Sair da conta
        </button>
      </main>

      <Lightbox
        open={lightboxIndex >= 0 && gallerySlides.length > 0}
        close={() => setLightboxImage(null)}
        index={Math.max(0, lightboxIndex)}
        slides={gallerySlides}
        on={{ view: ({ index }) => setLightboxImage(gallerySlides[index]?.src ?? null) }}
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
