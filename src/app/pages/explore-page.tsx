import { Clapperboard, Gamepad2, PawPrint, ShoppingBag, Smile, UsersRound } from "lucide-react";
import { NativeHeader } from "../components/native-header";
import { usePrototype } from "../prototype-context";

const destinations = [
  { name: "Cinema", detail: "Filmes e estreias", icon: Clapperboard, className: "coral" },
  { name: "Pessoas", detail: "Novas conexões", icon: UsersRound, className: "violet" },
  { name: "Pet", detail: "O mundo animal", icon: PawPrint, className: "green" },
  { name: "Loja", detail: "Produtos e ideias", icon: ShoppingBag, className: "amber" },
  { name: "Avatar", detail: "Crie seu estilo", icon: Smile, className: "blue" },
  { name: "Jogos", detail: "Jogue junto", icon: Gamepad2, className: "pink" },
];

export function ExplorePage() {
  const { openDrawer } = usePrototype();
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

        <section className="content-section">
          <div className="section-heading"><div><span className="section-overline">DESTINOS</span><h2>O que você quer encontrar?</h2></div></div>
          <div className="destination-grid">
            {destinations.map(({ name, detail, icon: Icon, className }) => (
              <button type="button" className={`destination-card ${className}`} key={name} onClick={() => openDrawer({ type: "explore", destination: name })}>
                <Icon size={25} />
                <span><strong>{name}</strong><small>{detail}</small></span>
              </button>
            ))}
          </div>
        </section>

        <section className="discovery-note">
          <span>EM BREVE</span>
          <strong>Novas experiências chegam aqui primeiro.</strong>
          <p>Explorar crescerá como o catálogo vivo da ORHA.</p>
        </section>
      </main>
    </div>
  );
}
