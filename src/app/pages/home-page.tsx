import {
  ArrowRight,
  Check,
  ChevronRight,
  HeartHandshake,
  Sparkles,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/base/buttons/button";
import { communities } from "../prototype-data";
import { NativeHeader } from "../components/native-header";
import { PeopleCarousel } from "../components/people-carousel";
import { useAuth } from "../auth/auth-context";

const firstSteps = [
  {
    icon: Check,
    title: "Concluir seu perfil",
    detail: "Faltam 3 etapas",
    tone: "step-violet",
  },
  {
    icon: UsersRound,
    title: "Encontrar uma comunidade",
    detail: "Descubra seu lugar",
    tone: "step-green",
  },
  {
    icon: UserPlus,
    title: "Conhecer novas pessoas",
    detail: "Por gostos em comum",
    tone: "step-orange",
  },
];

export function HomePage() {
  const { identity } = useAuth();
  const firstName = identity?.profile.full_name?.split(/\s+/)[0] ?? "você";

  return (
    <div className="page home-page">
      <NativeHeader showBrand />

      <main className="page-content">
        <section className="welcome-copy">
          <span className="eyebrow">BOA NOITE, {firstName.toUpperCase()}</span>
          <h1>Seu lugar começa<br />com um encontro.</h1>
          <p>
            Complete seu perfil para descobrir pessoas e comunidades que combinam com você.
          </p>
        </section>

        <section className="onboarding-card" aria-label="Progresso do perfil">
          <div className="onboarding-copy">
            <span className="card-kicker"><Sparkles size={14} /> Seu começo na ORHA</span>
            <h2>Mostre quem você é</h2>
            <p>Personalize seu espaço e crie conexões mais verdadeiras.</p>
            <Button
              size="md"
              color="primary"
              iconTrailing={ArrowRight}
              className="home-cta"
            >
              Continuar perfil
            </Button>
          </div>
          <div className="profile-orbit" aria-hidden>
            <div className="orbit-ring" />
            <div className="orbit-core">RA</div>
            <HeartHandshake className="orbit-icon" size={22} />
          </div>
        </section>

        <section className="content-section">
          <div className="section-heading">
            <div>
              <span className="section-overline">PRIMEIROS PASSOS</span>
              <h2>Comece por aqui</h2>
            </div>
          </div>
          <div className="first-steps">
            {firstSteps.map(({ icon: Icon, title, detail, tone }) => (
              <button className="step-row" type="button" key={title}>
                <span className={`step-icon ${tone}`}><Icon size={19} /></span>
                <span className="step-copy"><strong>{title}</strong><small>{detail}</small></span>
                <ChevronRight size={18} aria-hidden />
              </button>
            ))}
          </div>
        </section>

        <section className="content-section edge-to-edge">
          <div className="section-heading section-heading-padded">
            <div>
              <span className="section-overline">ALGO EM COMUM</span>
              <h2>Pessoas que você pode gostar</h2>
            </div>
            <button type="button" className="text-button">Ver todas</button>
          </div>
          <PeopleCarousel />
        </section>

        <section className="content-section">
          <div className="section-heading">
            <div>
              <span className="section-overline">PERTENÇA</span>
              <h2>Comunidades para você</h2>
            </div>
            <button type="button" className="text-button">Explorar</button>
          </div>
          <div className="community-list">
            {communities.slice(0, 2).map((community) => (
              <button type="button" className="community-row" key={community.name}>
                <span className="community-monogram" style={{ background: community.accent }}>
                  {community.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="community-copy">
                  <strong>{community.name}</strong>
                  <small>{community.members}</small>
                </span>
                <ChevronRight size={18} aria-hidden />
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
