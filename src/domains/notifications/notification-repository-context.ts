import { createContext } from "react";
import type { NotificationRepository } from "./repository";

export const NotificationRepositoryContext = createContext<NotificationRepository | null>(null);
