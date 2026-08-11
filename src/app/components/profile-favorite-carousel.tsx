import useEmblaCarousel from "embla-carousel-react";
import { Plus, type LucideIcon } from "lucide-react";
import type { FavoriteCategory } from "../prototype-context";

type ProfileFavoriteCarouselProps = {
  category: FavoriteCategory;
  label: string;
  singularLabel: string;
  tone: "violet" | "coral" | "green" | "blue" | "amber" | "rose";
  icon: LucideIcon;
  items: readonly string[];
  onEdit: (category: FavoriteCategory) => void;
};

export function ProfileFavoriteCarousel({
  category,
  label,
  singularLabel,
  tone,
  icon: Icon,
  items,
  onEdit,
}: ProfileFavoriteCarouselProps) {
  const [emblaRef] = useEmblaCarousel({
    align: "start",
    containScroll: "trimSnaps",
    dragFree: true,
  });

  return (
    <section className="profile-favorite-section" aria-labelledby={`favorite-${category}`}>
      <header className="profile-favorite-heading">
        <div>
          <span className={`profile-favorite-icon ${tone}`}><Icon size={16} aria-hidden /></span>
          <h3 id={`favorite-${category}`}>{label}</h3>
          <small>{items.length} de 5</small>
        </div>
        <button type="button" className="text-button" onClick={() => onEdit(category)}>Editar</button>
      </header>

      <div className="profile-favorites-viewport" ref={emblaRef}>
        <div className="profile-favorites-track">
          {items.length ? items.map((item) => (
            <button
              type="button"
              className={`profile-favorite-card ${tone}`}
              key={item}
              onClick={() => onEdit(category)}
              aria-label={`Editar ${item} em ${label}`}
            >
              <span className="profile-favorite-card-icon"><Icon size={22} aria-hidden /></span>
              <strong>{item}</strong>
              <small>{singularLabel} favorito</small>
            </button>
          )) : (
            <button
              type="button"
              className={`profile-favorite-card profile-favorite-empty ${tone}`}
              onClick={() => onEdit(category)}
            >
              <span className="profile-favorite-card-icon"><Plus size={22} aria-hidden /></span>
              <strong>Adicionar {label.toLocaleLowerCase("pt-BR")}</strong>
              <small>Escolha até cinco</small>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
