# Auditoria de produção ORHA — 16 de agosto de 2026

## A. Resumo executivo

O ORHA foi auditado e endurecido como PWA native-first. A entrega elimina os P0/P1/P2 reproduzidos no fluxo público e corrige, por inspeção, testes e gates, os defeitos críticos de autenticação, privacidade, overlays, chat, áudio, mídia, primeiro paint e GitHub Pages.

Deploy validado:

- Página: <https://tonyrodrigues98.github.io/social-orha/>
- Commit final: `40a1a882df11a91347e1ef69dcd26077e0f39959`
- Workflow final: <https://github.com/tonyrodrigues98/social-orha/actions/runs/31963384242>
- Resultado do workflow: build e deploy concluídos com sucesso.

Não é tecnicamente possível provar “zero bugs para sempre”. O estado verificável é: nenhum P0/P1/P2 conhecido permaneceu nas superfícies efetivamente testadas; as limitações externas e de cobertura estão registradas na seção J.

## B. Defeitos encontrados e causas-raiz

### P0/P1 corrigidos

- Splash/Auth podia revelar uma superfície intermediária e remontar conteúdo. Causa: fluxo cruzado, fallback vazio e handoff antes do `focus-contract-out`. Correção: uma única superfície opaca, timeline de 0,6 s + retenção até 2,6 s + saída de 0,4 s, e Auth somente após a conclusão.
- O primeiro frame dependia do React e do download do logo. Causa: root inicialmente vazio. Correção: boot surface crítica no HTML usando o ativo real e geometria idêntica ao primeiro keyframe.
- O ativo de marca usava JPG, blend mode e geometria não reservada. Correção: PNG transparente aprovado, `width`/`height`, preload e paths base-aware.
- Auth no GitHub Pages perdia `/social-orha/`. Causa: callback baseado apenas em `window.location.origin`. Correção: redirects usam `import.meta.env.BASE_URL`.
- Privacidade era apenas visual; tabelas brutas podiam ignorar preferências por campo. Correção: migration forward-only com leitura owner-only, RPC mascarada, amizade sem follow e solicitação de conversa independente.
- Drawer GodUI não isolava foco/fundo de forma robusta. Correção: composição com React Aria Modal/Dialog, Escape, focus scope, retorno de foco, `inert` e z-index explícito.
- Menu e dados do contato podiam ficar transparentes/sobrepostos. Correção: superfícies opacas, portal no root temático e renderização exclusiva dentro do ChatProvider.
- WaveSurfer existia invisível atrás de barras manuais. Correção: waveform real visível, seek acessível, `peaks`/`duration` e fallback manual somente em erro.
- MediaRecorder permitia corridas de start/stop/cancel e streams órfãos. Correção: máquina de estados, geração idempotente, MIME compatível, tracks liberadas e URLs revogadas.
- Chat e todos os áudios entravam no bundle autenticado inicial. Correção: rota privada lazy, prefetch ao entrar em Conversas e chunk próprio.
- Históricos extensos renderizavam tudo e ignoravam paginação. Correção: TanStack Virtual a partir de cem mensagens, `onLoadMore`, `hasMore` e preservação de scroll.
- Galeria aceitava arquivos arbitrários e vazava object URLs. Correção: validação de MIME/tamanho/quantidade/decodificação, ownership explícito e lightbox real.
- Inputs com 14 px ainda acionavam zoom no iOS. Correção: contrato global de 16 px para toda superfície editável, preservando seleção e callout apenas nos campos.
- Viewports de 320×568 eram recortados por `min-height: 620px`; formulários longos bloqueavam scroll vertical. Correção: shell sem altura mínima rígida e `touch-action: pan-y`.
- A atualização automática do service worker podia recarregar formulários. Correção: estratégia `prompt` com atualização apenas após confirmação.

### P2 corrigidos

- targets abaixo de 44 px em ações principais, back, menu, gravação, chips e reação rápida;
- labels/IDs duplicados no NativeSelect;
- tabs de Conversas sem modelo ARIA/teclado;
- chips do onboarding sem `aria-pressed`, grupos sem `fieldset/legend` e erros sem alert;
- contraste insuficiente em textos auxiliares e placeholders;
- datas/horas e menus remanescentes em inglês;
- ações invisíveis ainda interceptando toque;
- cronômetro de gravação refazendo o mapeamento de mensagens quatro vezes por segundo;
- catálogo e inventário declarando integrações diferentes do runtime real.

## C. Arquivos principais alterados

- `src/app/App.tsx`: orquestração Splash/Auth/lazy/PWA update.
- `src/app/components/splash-screen.tsx` e `brand-mark.tsx`: timeline e ativo aprovado.
- `index.html` e `vite.config.ts`: primeiro paint, base Pages, manifesto e Workbox.
- `src/app/auth/*`: fluxo, foco, sessão persistente, redirects e controles Untitled.
- `src/app/onboarding/onboarding-flow.tsx`: semântica, reduced motion e corrida estado/cidade.
- `src/components/godui/drawer.tsx`: modalidade React Aria preservando GodUI.
- `src/app/components/prototype-drawer.tsx`: primitives Untitled e Orama.
- `src/app/pages/private-chat-page.tsx`: swipe, detalhes, gravação e ciclo de foco.
- `src/components/ui/chat/*`: chatcn, WaveSurfer, anexos, paginação, virtualização e pt-BR.
- `src/app/pages/profile-page.tsx` e `profile-media.ts`: validação e lightbox.
- `src/infrastructure/media/browser-audio-recorder.ts`: adapter seguro de MediaRecorder.
- `src/infrastructure/supabase/*` e `supabase/migrations/20260816130000_security_privacy_hardening.sql`: Auth/privacidade/RLS.
- `.github/workflows/deploy-pages.yml`: gates completos antes do deploy.

## D. Bibliotecas reutilizadas

- GodUI: Tab Bar e Drawer.
- Untitled UI: Button, Input, TextArea, NativeSelect, Toggle, Checkbox, Avatar, Dropdown e FileTrigger.
- React Aria: Modal/Dialog, foco, overlay, tabs, seleção e teclado.
- chatcn: única base do chat privado e composer.
- Motion/framer-motion: transições e gestos existentes, com reduced motion.
- WaveSurfer + MediaRecorder: reprodução/waveform e gravação real.
- TanStack Virtual: histórico grande.
- Embla: pessoas e favoritos.
- Yet Another React Lightbox: galeria do perfil.
- Orama: busca local.
- React Hook Form: formulários de autenticação.

## E. Decisões de não uso

- Vaul, Vidstack, react-media-recorder e Emoji Mart continuam em quarentena.
- Swiper não substitui Embla sem requisito avançado.
- Uppy XHR e react-easy-crop não foram ativados antes de existir bucket, policies e pipeline persistente; o contrato está em `docs/PROFILE-MEDIA-FLOW.md`.
- Meilisearch, Typesense, Gorse, Metarank, PostHog e Umami continuam atrás de adapters/configuração futura.
- Nenhum serviço externo ou analytics foi inicializado sem backend, credencial e consentimento reais.

## F. Assets

Validados no Pages, sem 404:

- `orha-mark-transparent.png`: 697×177.
- `orha-icon-192.png`: 192×192.
- `orha-icon-512.png`: 512×512.
- `orha-apple-touch-icon.png`: 180×180.

O manifesto, preload, favicon, Apple Touch icon e URLs usam `/social-orha/`. A marca crítica tem dimensões reservadas e não depende de blend mode.

## G. Viewports verificados

Emulação de navegador:

- 320×568;
- 375×667;
- 390×844;
- 393×852;
- 430×932;
- 440×932;
- 1280×800;
- 1440×900.

Em todos: shell igual ao viewport móvel; shell centralizado e limitado a 440 px no desktop; zero overflow horizontal; inputs de texto com 16 px. Em 320×568, cadastro possui scroll vertical funcional (`611/568`) e `touch-action: pan-y`.

## H. Gates executados

Localmente:

- `npm run check:catalog`: 41 itens, 56 pacotes/fontes, 5 pacotes em quarentena sem import runtime.
- `npm run typecheck`: passou.
- `npm run lint`: passou sem erros ou avisos.
- `npm test`: 10 arquivos, 30 testes passaram.
- `npm ls --depth=0`: passou, sem missing/invalid/extraneous direto.
- `git diff --check`: passou.
- Build do cliente: 5.710 módulos e chunks gerados; o `closeBundle` local foi impedido exclusivamente pelo sandbox Windows ao fazer `lstat C:\Users\CPU`.

No GitHub Actions/Ubuntu:

- `npm ci`: passou.
- `npm audit --omit=dev --audit-level=high`: passou.
- typecheck, lint, 30 testes e catálogo: passaram.
- build PWA/Workbox completo: passou.
- upload e deploy Pages: passaram.

## I. QA visual e de runtime

- boot frame usa o mesmo logo borrado da entrada, sem root branco vazio;
- estado estável comparado com a referência aprovada;
- durante `is-leaving`, Auth não está montado e não atravessa a splash;
- handoff termina o focus-out antes de exibir o login;
- fundos de splash/auth são `#fff`, sem faixa warm-white;
- shell, safe area, scroll e palco desktop permanecem estáveis;
- cadastro vazio anuncia três erros e move foco para e-mail;
- manifesto final usa `scope`, `start_url` e `id` em `/social-orha/`;
- atualização PWA exibiu o prompt, preservou a tela e só ativou os novos assets após “Atualizar”.

## J. Limitações e pendências externas

- Não houve Safari/iPhone físico; a matriz foi emulada. Gestos, teclado e microfone ainda exigem uma rodada em dispositivo real.
- Não foi criada uma conta externa de teste. Portanto, chat, perfil, onboarding autenticado e permissões foram cobertos por fonte, testes e build, mas não por uma sessão visual autenticada nesta auditoria.
- A migration `20260816130000_security_privacy_hardening.sql` está versionada e testada, porém não foi aplicada ao Supabase remoto: a CLI vinculada não possui access token nesta sessão. As constraints `NOT VALID` também exigem auditoria/validação posterior dos registros legados.
- A URL Pages está versionada em `supabase/config.toml`, mas o allow-list remoto de Auth deve ser conferido no Dashboard depois da aplicação controlada.

## K. Resultado

Código, CI, PWA e GitHub Pages estão publicados e verdes no escopo verificável. A entrega não declara o Supabase remoto endurecido até que a migration seja aplicada e validada com credencial administrativa apropriada.
