import { useContext } from "react";
import { AdministrationRepositoryContext } from "./administration-repository-context";

export function useAdministrationRepository() {
  const repository = useContext(AdministrationRepositoryContext);
  if (!repository) {
    throw new Error("AdministrationRepositoryProvider is missing.");
  }
  return repository;
}
