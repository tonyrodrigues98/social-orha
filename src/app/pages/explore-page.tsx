import { Clapperboard, Gamepad2, PawPrint, ShoppingBag, Smile } from "lucide-react";
import { NativeHeader } from "../components/native-header";
import { ExploreDiscovery } from "../explore/explore-discovery";

const futureDestinations = [
  { name: "Cinema", detail: "Filmes e estreias", icon: Clapperboard, className: "coral" },
  { name: "Pet", detail: "O mundo animal", icon: PawPrint, className: "green" },
  { name: "Loja", detail: "Produtos e ideias", icon: ShoppingBag, className: "amber" },
  { name: "Avatar", detail: "Crie seu estilo", icon: Smile, className: "blue" },
  { name: "Jogos", detail: "Jogue junto", icon: Gamepad2, className: "pink" },
];

export function ExplorePage() {
  return (
    <div className="page">
      <NativeHeader title="Explorar" subtitle="Tudo que pode fazer parte do seu mundo" />
      <main className="page-content">
        <section className="explore-feature">
          <div>
            <span className="section-overline light">DESCOBRIR É SE APROXIMAR</span>
            <h2>Um universo<br />para chamar de seu.</h2>
          </div>
          <Clapperboard className="feature-art-icon" size={66} strokeWidth={1.1} />
        </section>

        <ExploreDiscovery />

        <section className="content-section" aria-labelledby="future-destinations-heading">
          <div className="section-heading">
            <div>
              <span className="section-overline">PRÓXIMOS DESTINOS</span>
              <h2 id="future-destinations-heading">O catálogo continuará crescendo</h2>
            </div>
          </div>
          <div className="destination-grid">
            {futureDestinations.map(({ name, detail, icon: Icon, className }) => (
              <article className={`destination-card ${className}`} key={name}>
                <Icon size={25} aria-hidden />
                <span>
                  <strong>{name}</strong>
                  <small>{detail} · Em planejamento</small>
                </span>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
