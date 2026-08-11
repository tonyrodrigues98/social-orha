import useEmblaCarousel from "embla-carousel-react";
import { MapPin } from "lucide-react";
import { Avatar } from "@/components/base/avatar/avatar";
import { usePrototype } from "../prototype-context";

export function PeopleCarousel() {
  const [emblaRef] = useEmblaCarousel({ align: "start", dragFree: true });
  const { people, openDrawer } = usePrototype();

  return (
    <div className="people-viewport" ref={emblaRef}>
      <div className="people-track">
        {people.map((person) => (
          <button type="button" className="person-card" key={person.name} onClick={() => openDrawer({ type: "person", personName: person.name })}>
            <div className="person-avatar-halo" style={{ background: person.tone }}>
              <Avatar size="xl" initials={person.initials} contentClassName="avatar-transparent" />
            </div>
            <strong>{person.name}</strong>
            <span className="person-location"><MapPin size={12} aria-hidden /> {person.detail}</span>
            <span className="affinity-chip">{person.affinity}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
