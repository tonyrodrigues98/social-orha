# Persistência de onboarding e perfil

O estado durável do perfil usa Supabase como fonte de verdade e TanStack Query como cache do cliente.

## Contratos

| Domínio | Persistência | Operações do cliente |
|---|---|---|
| Identidade | `profiles` | carregar e atualizar nome, username, bio, igreja, localização e progresso do onboarding |
| Detalhes | `profile_details` | carregar personalidade, interesses, hobbies e lugares; atualizar enriquecimento pelo RPC own-only `update_own_profile_details` |
| Privacidade | `profile_privacy` | carregar na identidade e atualizar visibilidades de perfil, idade, localização, favoritos, galeria e modo namoro |
| Configurações | `user_settings` | carregar/atualizar locale, timezone, movimento reduzido e alto contraste |
| Favoritos | colunas JSONB de `profile_details` | buscar por APIs públicas, persistir até cinco `{label, externalId, imageUrl?, subtitle?, provider}` e atualizar uma categoria por vez |
| Mídia | `profile_media` + bucket privado `profile-media` | listar, reservar, enviar, finalizar, remover e reordenar |

`createProfileDataRepository` e os adapters de mídia aceitam clientes injetados. Isso mantém os testes independentes da rede e impede que componentes montem queries Supabase manualmente.

O patch de detalhes aceita somente `personality`, `favorite_season`, `social_energy`, `weekend_preferences`, `interests`, `hobbies`, `visited_places` e `desired_places`. O servidor normaliza espaços, limita o payload a 16 KiB, reaplica os limites por coleção e rejeita ids, timestamps ou campos de favoritos. Favoritos continuam em um adapter dedicado, inclusive na gravação atômica da última etapa do onboarding.

`profile_privacy.age_visibility` reutiliza `public | friends | private` e nasce como `private`. A projeção `get_visible_profile_age` calcula apenas anos completos no servidor, depois de validar conta ativa, onboarding, visibilidade, amizade e bloqueios. A data de nascimento nunca faz parte do contrato de perfil público.

Novos favoritos não aceitam texto livre. `FavoriteCatalogPicker` usa o adapter autenticado `catalog-search`; registros antigos em string/`source` permanecem somente como leitura compatível. Provedores, deploy e limites estão documentados em `docs/FAVORITE-CATALOG.md`.

## Onboarding retomável

Cada etapa salva seus dados e `onboarding_step` antes de avançar. Ao remontar, o fluxo usa a identidade mais recente no cache/servidor e abre a próxima etapa. A conclusão grava `onboarding_completed_at`; etapas opcionais podem ser puladas sem apagar valores já persistidos.

## Cache e providers

`OrhaQueryProvider` deve envolver a árvore que renderiza onboarding e área autenticada. Os hooks em `src/app/profile/profile-queries.ts` atualizam o cache após mutações, invalidam configurações dependentes e renovam URLs assinadas da mídia antes de expirarem.

## Limite de garantia

Os adapters e testes validam o contrato do cliente. O ambiente remoto só está pronto depois que migrations, bucket, RLS e RPCs forem aplicados e verificados no projeto Supabase.
