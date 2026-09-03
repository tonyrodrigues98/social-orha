import { Bell, Search } from "lucide-react";
import { Avatar } from "@/components/base/avatar/avatar";
import { useNotificationCenter } from "@/domains/notifications";
import { useAuth } from "../auth/auth-context";
import { useAppUi } from "../ui-state-context";
import { BrandMark } from "./brand-mark";

type NativeHeaderProps = {
  title?: string;
  subtitle?: string;
  showBrand?: boolean;
  notificationUnreadCount?: number;
};

function NotificationButton({ unreadCount, onOpen }: { unreadCount: number; onOpen: () => void }) {
  return (
    <button type="button" className={`icon-button ${unreadCount > 0 ? "has-indicator" : ""}`} aria-label="Notificações" onClick={onOpen}>
      <Bell size={20} strokeWidth={1.9} />
    </button>
  );
}

function LiveNotificationButton({ onOpen }: { onOpen: () => void }) {
  const notifications = useNotificationCenter({ unreadOnly: true });
  return <NotificationButton unreadCount={notifications.unreadCount} onOpen={onOpen} />;
}

export function NativeHeader({
  title,
  subtitle,
  showBrand = false,
  notificationUnreadCount,
}: NativeHeaderProps) {
  const { navigate, openDrawer } = useAppUi();
  const { identity } = useAuth();
  const initials = (identity?.profile.full_name ?? "ORHA")
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
        {notificationUnreadCount === undefined ? (
          <LiveNotificationButton onOpen={() => openDrawer({ type: "notifications" })} />
        ) : (
          <NotificationButton
            unreadCount={notificationUnreadCount}
            onOpen={() => openDrawer({ type: "notifications" })}
          />
        )}
        <button type="button" className="header-profile-trigger" aria-label="Abrir perfil" onClick={() => navigate("perfil")}>
          <Avatar size="sm" initials={initials} alt="Seu perfil" contentClassName="avatar-neutral" />
        </button>
      </div>
    </header>
  );
}
