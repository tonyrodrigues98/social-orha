import { useId, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  LoaderCircle,
  Search,
  Star,
  X,
} from "lucide-react";
import type { Key } from "react-aria-components";
import { Button } from "@/components/base/buttons/button";
import { ComboBox } from "@/components/base/select/combobox";
import { SelectItem } from "@/components/base/select/select-item";
import {
  addFavoriteItem,
  favoriteCategoryLabels,
  favoriteItemKey,
  favoriteProviderByCategory,
  MAX_FAVORITES_PER_CATEGORY,
  MAX_FAVORITE_SEARCH_LENGTH,
  MIN_FAVORITE_SEARCH_LENGTH,
  moveFavoriteItem,
  normalizeFavoriteSearchQuery,
  type FavoriteCatalogItem,
  type FavoriteCatalogRepository,
  type FavoriteCatalogProvider,
} from "@/domain/favorite-catalog";
import type { FavoriteCategory, FavoriteItem } from "@/domain/profile-data";
import {
  useDebouncedFavoriteQuery,
  useFavoriteCatalogSearch,
} from "./favorite-catalog-queries";

const providerMetadata: Record<FavoriteCatalogProvider, { label: string; href: string }> = {
  apple: { label: "Apple Search API", href: "https://www.apple.com/br/itunes/" },
  tvmaze: { label: "TVmaze", href: "https://www.tvmaze.com/" },
  openlibrary: { label: "Open Library", href: "https://openlibrary.org/" },
  cheapshark: { label: "CheapShark", href: "https://www.cheapshark.com/" },
};

function FavoriteArtwork({ item }: { item: FavoriteItem }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-tertiary text-quaternary">
      {item.imageUrl && !failed ? (
        <img
          className="size-full object-cover"
          src={item.imageUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <Star className="size-5" aria-hidden="true" />
      )}
    </span>
  );
}

export function FavoriteCatalogPicker({
  category,
  items,
  onChange,
  isDisabled = false,
  repository,
}: {
  category: FavoriteCategory;
  items: readonly FavoriteItem[];
  onChange: (items: FavoriteItem[]) => void;
  isDisabled?: boolean;
  repository?: FavoriteCatalogRepository;
}) {
  const [query, setQuery] = useState("");
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const statusId = useId();
  const debouncedQuery = useDebouncedFavoriteQuery(query);
  const normalizedQuery = normalizeFavoriteSearchQuery(query);
  const normalizedDebouncedQuery = normalizeFavoriteSearchQuery(debouncedQuery);
  const search = useFavoriteCatalogSearch(category, debouncedQuery, repository);
  const atLimit = items.length >= MAX_FAVORITES_PER_CATEGORY;
  const label = favoriteCategoryLabels[category];
  const provider = providerMetadata[favoriteProviderByCategory[category]];
  const waitingForDebounce = normalizedQuery !== normalizedDebouncedQuery;
  const results = useMemo(
    () => waitingForDebounce
      ? []
      : (search.data ?? []).filter((candidate) => (
        !items.some((item) => favoriteItemKey(item) === favoriteItemKey(candidate))
      )),
    [items, search.data, waitingForDebounce],
  );
  const options = results.map((item) => ({
    id: item.externalId,
    label: item.label,
    supportingText: item.subtitle,
    avatarUrl: item.imageUrl,
  }));
  const readyQuery = normalizedDebouncedQuery.length >= MIN_FAVORITE_SEARCH_LENGTH;
  const loading = readyQuery && (waitingForDebounce || search.isFetching);
  const searchFailed = readyQuery && !waitingForDebounce && search.isError;
  const noResults = readyQuery && !loading && !searchFailed && results.length === 0;

  function selectResult(key: Key | null) {
    if (key === null) return;
    const selected = results.find((item) => item.externalId === String(key));
    if (!selected) return;
    const next = addFavoriteItem(items, selected as FavoriteCatalogItem);
    if (next.length === items.length) {
      setSelectionError(
        atLimit
          ? `Você já escolheu ${MAX_FAVORITES_PER_CATEGORY} ${label.toLocaleLowerCase("pt-BR")}.`
          : "Esse item já está na sua lista.",
      );
      return;
    }
    onChange(next);
    setQuery("");
    setSelectionError(null);
  }

  return (
    <section className="grid gap-3" aria-labelledby={`${statusId}-heading`}>
      <div className="flex items-center justify-between gap-3">
        <h3 id={`${statusId}-heading`} className="m-0 text-sm font-semibold text-primary">
          {label}
        </h3>
        <span className="text-xs font-medium text-tertiary">
          {items.length}/{MAX_FAVORITES_PER_CATEGORY}
        </span>
      </div>

      {items.length ? (
        <ol className="m-0 grid list-none gap-2 p-0" aria-label={`${label} selecionados`}>
          {items.map((item, index) => (
            <li
              key={`${favoriteItemKey(item)}-${index}`}
              className="flex min-h-16 items-center gap-3 rounded-xl bg-secondary p-2.5"
            >
              <FavoriteArtwork item={item} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-primary">{item.label}</span>
                {item.subtitle ? (
                  <span className="block truncate text-xs text-tertiary">{item.subtitle}</span>
                ) : null}
              </span>
              <span className="flex shrink-0 items-center">
                <Button
                  type="button"
                  size="xs"
                  color="tertiary"
                  iconLeading={ArrowUp}
                  aria-label={`Mover ${item.label} para cima`}
                  isDisabled={isDisabled || index === 0}
                  onPress={() => onChange(moveFavoriteItem(items, index, index - 1))}
                />
                <Button
                  type="button"
                  size="xs"
                  color="tertiary"
                  iconLeading={ArrowDown}
                  aria-label={`Mover ${item.label} para baixo`}
                  isDisabled={isDisabled || index === items.length - 1}
                  onPress={() => onChange(moveFavoriteItem(items, index, index + 1))}
                />
                <Button
                  type="button"
                  size="xs"
                  color="tertiary-destructive"
                  iconLeading={X}
                  aria-label={`Remover ${item.label}`}
                  isDisabled={isDisabled}
                  onPress={() => {
                    onChange(items.filter((_, position) => position !== index));
                    setSelectionError(null);
                  }}
                />
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="m-0 rounded-xl bg-secondary px-3 py-3 text-sm text-tertiary">
          Nenhum favorito selecionado.
        </p>
      )}

      <ComboBox
        label={`Buscar ${label.toLocaleLowerCase("pt-BR")}`}
        placeholder={atLimit ? "Limite de cinco atingido" : `Digite ao menos ${MIN_FAVORITE_SEARCH_LENGTH} letras`}
        shortcut={false}
        size="lg"
        items={options}
        inputValue={query}
        selectedKey={null}
        menuTrigger="input"
        allowsEmptyCollection
        isDisabled={isDisabled || atLimit}
        isInvalid={Boolean(selectionError || searchFailed)}
        aria-describedby={statusId}
        onInputChange={(value) => {
          setQuery(value.slice(0, MAX_FAVORITE_SEARCH_LENGTH));
          setSelectionError(null);
        }}
        onSelectionChange={selectResult}
        icon={loading ? <LoaderCircle className="animate-spin" /> : Search}
      >
        {(option) => (
          <SelectItem {...option} selectionIndicator="none" />
        )}
      </ComboBox>

      <div id={statusId} className="min-h-5 text-xs text-tertiary" aria-live="polite">
        {loading ? "Buscando no catálogo…" : null}
        {noResults ? "Nenhum resultado encontrado. Tente outro termo." : null}
        {searchFailed ? (
          <span className="inline-flex flex-wrap items-center gap-2" role="alert">
            Não foi possível consultar o catálogo.
            <Button
              type="button"
              size="xs"
              color="link-gray"
              onPress={() => void search.refetch()}
            >
              Tentar novamente
            </Button>
          </span>
        ) : null}
        {selectionError ? <span role="alert">{selectionError}</span> : null}
        {!loading && !noResults && !searchFailed && !selectionError ? (
          <span>
            Resultados de{" "}
            <a
              className="font-medium underline underline-offset-2"
              href={provider.href}
              target="_blank"
              rel="noreferrer"
            >
              {provider.label}
            </a>
          </span>
        ) : null}
      </div>
    </section>
  );
}
