# ORHA — protótipo native-first

Primeiro protótipo real da ORHA: uma rede social cristã 18+ voltada a vínculos, comunidades, interesses em comum, conversas privadas e ampla personalização de perfil.

O projeto é **native-first, não mobile-first**. Sua superfície principal é um app PWA em orientação retrato, com safe areas de iPhone, splash, navegação inferior e ergonomia de toque. Em telas largas, o navegador funciona somente como palco de visualização do app — não como um site responsivo convencional.

## Instalação

Requer Node.js 22.12 ou superior.

```bash
npm ci
npm run dev
```

Copie `.env.example` para `.env.local` e preencha a URL e a publishable key do Supabase. Nunca coloque uma secret key ou `service_role` em variáveis `VITE_*`.

O `.npmrc` mantém `legacy-peer-deps=true` porque duas alternativas em quarentena ainda publicam peer ranges de React 18. A razão e o impacto estão documentados no inventário.

## Verificação

```bash
npm run check:catalog
npm run typecheck
npm run lint
npm test
npm run build
```

## O que foi integrado

- GodUI Drawer em `src/components/godui/`, instalado pelo registry oficial.
- GodUI Tab Bar como navegação global entre Início, Comunidade, Explorar, Conversas e Perfil.
- Todo o catálogo gratuito `base` do Untitled UI em `src/components/base/` e `src/components/foundations/`.
- Todas as primitives do chatcn em `src/components/ui/chat/`, com o CSS isolado em `src/styles/vendor/`.
- shadcn configurado em `components.json`, React 19.2, Tailwind 4.3 e alias `@/`.
- 56 pacotes npm associados às 41 entradas únicas da pesquisa.
- `MemoryAnalyticsAdapter`, `BrowserAudioRecorder` e repository local com Orama.
- Supabase CLI inicializada e vinculada, cliente público configurado e adapter de Auth por e-mail/senha.
- Auth completo com confirmação de e-mail, login, recuperação/troca de senha, sessão persistente, logout e onboarding protegido.
- Roles permanentes SuperAdmin, Admin, Moderador, Suporte e Usuário; todo cadastro começa como Usuário e roles não podem ser alteradas pelo cliente.
- Schema remoto versionado com perfis, detalhes, privacidade, RLS, validação 18+ e trigger de criação automática.
- Manifest, service worker e assets de splash gerados por `vite-plugin-pwa`.

O inventário completo, incompatibilidades e fontes oficiais estão em [docs/LIBRARY-INVENTORY.md](docs/LIBRARY-INVENTORY.md). A fonte executável da verdade é [src/infrastructure/libraries/library-catalog.ts](src/infrastructure/libraries/library-catalog.ts).

As decisões permanentes do produto estão em [docs/PRODUCT-BRIEF.md](docs/PRODUCT-BRIEF.md).
O modelo de autenticação e autorização está em [docs/AUTH-FOUNDATION.md](docs/AUTH-FOUNDATION.md).

## Regra para futuras features

Use a base de bibliotecas como a estrutura principal do projeto. Os temas globais e tokens dos kits são personalizáveis e podem dominar a aplicação; ORHA não possui uma camada de autoridade acima deles. Ainda assim, mantenha serviços externos atrás de adapters e não inicialize credenciais ou infraestrutura sem necessidade.
