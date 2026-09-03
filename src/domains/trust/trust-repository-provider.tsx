import type { ReactNode } from "react";
import type { TrustRepository } from "./repository";
import { TrustRepositoryContext } from "./trust-repository-context";

export function TrustRepositoryProvider({
  repository,
  children,
}: {
  repository: TrustRepository;
  children: ReactNode;
}) {
  return (
    <TrustRepositoryContext.Provider value={repository}>
      {children}
    </TrustRepositoryContext.Provider>
  );
}
