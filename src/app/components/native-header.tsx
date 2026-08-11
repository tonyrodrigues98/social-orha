import { Bell, Search } from "lucide-react";
import { Avatar } from "@/components/base/avatar/avatar";
import { useAuth } from "@/app/auth/auth-context";
import { BrandMark } from "./brand-mark";

type NativeHeaderProps = {
  title?: string;
  subtitle?: string;
  showBrand?: boolean;
};

export function NativeHeader({
  title,
  subtitle,
  showBrand = false,
}: NativeHeaderProps) {
  const { identity } = useAuth();
  const initials = identity?.profile.full_name
    ?.split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "OR";

  return (
    <header className="native-header">
      <div className="header-title-wrap">
        {showBrand ? (
          <BrandMark className="header-brand" />
        ) : (
          <>
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </>
        )}
      </div>
      <div className="header-actions">
        <button type="button" className="icon-button" aria-label="Pesquisar">
          <Search size={20} strokeWidth={1.9} />
        </button>
        <button type="button" className="icon-button has-indicator" aria-label="Notificações">
          <Bell size={20} strokeWidth={1.9} />
        </button>
        <Avatar
          size="sm"
          initials={initials}
          alt="Seu perfil"
          contentClassName="avatar-neutral"
        />
      </div>
    </header>
  );
}
