import { useContext } from "react";
import { NotificationRepositoryContext } from "./notification-repository-context";
import type { NotificationRepository } from "./repository";

export function useNotificationRepository(): NotificationRepository {
  const repository = useContext(NotificationRepositoryContext);
  if (!repository) {
    throw new Error(
      "useNotificationRepository precisa estar dentro de NotificationRepositoryProvider.",
    );
  }
  return repository;
}
