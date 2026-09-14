import { createContext } from "react";
import type { SupportRepository } from "./repository";

export const SupportRepositoryContext = createContext<SupportRepository | null>(null);
