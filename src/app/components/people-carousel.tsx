import useEmblaCarousel from "embla-carousel-react";
import { MapPin } from "lucide-react";
import { Avatar } from "@/components/base/avatar/avatar";
import { people } from "../prototype-data";

export function PeopleCarousel() {
  const [emblaRef] = useEmblaCarousel({ align: "start", dragFree: true });

  return (
    <div className="people-viewport" ref={emblaRef}>
      <div className="people-track">
        {people.map((person) => (
          <article className="person-card" key={person.name}>
            <div
              className="person-avatar-halo"
              style={{ background: person.tone }}
            >
              <Avatar
                size="xl"
                initials={person.initials}
                contentClassName="avatar-transparent"
              />
            </div>
            <strong>{person.name}</strong>
            <span className="person-location">
              <MapPin size={12} aria-hidden /> {person.detail}
            </span>
            <span className="affinity-chip">{person.affinity}</span>
          </article>
        ))}
      </div>
    </div>
  );
}
