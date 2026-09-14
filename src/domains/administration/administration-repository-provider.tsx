import type { ReactNode } from "react";
import type { AdministrationRepository } from "./repository";
import { AdministrationRepositoryContext } from "./administration-repository-context";

export function AdministrationRepositoryProvider({
  repository,
  children,
}: {
  repository: AdministrationRepository;
  children: ReactNode;
}) {
  return (
    <AdministrationRepositoryContext.Provider value={repository}>
      {children}
    </AdministrationRepositoryContext.Provider>
  );
}
