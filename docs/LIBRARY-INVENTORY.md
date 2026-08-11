# Inventário de integração

Pesquisa e instalação verificadas em 11 de agosto de 2026. As versões exatas e transitivas estão congeladas em `package-lock.json`; `package.json` mostra as versões diretas.

## Resultado

| Grupo | Implementação |
|---|---|
| Kits de código | GodUI Drawer e Tab Bar, todos os componentes base gratuitos do Untitled UI, chatcn completo e infraestrutura shadcn |
| UI e interação | Radix, React Aria, react-modal-sheet, Vaul, Embla, Swiper, Lightbox, TanStack Virtual, Motion e use-gesture |
| Mídia | Vidstack, Media Chrome, wavesurfer, react-media-recorder, MediaRecorder nativo, react-easy-crop e Cropper.js |
| Editor e chat | Tiptap + mentions, Lexical, emoji-picker-react, Emoji Mart e chatcn |
| Upload | Uppy core/React/XHR, react-dropzone e FilePond |
| Produto | MapLibre/react-map-gl, Recharts, React Hook Form, TanStack Form e React DayPicker |
| Busca | Orama, Algolia Autocomplete, clientes Meilisearch e Typesense |
| Recomendação/analytics | SDK Gorse, PostHog JS, cliente Node Umami e porta local de analytics |
| Runtime do protótipo | Supabase JS + CLI e `vite-plugin-pwa` |

O catálogo tipado contém as 41 entradas, seus pacotes e o estado `integrated`, `installed`, `quarantined`, `client-ready` ou `external`.

## Serviços versus bibliotecas

Meilisearch, Typesense, Gorse, Metarank e Umami são serviços, não componentes React autocontidos. Instalar um pacote no frontend não instala seus servidores. A base inclui os clientes/SDKs disponíveis para Meilisearch, Typesense, Gorse e Umami, mas não inicia containers nem cria credenciais.

Metarank permanece `external`: ele é um serviço JVM/Docker e não há um SDK browser oficial que faça sentido adicionar à base vazia. A futura integração deve ser backend-side por REST.

MediaRecorder é uma Web API e, portanto, não possui pacote npm. Ela foi implementada atrás de `BrowserAudioRecorder`.

## Incompatibilidades confirmadas

- `@vidstack/react@0.6.15` declara peer de `@types/react` 18.
- `@emoji-mart/react@1.1.1` declara peer de React até 18.
- Vaul é mantido apenas como referência/POC, conforme o risco descrito no relatório.
- `react-media-recorder` é alternativa de comparação; o default arquitetural é a Web API atrás de adapter.
- TypeScript foi fixado em 5.9.3. O `latest` atual (7.0) ainda conflita com o peer range do `typescript-eslint` e diverge do stack documentado pelo Untitled UI.

Esses pacotes não são importados pelo entrypoint do app. O build inicial continua pequeno e não executa nenhum SDK externo.

## Adaptações dos registries

### GodUI

O registry atual do Drawer depende de `@godui/godui-theme`. O alias foi registrado em `components.json`, o dry-run foi inspecionado e a instalação oficial aplicada. A CLI adicionou o código e os tokens Tailwind ao projeto. O Tab Bar foi igualmente validado com `--dry-run` e instalado pelo registry oficial; ele é a navegação principal native-first do protótipo.

### Supabase e PWA

`@supabase/supabase-js` usa somente a Project URL e a publishable key no cliente. A secret key e `service_role` nunca pertencem a variáveis `VITE_*`. A CLI foi inicializada no repositório e vinculada ao projeto remoto, sem aplicar migrations nesta etapa.

`vite-plugin-pwa` gera o Web App Manifest e o service worker por `generateSW`. Os dois JPGs fornecidos foram preservados como assets de splash; um ícone oficial quadrado ainda será necessário antes da distribuição final nas lojas/telas iniciais.

### chatcn

O manifesto oficial usa `css` como string, enquanto o schema atual do shadcn exige um objeto. A CLI recusou o manifesto. Os sete arquivos e o CSS foram então copiados sem alteração a partir do repositório/registry oficial. Esta exceção está documentada para que uma futura atualização tente novamente a CLI antes de repetir a adaptação.

### Untitled UI

A CLI oficial foi executada com `--all --type base --yes`. O path final foi normalizado para o root esperado pelos imports internos (`@/components/base` e `@/components/foundations`). Uma chamada gerada a `SetIterator.toArray()` foi substituída por `Array.from()` para compatibilidade com o target ES2022.

## Fontes oficiais consultadas

- shadcn: <https://ui.shadcn.com/docs/installation/manual>
- shadcn + Tailwind 4/React 19: <https://ui.shadcn.com/docs/tailwind-v4>
- GodUI installation: <https://godui.design/docs/installation>
- GodUI Drawer: <https://godui.design/docs/components/overlays/drawer>
- GodUI Tab Bar: <https://godui.design/docs/components/navigation/tab-bar>
- Untitled UI CLI: <https://www.untitledui.com/react/docs/cli>
- Untitled UI installation/stack: <https://www.untitledui.com/react/docs/installation>
- chatcn: <https://chatcn-iota.vercel.app/>
- TanStack Virtual: <https://tanstack.com/virtual/latest/docs/installation>
- Uppy React/headless: <https://uppy.io/docs/react/>
- Meilisearch JavaScript: <https://www.meilisearch.com/docs/getting_started/sdks/javascript>
- Gorse TypeScript SDK: <https://gorse.io/docs/api/typescript-sdk>
- Umami Node client: <https://docs.umami.is/docs/api/node-client>
- Supabase React quickstart: <https://supabase.com/docs/guides/getting-started/quickstarts/reactjs>
- Supabase Auth com React: <https://supabase.com/docs/guides/auth/quickstarts/react>
- Supabase CLI: <https://supabase.com/docs/guides/local-development/cli/getting-started>
- Vite PWA: <https://vite-pwa-org.netlify.app/guide/>

## Atualização futura

1. Atualize um grupo de cada vez.
2. Rode `npm run check:catalog`, typecheck, testes e build.
3. Para GodUI/chatcn/shadcn, use `--dry-run` e `--diff` antes de sobrescrever código local.
4. Não inicialize PostHog, Umami ou serviços de busca sem configuração, consentimento e uma decisão explícita de backend.
