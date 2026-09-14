# ORHA — lacunas para um produto público em massa

Data da verificação: 2026-09-14  
Branch auditada: `codex/production-launch`  
Commit-base auditado antes deste checkpoint: `33cfcb5`
Staging auditado: `bgeauxljwjbtbwpbzpoo`  
Produção Supabase: `iuaczhkfmwpyhtpdmuyt`

## Veredito

A ORHA não é mais somente um protótipo na branch de lançamento: existe uma base de produção ampla, integrada ao Supabase, com rotas reais, repositories reais, schema social, RLS, Storage, Realtime e uma suíte de testes relevante. O staging possui 28 migrations aplicadas, 40 tabelas públicas com RLS, cinco buckets privados, 17 tabelas publicadas no Realtime, `supabase db lint --linked` sem achados, gate estrutural 23/23, matrizes RLS/onboarding/suporte/papéis globais/consentimento transacionais aprovadas e matriz autenticada de cinco papéis 16/16.

Mesmo assim, a ORHA **ainda não atende à Definition of Done para lançamento em massa**. Os bloqueadores não são cosméticos: o deploy público ainda executa a `main` legada com `PrototypeProvider` e seeds; deep links retornam HTTP 404; a jornada E2E real não pode iniciar por falta de ambiente/secrets; e os serviços externos obrigatórios de Auth, e-mail, domínio e operação ainda não foram comprovados. As cinco Edge Functions já estão ativas no staging, os dois erros SQL foram corrigidos e a superfície de dependências de produção está com audit zero.

Portanto, a classificação correta é:

- **Código candidato a lançamento:** avançado, compilável e sem mocks de runtime na branch auditada.
- **Staging de dados:** estruturalmente consistente, com RLS e lint validados, cinco Edge Functions ativas, gate anônimo/CORS 7/7, catálogo/export/mídia autenticados 14/14, ciclo de conta 17/17, mensageria/mídia privada 18/18, domínio social multiusuário 20/20 e matriz E2E efêmera de cinco papéis 16/16.
- **Produção:** não promovida.
- **Produto público atual:** protótipo legado, não equivalente à branch candidata.
- **Pronto para as massas:** não.

## Evidência verificável reunida

### O que existe de verdade

| Área                              | Evidência                                                                                                                                                                                                                                                                                   | Estado                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Runtime sem provider de protótipo | `src/app/app-runtime-providers.tsx` instancia adapters reais; `src/app/app-runtime-adapters.ts` liga Explore, Social, Notifications, Trust e Messaging ao Supabase                                                                                                                          | Implementado na branch                                                                              |
| Rotas recuperáveis                | `src/app/router.tsx` e `src/app/router-policy.ts` definem Auth, onboarding, cinco áreas principais, conversas, comunidades, perfil público, notificações, configurações, denúncia e moderação                                                                                               | Implementado na branch                                                                              |
| Auth por e-mail                   | `src/infrastructure/supabase/email-auth.ts` contém cadastro, login, logout, resend, recovery e troca de senha; `src/app/auth/auth-provider.tsx` observa a sessão real                                                                                                                       | Implementado; entrega externa não comprovada                                                        |
| Onboarding persistente            | `src/app/onboarding/onboarding-flow.tsx` retoma `onboarding_step` e persiste identidade, localidade, detalhes e favoritos                                                                                                                                                                   | Implementado; fechamento E2E pendente                                                               |
| Domínios sociais                  | `src/domains/social/repository.ts`, `src/infrastructure/supabase/social/social-repository.ts`, `scripts/social-domain-smoke.ts` e `e2e/staging-social-browser-smoke.spec.ts` comprovam perfis, amizades, comunidades, memberships, posts, comentários, reações, bloqueio e conversa textual | Implementado; domínio staging 20/20 e navegador multiusuário efêmero 3/3                            |
| Comunidade administrativa         | `src/infrastructure/supabase/community-management-repository.ts` e `src/app/community/community-manager-drawer.tsx` cobrem edição, regras, roles, banimento, branding e arquivamento                                                                                                        | Implementado; mídia depende de Edge                                                                 |
| Mensageria persistente            | `src/domains/messaging/contracts.ts` e `src/infrastructure/supabase/messaging/*` cobrem pedidos, grupos, texto, imagem, áudio, reply, reaction, forward, delete, receipts, busca, preferências e Realtime                                                                                   | Implementado; pedido/aceite, texto, receipts, mídia e Realtime privado comprovados 18/18 no staging |
| Waveform e gravação               | `src/app/pages/private-chat-page.tsx`, `src/infrastructure/media/browser-audio-recorder.ts` e `src/components/ui/chat/*` usam gravação real, waveform e primitives do chat                                                                                                                  | Implementado; WAV remoto, inspeção Edge, waveform persistida e download entre usuários comprovados  |
| Perfil e mídia                    | `src/app/pages/profile-page.tsx`, `src/app/profile/*`, `src/application/profile-media/*` e `src/infrastructure/supabase/profile-media-repository.ts` cobrem crop, avatar, capa, galeria, privacidade e favoritos                                                                            | Implementado; verificação remota depende de Edge                                                    |
| Home real                         | `src/app/pages/home-page.tsx` e `src/infrastructure/supabase/home/home-dashboard-repository.ts` usam resumo server-side, sem conteúdo falso                                                                                                                                                 | Implementado                                                                                        |
| Explore real                      | `src/app/explore/*` e `src/infrastructure/supabase/explore/*` usam busca server-side de perfis, comunidades, interesses e posts                                                                                                                                                             | Implementado; destinos futuros estão claramente marcados como planejamento                          |
| Confiança e moderação             | `src/domains/trust/*`, `src/infrastructure/supabase/trust/*`, `src/app/pages/report-page.tsx` e `src/app/pages/admin-moderation-page.tsx` cobrem bloqueio, denúncia, contexto limitado, sanção e auditoria                                                                                  | Implementado; operação E2E pendente                                                                 |
| Suporte                           | `src/domains/support/*`, `src/infrastructure/supabase/support/*`, `src/app/pages/support-page.tsx` e migrations `20260914100000`/`101000` cobrem chamado, fila, resposta, atribuição, prioridade, notificação e Realtime                                                                    | Implementado e validado transacionalmente no staging                                                |
| Analytics consentido              | `src/infrastructure/analytics/*`, `src/app/analytics/*`, Configurações > Dados e migration `20260914104000` usam o port existente, carregamento lazy, allowlist e opt-in persistente                                                                                                        | Implementado e validado transacionalmente; key/host externo ainda não provisionados                 |
| PWA e native-first                | `vite.config.ts`, `scripts/pwa-manifest.ts`, `src/app/pwa-runtime.ts`, `src/styles/index.css` e `public/brand/*`                                                                                                                                                                            | Build PWA aprovado                                                                                  |
| Base de bibliotecas               | `src/infrastructure/libraries/library-catalog.ts`, `docs/LIBRARY-INVENTORY.md`, `components.json` e `package.json`                                                                                                                                                                          | 43 itens, 66 pacotes/fontes conferidos, cinco pacotes em quarentena sem imports de runtime          |

### Estado remoto comprovado do staging

As leituras autenticadas da CLI confirmaram:

- 28 migrations locais/remotas alinhadas, de `20260811040000` a `20260914110000`;
- 40 tabelas públicas e as mesmas 40 com RLS;
- cinco buckets privados: `profile-media`, `community-media`, `chat-media`, `report-evidence` e `account-exports`;
- 17 tabelas na publication `supabase_realtime`;
- PostgreSQL 17.6;
- `scripts/supabase-validate.sql`: 23/23 verificações aprovadas;
- `scripts/supabase-rls-integration.sql`: matriz completa aprovada com rollback e sem fixtures residuais.

Fontes versionadas: `scripts/remote-inventory.sql`, `scripts/supabase-validate.sql`, `scripts/supabase-rls-integration.sql`, `supabase/migrations/*` e `docs/ORHA_PRODUCTION_EXECUTION_STATE.md`.

### Gates locais executados nesta auditoria

| Gate                                            | Resultado                                                                                                  |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                             | Aprovado fora do sandbox                                                                                   |
| `npm run lint`                                  | Aprovado                                                                                                   |
| `npm test`                                      | 89 arquivos e 376 testes aprovados                                                                         |
| `npm run build`                                 | Aprovado; 5.986 módulos, manifest e service worker gerados, precache de 104 entradas                       |
| `npm run audit:bundle`                          | Aprovado; entrada JS 293,1 KiB gzip, CSS 27,8 KiB gzip e maior lazy chunk 78,9 KiB gzip                    |
| `npm run check:catalog`                         | Aprovado                                                                                                   |
| `npm run audit:production-debt`                 | Aprovado; zero mock, seed, TODO e localStorage; ocorrências legadas explicitamente allowlisted             |
| `npm run audit:secrets`                         | Aprovado                                                                                                   |
| `npm run audit:text-encoding`                   | Aprovado                                                                                                   |
| `npm run test:e2e:staging:social`               | Aprovado 3/3; duas sessões reais, amizade, comunidade e conversa textual com Realtime/reload               |
| `npm run test:e2e:production`                   | Bloqueado no preflight por ambiente/secrets ausentes; nenhuma jornada foi falsamente marcada como aprovada |
| `npm audit --omit=dev --audit-level=high`       | Aprovado; zero vulnerabilidades                                                                            |
| `npx supabase db lint --linked --level warning` | Aprovado sem erros nem avisos                                                                              |

## Bloqueadores P0 — precisam ser eliminados antes de qualquer promoção

### P0.1 Corrigir os dois defeitos SQL de runtime — concluído em staging

O lint do PostgreSQL remoto encontrou:

1. `private.ensure_direct_conversation`: `conversation_id` é ambíguo entre variável PL/pgSQL e coluna. A função é usada no aceite de pedido de conversa e pode impedir a criação/reativação da conversa direta.
2. `public.mark_notifications_read`: `actor_id` é ambíguo entre variável e coluna. A função pode impedir marcar uma ou todas as notificações como lidas.

Evidência: `supabase/migrations/20260816170000_social_launch_schema.sql`, funções `private.ensure_direct_conversation` e `public.mark_notifications_read`; resultado de `npx supabase db lint --linked --level warning` em 2026-09-14.

Critério de aceite:

- criar migration forward-only, sem editar uma migration já aplicada;
- qualificar variáveis e colunas sem reduzir autorização;
- adicionar teste SQL de execução, não apenas teste textual;
- aplicar no staging;
- `supabase db lint` sem erros;
- repetir aceite de conversa, marcação individual e marcação total de notificações com dois usuários reais.

### P0.2 Implantar e operar as cinco Edge Functions — implantadas; catálogo/export/mídia autenticados aprovados

As cinco funções estão versionadas e `ACTIVE` no staging; produção continua sem promoção:

- `supabase/functions/account-export`;
- `supabase/functions/account-lifecycle-worker`;
- `supabase/functions/media-cleanup-worker`;
- `supabase/functions/media-verify`;
- `supabase/functions/catalog-search`.

`ORHA_CRON_SECRET` e `ORHA_ALLOWED_ORIGINS` foram provisionados no staging. O gate `npm run smoke:edge:anonymous` passou 7/7: todas rejeitam acesso anônimo com `401`, o preflight da origem permitida retorna `204` e uma origem externa recebe `403`. `pg_cron`, `pg_net`, Vault e os jobs de 5/10 minutos estão ativos; ambos os workers retornaram `200` em filas vazias. O teste revelou e corrigiu o parsing de um composto SQL nulo que antes causava retry inválido. Em 2026-09-14, Deno 2.8 também verificou os cinco entrypoints e executou 11/11 testes; esse gate encontrou e corrigiu o contrato `ArrayBuffer` do SHA-256 e um teste Vitest que estava indevidamente dentro da suíte Deno. `npm run check:edge` e `npm run test:edge` agora são obrigatórios no CI.

O novo gate `npm run smoke:edge:authenticated`, restrito por código ao projeto staging, passou 14/14. Ele criou uma conta efêmera confirmada, obteve sessão real por senha, consultou `catalog-search` com provedor externo, persistiu uma solicitação `data_export`, gerou e baixou o artefato privado, conferiu tamanho, SHA-256, schema, request e owner e repetiu a chamada idempotente. Na mesma execução, reservou mídia de perfil, realizou upload privado, comprovou inspeção binária/promoção pela Edge Function, signed URL, integridade do download, remoção assíncrona e cleanup físico + metadata. Objeto, export e usuário foram removidos no `finally`. Nenhum e-mail, senha, token, signed URL ou path privado foi impresso.

O gate `npm run smoke:worker:account-deletion` passou 17/17. Para desativação, ele rejeitou confirmação inválida, persistiu a restrição imediata e comprovou a conclusão pelo worker real. Para exclusão, persistiu a janela de arrependimento, tornou devida somente a solicitação efêmera, acionou `private.invoke_orha_worker` com o segredo lido internamente pelo Vault e comprovou remoção de Auth, perfil, Storage, lifecycle e tombstone, além de `account.deletion_completed`. `audit_logs` foi corretamente preservada porque é append-only inclusive para `postgres`; ela é evidência operacional anônima, não fixture mutável. A consulta final confirmou zero contas sintéticas e zero tombstones mutáveis.

O gate `npm run smoke:messaging:media` passou 18/18 com duas contas efêmeras: onboarding real, solicitação e aceite de conversa, texto em Realtime privado, imagem, áudio WAV, waveform, verificação binária, signed download, recibo, denúncia com retenção exata do anexo e evidência privada. O mesmo gate confirmou que os canais privados `notifications:<user>` e `support:<user>` alcançam readiness de replicação sem abrir escrita ao cliente. A pós-consulta confirmou zero contas, perfis e objetos sintéticos. A matriz permanente A/B/Admin/Moderador/Suporte continua sendo um gate maior e separado.

O gate `npm run smoke:social:domain` também passou 20/20 com duas contas efêmeras e cleanup verificado. Ele exerceu os repositories de produção contra o staging: descoberta de perfis, identidade de mensageria negada sem vínculo e autorizada por pedido, autoamizade negada, pedido/aceite/notificações, par idempotente, escrita direta privilegiada negada, comunidade com owner server-side, membership, autoridade de manager, post, comentário, reações, saída/reentrada, bloqueio global, desbloqueio e negação anônima. A matriz permanente A/B/Admin/Moderador/Suporte permanece necessária porque esse smoke não substitui navegador, e-mail, papéis administrativos nem evidência longitudinal entre dispositivos.

Critério de aceite:

- manter `ORHA_CRON_SECRET` e `ORHA_ALLOWED_ORIGINS` rotacionáveis por ambiente;
- manter as cinco funções com `verify_jwt` conforme `supabase/config.toml`;
- manter Cron/Vault de lifecycle e cleanup monitorados e rotacionáveis;
- manter check/test Deno 2 obrigatórios e verdes no CI;
- provar reserva → upload → verificação → associação → URL assinada → remoção → cleanup;
- provar exportação e exclusão com reconciliação idempotente;
- confirmar ausência de tokens, paths privados e conteúdo em logs.

### P0.3 Tirar o protótipo da URL pública

O workflow publica somente pushes da `main` (`.github/workflows/deploy-pages.yml`). A URL pública está no commit `b9ab9ca`, enquanto a fundação candidata `ada660f` está 23 commits à frente na branch auditada. A inspeção do Git em `main` encontrou:

- `src/app/authenticated-app.tsx` importando `PrototypeProvider`;
- `src/app/pages/home-page.tsx` importando `prototype-data`;
- `src/app/prototype-context.tsx` usando seeds de pessoas, comunidades e conversas.

Logo, o sucesso do workflow público atual não comprova o produto novo.

Critério de aceite:

- somente após todos os gates de staging, promover a cadeia validada à produção;
- executar o workflow candidato com E2E obrigatório;
- revisar e mesclar a branch na `main`;
- confirmar que o bundle implantado corresponde ao commit/release aprovado;
- procurar novamente `PrototypeProvider`, `prototype-data`, mock e seed no commit implantado.

### P0.4 Completar a matriz E2E real multiusuário — prova efêmera 3/3 concluída

O gate efêmero `npm run test:e2e:staging:social` passou 3/3 com duas contas criadas e removidas pelo runner e duas sessões de navegador independentes. A interface real comprovou amizade completa, comunidade com post/reação/comentário recuperados após reload e conversa consentida com pedido sem reload, aceite, deep link, entrega textual por Realtime e persistência. O gate também detectou e corrigiu invalidação de cache, projeções incompatíveis com RLS, dois embeds PostgREST inválidos, heading duplicado e uma asserção que confundia conteúdo do editor com gravação confirmada.

O preflight da matriz permanente ainda bloqueia por ausência de 22 valores operacionais, incluindo URL/key/host de staging, contas A/B/Admin/Moderador/Suporte, credenciais, service role exclusiva do runner, domínio catch-all e confirmação SMTP. A prova efêmera reduz risco nos domínios de amizade/comunidade, mas não substitui Auth por e-mail, papéis administrativos, suporte, moderação, chat/mídia no navegador nem evidência longitudinal entre dispositivos.

Evidência: `.env.e2e.example`, `scripts/require-production-e2e-secrets.ts`, `playwright.config.ts`, `e2e/*` e `.github/workflows/deploy-pages.yml`.

Critério de aceite:

- provisionar contas A/B/Admin/Moderador/Suporte isoladas e sem dados pessoais;
- configurar secrets/variables no ambiente protegido do GitHub;
- executar Auth, amizade, comunidade, conversa, perfil/mídia, trust/moderação, conta, offline e PWA;
- manter zero `skip`, zero interceptação e zero sessão injetada;
- repetir falhas até todas as jornadas ficarem verdes;
- preservar evidência de falha sem vazar sessão.

### P0.5 Remover vulnerabilidades de dependências que quebram o CI — concluído

O audit produtivo foi reexecutado em 2026-09-14 e retornou `found 0 vulnerabilities`. As dependências que antes quebravam o limite do CI foram atualizadas/removidas sem reintroduzir imports órfãos ou conflitos no catálogo.

Evidência preservada:

- `npm audit --omit=dev --audit-level=high`: zero vulnerabilidades;
- catálogo, TypeScript, ESLint, 364 testes, orçamento de bundle e build PWA verdes;
- E2E autenticado continua sendo um gate separado e não foi inferido deste resultado.

## Bloqueadores P1 — produto completo e operável

### P1.1 Auth externo e entrega real de e-mail

Os templates em português para confirmação, recuperação e alerta de senha alterada já estão versionados e testados. A tentativa de sincronização no staging foi rejeitada atomicamente pelo Supabase: projetos Free usando o mailer padrão não podem modificar templates; é necessário configurar custom SMTP ou fazer upgrade. Nenhum template parcial foi declarado como publicado.

Google continua ausente do frontend e corretamente desligado no remoto enquanto faltam client ID/secret. No staging, Site URL e seis redirects foram conferidos, confirmação de e-mail está ativa, senha mínima de 12 caracteres e composição forte foram sincronizadas, e a validação server-side da senha atual foi ativada. O cliente agora envia `current_password` no mesmo `updateUser`, com erro tipado e gate E2E para rejeição da senha incorreta. Custom SMTP está desligado, o mailer padrão está limitado a 2 e-mails/h e CAPTCHA/bot protection, templates e entrega real ainda não foram comprovados.

Próxima fatia vertical:

1. configurar SMTP transacional real, remetente e domínio autenticado;
2. validar cadastro, confirmação, reenvio, recovery e mudança de senha recebendo e-mail real;
3. manter Site URL/redirects do staging sincronizados e substituir o host legado pelo domínio definitivo quando provisionado;
4. implementar Google com callback seguro quando client ID/secret existirem;
5. configurar CAPTCHA/rate limits de Auth adequados ao lançamento;
6. testar sessão expirada, conta restrita, troca de usuário e limpeza de cache.

### P1.2 Host com deep links HTTP 200 e domínio definitivo

Verificação HTTP em 2026-09-14:

- raiz `https://tonyrodrigues98.github.io/social-orha/`: 200;
- `/social-orha/auth/login`: 404;
- `/social-orha/conversas/<uuid>`: 404.

Vercel foi selecionado como o próximo host por já existir um contrato versionado em `vercel.json`, sem dependência adicional de runtime. A configuração usa o preset Vite, `dist`, rewrite SPA e headers de cache/segurança. Em 2026-09-14, o rewrite foi reconciliado com a regra oficial de `cleanUrls`: o destino agora é `/`, sem a extensão `.html`.

O comando obrigatório `npm run build:vercel` passou a executar um preflight fail-closed: Preview só pode apontar para o projeto Supabase de staging; Production só pode apontar para o projeto Supabase de produção e também exige a configuração jurídica/de suporte pública. Ambos exigem raiz `/` e publishable key. O origin público pode ser derivado das system environment variables da Vercel, e um build sintético de Preview confirmou canonical e `og:url` corretos. Esse gate elimina promoção cruzada acidental, mas não substitui a prova no host.

O Preview Vercel do commit `28cae8b` concluiu o build em 52 s usando apenas as variáveis de staging. Em navegador autenticado, splash, `/auth/login` e o guard `/inicio` → `/auth/login?redirect=%2Finicio` foram comprovados. O gate HTTP externo, porém, encontrou `302` na raiz e nos três deep links porque “Vercel Authentication” ainda protege o Preview e envia visitantes anônimos ao SSO. Portanto, o deploy existe e está `Ready`, mas ainda não é um link público aceitável até essa proteção ser desligada conscientemente para Preview.

O `public/404.html` pode recuperar a navegação depois do 404, mas não satisfaz deep link, crawler, OAuth nem gate de host. O projeto já possui `scripts/host-capability-audit.ts` para impedir falso positivo.

Próxima fatia vertical:

- desligar a proteção SSO somente no Preview após confirmação explícita e repetir o gate HTTP até 4/4 respostas HTML `200`;
- manter variáveis separadas por escopo, com Preview em staging e Production ainda sem acesso até a promoção aprovada;
- configurar domínio, HTTPS, canonical, OG, PWA `id/scope/start_url` e callbacks Auth;
- exigir HTTP 200 no root e em todas as rotas diretas;
- executar smoke após deploy e rollback testado.

### P1.3 Produção Supabase e recuperação operacional

O staging está pronto para continuar os gates; produção permanece sem a cadeia social. Existe snapshot lógico pré-promoção documentado, mas não há PITR/backup físico confirmado.

Próxima fatia vertical:

- corrigir P0 e congelar hashes;
- repetir inventário e snapshot da produção imediatamente antes da promoção;
- obter backup/PITR proporcional ao risco ou registrar decisão operacional explícita;
- aplicar migrations na ordem com validação após cada fase;
- regenerar tipos a partir do remoto;
- implantar Functions/secrets/Cron;
- executar smoke remoto e plano de rollback.

### P1.4 Termos, privacidade, suporte e operação legal

`src/app/pages/settings-info-pages.tsx` agora consome uma configuração pública tipada para operador, controlador, endereço, foro, vigência, suporte e privacidade. O workflow executa `npm run audit:launch-config` antes do build e falha fechado se qualquer valor estiver ausente ou inválido. Em desenvolvimento, a interface permanece honesta e declara que esses dados não foram fornecidos; os valores reais ainda dependem de definição e aprovação externa e não foram inventados.

Critério de aceite:

- definir operador/controlador reais, contato, foro e política aprovada;
- configurar e testar suporte e privacidade;
- publicar termos/versionamento/consentimento necessários;
- preparar procedimento de denúncia, apelação, retenção, exportação e exclusão;
- definir escala humana para moderação e incidentes antes de abrir tráfego.

### P1.5 Prova de carga, observabilidade e resposta a incidentes — fundação consentida concluída

O repositório possui rate limits server-authoritative para amizade, pedidos de conversa, reports, posts, comentários e mensagens em `20260816230000_abuse_rate_limits.sql`. Os sete gates rollback-only foram reconciliados com o onboarding atômico e repetidos no staging no hash atual. O gate `scripts/supabase-rate-limit-integration.sql` comprovou `PT429`, rollback da mutação excedente, capacidade/auditoria mínima, bloqueio antes do consumo de quota e isolamento do estado privado; a pós-condição conjunta confirmou zero resíduos sintéticos de todos os gates. A fundação de analytics agora está completa: escolha owner-only no Supabase, desligada por padrão, timestamp do servidor, adapter PostHog lazy, reset por conta e allowlist sem conteúdo/URL/autocapture/replay. `docs/OBSERVABILITY_AND_INCIDENT_RESPONSE.md` define SLIs/SLOs, orçamento de erro, severidades, alertas e contenção; `npm run audit:bundle` impõe limites verificáveis no CI. Ainda não há key/host PostHog provisionados, prova de carga, dashboards, alertas externos ativos ou escala humana nomeada.

Critério de aceite:

- manter e calibrar os SLOs versionados de Auth, leitura/mutação social, chat, upload, PWA e Realtime com dados reais;
- medir p95/p99 e concorrência com dados sintéticos isolados;
- criar alertas para erros 5xx, Auth, Functions, banco, Storage e Realtime;
- provisionar o projeto PostHog e comprovar ingestão apenas depois do opt-in, usando a fundação já validada;
- validar rate limits e backpressure sob abuso;
- provisionar a escala humana privada e comprovar o runbook versionado com um exercício de incidente.

## P2 — qualidade de lançamento e fechamento funcional

### P2.1 Inspeção visual e de dispositivo completa — superfície pública automatizada

Playwright agora cobre seis viewports de iPhone, tablet retrato/paisagem, dois desktops, iPhone/WebKit e PWA. A matriz pública final passou `111/111`, incluindo guards, rotas, cadastro, recovery, 16 px, WCAG A/AA, alvos de toque, reduced motion, offline e ausência de OAuth Google falso. A matriz privada adicional passou `15/15`: cinco setups reais e os dez viewports percorrendo Início, Comunidade, Explorar, Conversas e Perfil com a11y, 16 px, alvos de toque, overflow, console/network e screenshots. Ela encontrou e corrigiu dois conflitos de tokens que deixavam texto escuro sobre superfícies escuras em Conversas e Perfil. O gate privado WebKit/iPhone 390×844 também passou `6/6`, com sessão Supabase renovada, as cinco áreas, reduced motion, a11y, console/network e screenshot. A expiração de sessão real passou `6/6`: refresh token revogado no Auth remoto, rejeição comprovada, retorno seguro ao login, recuperação do destino e persistência após reload. Rede móvel lenta e mídia privada ausente também passaram em gates `6/6`, sem interceptações: launch state preservado sob 650 ms de latência e fallback acionável sem imagem quebrada. Ainda faltam teclado aberto e aparelho iOS real instalado como PWA.

Aceite: screenshots e console/network limpos para 320×568, 375×667, 390×844, 393×852, 430×932, 440×932, tablet retrato/paisagem, 1280×800 e 1440×900, além de Safari/iPhone real instalado como PWA.

### P2.2 Escopo consciente de arquivos em conversa

`supabase/functions/README.md` restringe chat a imagem e áudio verificados e rejeita PDF/arquivo genérico até existir quarentena e antimalware. Isso é uma decisão segura, mas diverge do escopo funcional mais amplo que menciona “arquivos permitidos”.

Aceite: manter o recurso invisível no lançamento ou criar pipeline de quarentena, scanner, allowlist, limite e testes hostis antes de expô-lo. Nunca aceitar binário genérico apenas por MIME declarado pelo cliente.

### P2.3 Onboarding com conclusão autoritativa única — concluído em staging

`20260914090000_atomic_onboarding_completion.sql` removeu do papel `authenticated` a escrita direta de `onboarding_completed_at` e introduziu `complete_own_onboarding()`. A RPC valida o ator, o estado efetivo da conta, 18+, username, UF, cidade, bio e nome; deriva o timestamp no servidor e preserva o primeiro valor em retries. O cliente deixou de enviar relógio local para concluir o fluxo.

Evidência: ledger remoto alinhado; lint SQL sem erros; gate estrutural 23/23; `scripts/supabase-onboarding-integration.sql` passou com rollback, rejeitando perfil incompleto, UF inválida e escrita direta da coluna, além de provar conclusão válida e idempotência.

### P2.4 Superfícies operacionais de suporte e papéis — concluídas em staging

A moderação autoriza corretamente `super_admin`, `admin` e `moderator`; `support` não recebe autoridade de moderação. A rota `/suporte` reutiliza a fila chatcn e o Drawer GodUI sobre um domínio persistente separado de conversas privadas. Usuários leem apenas os próprios tickets; `support`, `admin` e `super_admin` podem listar, assumir, responder e atualizar. O gate `scripts/supabase-support-integration.sql` provou RLS, negação a outro usuário e ao moderador, escrita RPC-only, rate limits, auditoria e notificações, terminando em `ROLLBACK`.

A rota `/admin/funcoes` fornece busca sem e-mail e alteração por motivo obrigatório. O navegador nunca escreve `user_roles`: `assign_global_role` decide no PostgreSQL, impede mudança da própria função, restringe Admin a `user`/`support`/`moderator`, protege o último SuperAdmin, aplica rate limit, audita e notifica. O gate `scripts/supabase-role-management-integration.sql` comprovou os casos positivos e negativos com fixtures transacionais descartadas por `ROLLBACK`.

## P3 — pós-lançamento controlado

- Remover gradualmente as 171 ocorrências do namespace CSS `prototype` allowlisted, sem confundir nome legado com fonte de dados.
- Revisar peso dos chunks: `authenticated-app` ~268 KiB, entry ~357 KiB e chat ~179 KiB antes de gzip; medir em rede móvel real antes de otimização prematura.
- Expandir os eventos allowlisted pelo `AnalyticsPort` apenas quando métricas de produto forem aprovadas; nunca inserir PostHog/Umami diretamente nas páginas.
- Manter Cinema, Pet, Loja, Avatar e Jogos como destinos honestamente futuros em `src/app/pages/explore-page.tsx` até existirem fatias persistentes completas.
- Avaliar arquivos genéricos, push notifications e serviços Meilisearch/Gorse/Metarank somente por adapters e após demanda/infraestrutura aprovadas.

## Ordem exata das próximas fatias verticais

Cada item só começa quando o anterior possui evidência verde. Não promover parcialmente.

1. **Auth/e-mail em staging:** provisionar SMTP/remetente/domínio, templates, CAPTCHA e catch-all; provar cadastro, confirmação, reenvio e recuperação; Google somente com client ID/secret reais.
2. **QA native-first privada:** completar screenshots, teclado, gestos, iOS/Safari físico, rede lenta, offline/reconexão e PWA instalada nas áreas autenticadas.
3. **Operação:** fornecer os sete valores jurídico/suporte, nomear moderação humana, provisionar observabilidade/alertas, executar carga e exercício de incidente.
4. **Host/domínio:** retirar SSO apenas do Preview autorizado, provar deep links HTTP 200, configurar domínio/HTTPS/PWA/Auth callbacks e repetir smoke.
5. **Promoção Supabase:** renovar snapshot, obter recuperação proporcional ao risco, congelar hashes, aplicar migrations, tipos, Functions, secrets, Cron e smoke na produção.
6. **Release:** mesclar na `main`, workflow completo verde, verificar SHA implantado, criar tag/release e executar rollback testado.
7. **Smoke pós-release:** executar jornadas essenciais em produção com contas controladas, sem service role no navegador nem conteúdo falso.
8. **Go/no-go:** liberar tráfego apenas quando P0/P1 estiverem fechados e nenhuma função visível simular sucesso.

## Checklist de conclusão verificável

O projeto pode ser chamado de finalizado para as massas somente quando todas as respostas abaixo forem “sim” com evidência:

- A URL pública está no mesmo commit aprovado da branch candidata?
- `PrototypeProvider`, seeds e arrays falsos estão ausentes do bundle implantado?
- Produção possui as migrations, RLS, buckets, Realtime, Functions, secrets e jobs verificados?
- `supabase db lint` está sem erros?
- O audit de dependências está verde no limite do CI?
- E-mail real confirma, recupera e troca senha?
- Google OAuth funciona quando configurado?
- Upload de avatar, capa, galeria, post, imagem e áudio funciona entre dispositivos?
- Chat direto e grupos funcionam em Realtime, sem duplicação e com receipts?
- Amizade, bloqueio, privacidade e moderação são decididos no servidor?
- Exportação, desativação e exclusão completam de fato?
- Deep links devolvem o app com HTTP 200?
- PWA instalada abre, atualiza, preserva rascunho e reconecta honestamente?
- E2E multiusuário está verde sem interceptações, skips ou sessão falsa?
- Os viewports e aparelhos-alvo foram inspecionados sem erros críticos de console/network?
- Existe backup/rollback testado, observabilidade e responsável operacional?
- Termos, controlador, suporte e canal de privacidade estão publicados?

Enquanto qualquer resposta P0/P1 for “não”, o estado correto é **candidato em validação**, não produto finalizado.
