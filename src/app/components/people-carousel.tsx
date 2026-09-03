import useEmblaCarousel from "embla-carousel-react";
import { MapPin } from "lucide-react";
import { Avatar } from "@/components/base/avatar/avatar";
import type { SocialProfile } from "@/domains/social";
import { useAppUi } from "../ui-state-context";

function profileInitials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("pt-BR") ?? "")
    .join("");
}

export function PeopleCarousel({ profiles }: { profiles: SocialProfile[] }) {
  const [emblaRef] = useEmblaCarousel({ align: "start", dragFree: true });
  const { openDrawer } = useAppUi();

  if (!profiles.length) {
    return <p className="prototype-empty">Nenhuma pessoa disponível para descoberta agora.</p>;
  }

  return (
    <div className="people-viewport" ref={emblaRef}>
      <div className="people-track">
        {profiles.map((profile) => (
          <button type="button" className="person-card" key={profile.id} onClick={() => openDrawer({ type: "person", personName: profile.fullName, profileId: profile.id })}>
            <div className="person-avatar-halo">
              <Avatar size="xl" initials={profileInitials(profile.fullName)} contentClassName="avatar-transparent" />
            </div>
            <strong>{profile.fullName}</strong>
            {profile.city || profile.stateCode ? (
              <span className="person-location"><MapPin size={12} aria-hidden /> {[profile.city, profile.stateCode].filter(Boolean).join(", ")}</span>
            ) : null}
            {profile.interests[0] ? <span className="affinity-chip">{profile.interests[0]}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
