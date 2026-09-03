import type { MouseEvent, ReactNode } from "react";
import {
  buildSettingsInfoHref,
  type SettingsInfoNavigationProps,
  type SettingsInfoPath,
} from "./settings-info-routes";

export function SettingsInfoLink({
  path,
  onNavigate,
  className,
  children,
  ariaLabel,
}: SettingsInfoNavigationProps & {
  path: SettingsInfoPath;
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
}) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onNavigate) return;
    event.preventDefault();
    onNavigate(path);
  };

  return (
    <a
      href={buildSettingsInfoHref(path)}
      aria-label={ariaLabel}
      className={className}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}
