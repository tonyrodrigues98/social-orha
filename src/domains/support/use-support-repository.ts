import { useContext } from "react";
import { SupportRepositoryContext } from "./support-repository-context";

export function useSupportRepository() {
  const repository = useContext(SupportRepositoryContext);
  if (!repository) {
    throw new Error("useSupportRepository precisa estar dentro de SupportRepositoryProvider.");
  }
  return repository;
}
