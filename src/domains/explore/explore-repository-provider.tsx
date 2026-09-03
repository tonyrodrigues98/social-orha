import type { ReactNode } from "react";
import { ExploreRepositoryContext } from "./explore-repository-context";
import type { ExploreRepository } from "./repository";

export function ExploreRepositoryProvider({
  repository,
  children,
}: {
  repository: ExploreRepository;
  children: ReactNode;
}) {
  return (
    <ExploreRepositoryContext.Provider value={repository}>
      {children}
    </ExploreRepositoryContext.Provider>
  );
}
