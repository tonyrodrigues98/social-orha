import { createContext } from "react";
import type { AdministrationRepository } from "./repository";

export const AdministrationRepositoryContext = createContext<AdministrationRepository | null>(null);
