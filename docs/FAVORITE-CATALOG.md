# Catálogos públicos de favoritos

Última verificação: 2026-08-16.

O onboarding e a edição de perfil usam uma única busca autenticada, `catalog-search`, executada como Supabase Edge Function. Não existe entrada manual para novos favoritos e não existem resultados mockados. Registros legados em texto continuam legíveis e podem ser removidos, mas toda nova seleção contém uma identidade externa verificável.

## Contrato persistido

Cada coluna JSONB de favoritos em `profile_details` contém no máximo cinco objetos:

```json
{
  "label": "Interestelar",
  "externalId": "apple:157336",
  "imageUrl": "https://...",
  "subtitle": "Christopher Nolan · 2014",
  "provider": "apple"
}
```

`imageUrl` e `subtitle` são opcionais. `label`, `externalId` e `provider` são obrigatórios em novas seleções. `source` existe apenas como leitura compatível de registros antigos; novas gravações usam `provider`.

## Provedores allowlisted

| Categoria | Provedor | Endpoint server-side | Credencial |
| --- | --- | --- | --- |
| Filmes | Apple iTunes Search API | `/search`, `media=movie`, `entity=movie`, país `BR` | nenhuma |
| Músicas | Apple iTunes Search API | `/search`, `media=music`, `entity=song`, país `BR` | nenhuma |
| Artistas | Apple iTunes Search API | `/search`, `media=music`, `entity=musicArtist`, país `BR` | nenhuma |
| Séries | TVmaze | `/search/shows?q=` | nenhuma |
| Livros | Open Library | `/search.json` com campos mínimos | nenhuma |
| Jogos | CheapShark | `/api/1.0/games?title=` | nenhuma |

A função não aceita URL fornecida pelo cliente. A categoria decide um host e endpoint fixos, evitando que a superfície vire um proxy SSRF genérico. URLs de imagem persistidas precisam usar HTTPS.

Fontes oficiais:

- [Apple — Constructing Searches](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/Searching.html)
- [TVmaze API](https://www.tvmaze.com/api)
- [Open Library Search API](https://openlibrary.org/dev/docs/api/search)
- [Open Library Covers API](https://openlibrary.org/dev/docs/api/covers)
- [CheapShark API](https://apidocs.cheapshark.com/)

A documentação da Apple exige callback em chamadas cross-site e informa limite aproximado de 20 buscas por minuto. Por isso a ORHA nunca chama Apple diretamente do navegador: todas as categorias passam pelo adapter Edge, enquanto TanStack Query mantém cache de cinco minutos e cancela a requisição anterior quando o termo muda. TVmaze declara CORS, limite e atribuição, mas permanece no mesmo adapter para manter validação, timeout e formato uniformes.

## Comportamento da interface

- componente compartilhado `FavoriteCatalogPicker`, baseado no Combobox React Aria copiado do Untitled UI;
- busca depois de duas letras, debounce de 350 ms e cancelamento via `AbortSignal`;
- loading, vazio e erro anunciados por região `aria-live`;
- limite de cinco e deduplicação por `externalId`;
- remoção e reordenação por controles de teclado/toque com nome acessível;
- campos editáveis cobertos pelo contrato global de 16 px para impedir zoom no iOS;
- imagem quebrada cai em ícone local, nunca no indicador `?` do navegador;
- atribuição do provedor visível no próprio seletor.

## Configuração e deploy

Não há secret de Apple, TVmaze, Open Library ou CheapShark. O único valor operacional adicional é a allowlist CORS já compartilhada pelas Edge Functions:

```powershell
npx supabase secrets set ORHA_ALLOWED_ORIGINS="https://tonyrodrigues98.github.io,http://localhost:5173"
npx supabase functions deploy catalog-search --project-ref iuaczhkfmwpyhtpdmuyt
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são built-ins do runtime Supabase; nenhum deles deve ser copiado para código, documentação ou variável `VITE_*`. `verify_jwt = true` e a validação de sessão dentro da função impedem uso anônimo.

Antes de declarar a integração publicada, executar uma busca autenticada de cada categoria, verificar erro 401 sem sessão, erro 403 para origem fora da allowlist, timeout e resposta 429/5xx sem vazamento do corpo do provedor.

## Evolução sem quebra de contrato

Se um catálogo futuro exigir chave, crie um adapter server-side específico e registre apenas o nome do secret no inventário. Nunca envie a chave ao browser, nunca use valor inventado e nunca faça fallback para conteúdo fake. O JSON persistido e o `externalId` namespaced permitem trocar a apresentação sem perder a origem de cada escolha.
