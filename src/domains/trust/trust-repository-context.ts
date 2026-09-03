import { createContext } from "react";
import type { TrustRepository } from "./repository";

export const TrustRepositoryContext = createContext<TrustRepository | null>(null);
