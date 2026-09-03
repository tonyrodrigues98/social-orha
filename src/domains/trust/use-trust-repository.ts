import { useContext } from "react";
import type { TrustRepository } from "./repository";
import { TrustRepositoryContext } from "./trust-repository-context";

export function useTrustRepository(): TrustRepository {
  const repository = useContext(TrustRepositoryContext);
  if (!repository) {
    throw new Error("useTrustRepository precisa estar dentro de TrustRepositoryProvider.");
  }
  return repository;
}
