import { Bell, Search } from "lucide-react";
import { Avatar } from "@/components/base/avatar/avatar";
import { usePrototype } from "../prototype-context";
import { BrandMark } from "./brand-mark";

type NativeHeaderProps = {
  title?: string;
  subtitle?: string;
  showBrand?: boolean;
};

export function NativeHeader({ title, subtitle, showBrand = false }: NativeHeaderProps) {
  const { profile, navigate, openDrawer, notificationsUnread } = usePrototype();
  const initials = profile.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "OR";

  return (
    <header className="native-header">
      <div className="header-title-wrap">
        {showBrand ? <BrandMark className="header-brand" /> : <><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</>}
      </div>
      <div className="header-actions">
        <button type="button" className="icon-button" aria-label="Pesquisar" onClick={() => openDrawer({ type: "search" })}>
          <Search size={20} strokeWidth={1.9} />
        </button>
        <button type="button" className={`icon-button ${notificationsUnread ? "has-indicator" : ""}`} aria-label="Notificações" onClick={() => openDrawer({ type: "notifications" })}>
          <Bell size={20} strokeWidth={1.9} />
        </button>
        <button type="button" className="header-profile-trigger" aria-label="Abrir perfil" onClick={() => navigate("perfil")}>
          <Avatar size="sm" initials={initials} alt="Seu perfil" contentClassName="avatar-neutral" />
        </button>
      </div>
    </header>
  );
}
