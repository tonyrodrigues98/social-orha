import type { ReactNode } from "react";
import type { SocialRepository } from "./repository";
import { SocialRepositoryContext } from "./social-repository-context";

export function SocialRepositoryProvider({
  repository,
  children,
}: {
  repository: SocialRepository;
  children: ReactNode;
}) {
  return (
    <SocialRepositoryContext.Provider value={repository}>
      {children}
    </SocialRepositoryContext.Provider>
  );
}
