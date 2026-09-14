import type { ReactNode } from "react";
import type { SupportRepository } from "./repository";
import { SupportRepositoryContext } from "./support-repository-context";

export function SupportRepositoryProvider({
  repository,
  children,
}: {
  repository: SupportRepository;
  children: ReactNode;
}) {
  return (
    <SupportRepositoryContext.Provider value={repository}>
      {children}
    </SupportRepositoryContext.Provider>
  );
}
