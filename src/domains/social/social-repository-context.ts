import { createContext, useContext } from "react";
import type { SocialRepository } from "./repository";

export const SocialRepositoryContext = createContext<SocialRepository | null>(
  null,
);

export function useSocialRepository(): SocialRepository {
  const repository = useContext(SocialRepositoryContext);
  if (!repository) {
    throw new Error(
      "useSocialRepository precisa estar dentro de SocialRepositoryProvider.",
    );
  }
  return repository;
}
