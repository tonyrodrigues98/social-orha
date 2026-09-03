import type { ReactNode } from "react";
import { NotificationRepositoryContext } from "./notification-repository-context";
import type { NotificationRepository } from "./repository";

export function NotificationRepositoryProvider({
  repository,
  children,
}: {
  repository: NotificationRepository;
  children: ReactNode;
}) {
  return (
    <NotificationRepositoryContext.Provider value={repository}>
      {children}
    </NotificationRepositoryContext.Provider>
  );
}
