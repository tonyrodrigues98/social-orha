import { useRef } from "react";
import { BookOpen, Camera, ChevronRight, Film, Gamepad2, LogOut, Music2, Pencil, Settings2 } from "lucide-react";
import { Avatar } from "@/components/base/avatar/avatar";
import { roleLabels } from "@/domain/identity";
import { signOut } from "@/infrastructure/supabase/email-auth";
import { useAuth } from "../auth/auth-context";
import { NativeHeader } from "../components/native-header";
import { usePrototype } from "../prototype-context";

const favoriteCategories = ["movies", "songs", "books", "games"] as const;

export function ProfilePage() {
  const { identity } = useAuth();
  const {
    profile,
    favorites,
    galleryImages,
    setCoverImage,
    addGalleryImages,
    openDrawer,
  } = usePrototype();
  const coverFileInput = useRef<HTMLInputElement>(null);
  const galleryFileInput = useRef<HTMLInputElement>(null);

  if (!identity) return null;

  const initials = profile.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "OR";
  const profileCollections = [
    { label: "Filmes", icon: Film, tone: "violet" },
    { label: "Músicas", icon: Music2, tone: "coral" },
    { label: "Livros", icon: BookOpen, tone: "green" },
    { label: "Jogos", icon: Gamepad2, tone: "blue" },
  ];

  return (
    <div className="page profile-page">
      <NativeHeader title="Perfil" subtitle="Seu espaço, do seu jeito" />
      <main className="page-content">
        <section
          className={`profile-cover ${profile.coverImage ? "has-cover-image" : ""}`}
          style={profile.coverImage ? {
            backgroundImage: `linear-gradient(140deg, rgb(217 214 239 / 0.68), rgb(231 207 214 / 0.54)), url(${profile.coverImage})`,
          } : undefined}
        >
          <button type="button" className="cover-edit" aria-label="Editar capa" onClick={() => coverFileInput.current?.click()}>
            <Camera size={17} />
          </button>
          <input
            ref={coverFileInput}
            className="prototype-file-input"
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) setCoverImage(file);
              event.target.value = "";
            }}
          />
          <div className="profile-identity">
            <Avatar size="2xl" initials={initials} contentClassName="profile-main-avatar" border />
            <div>
              <h2>{profile.fullName}</h2>
              <span>@{profile.username} · {roleLabels[identity.role]}</span>
              <p>{profile.bio}</p>
            </div>
          </div>
          <button type="button" className="edit-profile-button" onClick={() => openDrawer({ type: "edit-profile" })}>
            <Pencil size={15} /> Editar perfil
          </button>
        </section>

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
            <button type="button" className="text-button" onClick={() => openDrawer({ type: "privacy" })}><Settings2 size={16} /> Privacidade</button>
          </div>
          <div className="collection-grid">
            {profileCollections.map(({ label, icon: Icon, tone }, index) => {
              const category = favoriteCategories[index];
              return (
                <button type="button" className={`collection-card ${tone}`} key={label} onClick={() => openDrawer({ type: "favorites", category })}>
                  <Icon size={21} /><span><strong>{label}</strong><small>{favorites[category].length} de 5</small></span><ChevronRight size={16} />
                </button>
              );
            })}
          </div>
        </section>

        <section className="content-section">
          <div className="section-heading">
            <div><span className="section-overline">GALERIA</span><h2>Momentos que contam sua história</h2></div>
            <button type="button" className="text-button" onClick={() => openDrawer({ type: "gallery" })}>Gerenciar</button>
          </div>
          <div className="gallery-grid">
            <button type="button" className="gallery-add" onClick={() => galleryFileInput.current?.click()}><Camera size={23} /><span>Adicionar</span></button>
            <input
              ref={galleryFileInput}
              className="prototype-file-input"
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => {
                addGalleryImages(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
            {galleryImages.slice(0, 2).map((image) => <img className="gallery-image" key={image} src={image} alt="Foto da sua galeria" />)}
            {galleryImages.length < 1 ? <div className="gallery-placeholder one" /> : null}
            {galleryImages.length < 2 ? <div className="gallery-placeholder two" /> : null}
          </div>
        </section>
        <button type="button" className="profile-signout" onClick={() => void signOut()}><LogOut size={17} /> Sair da conta</button>
      </main>
    </div>
  );
}
