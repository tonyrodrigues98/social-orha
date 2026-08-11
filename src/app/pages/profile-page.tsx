import { BookOpen, Camera, ChevronRight, Film, Gamepad2, LogOut, Music2, Pencil, Settings2 } from "lucide-react";
import { Avatar } from "@/components/base/avatar/avatar";
import { roleLabels } from "@/domain/identity";
import { signOut } from "@/infrastructure/supabase/email-auth";
import { useAuth } from "../auth/auth-context";
import { NativeHeader } from "../components/native-header";

export function ProfilePage() {
  const { identity } = useAuth();
  if (!identity) return null;

  const { profile, details, role } = identity;
  const initials = profile.full_name?.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() ?? "OR";
  const profileCollections = [
    { label: "Filmes", value: `${details.favorite_movies.length} de 5`, icon: Film, tone: "violet" },
    { label: "Músicas", value: `${details.favorite_songs.length} de 5`, icon: Music2, tone: "coral" },
    { label: "Livros", value: `${details.favorite_books.length} de 5`, icon: BookOpen, tone: "green" },
    { label: "Jogos", value: `${details.favorite_games.length} de 5`, icon: Gamepad2, tone: "blue" },
  ];

  return (
    <div className="page profile-page">
      <NativeHeader title="Perfil" subtitle="Seu espaço, do seu jeito" />
      <main className="page-content">
        <section className="profile-cover">
          <button type="button" className="cover-edit" aria-label="Editar capa"><Camera size={17} /></button>
          <div className="profile-identity">
            <Avatar size="2xl" initials={initials} contentClassName="profile-main-avatar" border />
            <div><h2>{profile.full_name}</h2><span>@{profile.username} · {roleLabels[role]}</span><p>{profile.bio}</p></div>
          </div>
          <button type="button" className="edit-profile-button"><Pencil size={15} /> Editar perfil</button>
        </section>

        <section className="profile-completion">
          <div className="completion-header"><span><strong>Seu perfil está ativo</strong><small>Você pode personalizá-lo quando quiser</small></span><b>100%</b></div>
          <div className="progress-track"><span style={{ width: "100%" }} /></div>
        </section>

        <section className="content-section">
          <div className="section-heading"><div><span className="section-overline">SEUS FAVORITOS</span><h2>O que faz parte de você</h2></div><button type="button" className="text-button"><Settings2 size={16} /> Privacidade</button></div>
          <div className="collection-grid">
            {profileCollections.map(({ label, value, icon: Icon, tone }) => (
              <button type="button" className={`collection-card ${tone}`} key={label}>
                <Icon size={21} /><span><strong>{label}</strong><small>{value}</small></span><ChevronRight size={16} />
              </button>
            ))}
          </div>
        </section>

        <section className="content-section">
          <div className="section-heading"><div><span className="section-overline">GALERIA</span><h2>Momentos que contam sua história</h2></div><button type="button" className="text-button">Gerenciar</button></div>
          <div className="gallery-grid">
            <button type="button" className="gallery-add"><Camera size={23} /><span>Adicionar</span></button>
            <div className="gallery-placeholder one" />
            <div className="gallery-placeholder two" />
          </div>
        </section>
        <button type="button" className="profile-signout" onClick={() => void signOut()}><LogOut size={17} /> Sair da conta</button>
      </main>
    </div>
  );
}
