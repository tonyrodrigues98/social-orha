import { createContext, useContext } from "react";
import type { ExploreRepository } from "./repository";

export const ExploreRepositoryContext = createContext<ExploreRepository | null>(null);

export function useExploreRepository(): ExploreRepository {
  const repository = useContext(ExploreRepositoryContext);
  if (!repository) {
    throw new Error(
      "useExploreRepository precisa estar dentro de ExploreRepositoryProvider.",
    );
  }
  return repository;
}
