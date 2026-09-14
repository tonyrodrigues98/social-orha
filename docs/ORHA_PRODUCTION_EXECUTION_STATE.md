# ORHA — estado de execução Supabase

Atualizado em: 2026-09-14  
Branch: `codex/production-launch`  
Commit-base publicado antes deste checkpoint: `45a9eb0`
Projeto vinculado durante os gates: `bgeauxljwjbtbwpbzpoo` (ORHA-Staging)  
Produção: `iuaczhkfmwpyhtpdmuyt` (ORHA), ainda não promovida  
Estado: **staging saudável e alinhado às 22 migrations locais; 40 tabelas públicas com RLS, 16 tabelas Realtime, cinco Edge Functions ativas, gate anônimo/CORS 7/7 e dois jobs Cron/Vault ativos; Auth remoto sincronizado; onboarding atômico; suporte persistente, gestão global de papéis RPC-only e consentimento de analytics owner-only; produção intacta; lint remoto sem erros, gate estrutural 23/23 e matrizes RLS transacionais aprovadas**.

## Resumo executivo

O banco de produção ainda não recebeu a cadeia social desta branch. No staging isolado `bgeauxljwjbtbwpbzpoo`, as 22 migrations versionadas, de `20260811040000` a `20260914104000`, estão agora aplicadas e registradas no ledger remoto. O lint hospedado passa sem erros, o gate estrutural passou em 23/23 checks e as matrizes transacionais de RLS/onboarding/suporte/papéis globais/consentimento passaram integralmente, terminando em `ROLLBACK` sem fixtures residuais.

Em 2026-09-14, ambos os projetos foram confirmados como ativos no control plane e o staging como `Healthy` no Dashboard. A CLI foi autenticada pelo fluxo oficial no navegador e o workspace foi vinculado temporariamente ao staging. A primeira aplicação publicou `1800` a `2200`; `2300` falhou atomicamente por um alias SQL reservado e por uma pós-validação que não aceitava a serialização `search_path=""` do PostgreSQL hospedado. As duas causas foram corrigidas no SQL versionado. A retomada aplicou `2300`, `2400`, `2500` e `20260903010000` com sucesso. O único aviso final foi a impossibilidade de gerar cache local do catálogo porque Docker não está instalado; isso não afetou o commit remoto das migrations.

O schema local agora cobre identidade e privacidade, amizades sem follow, bloqueios, comunidades e conteúdo, conversas consentidas, mensagens e mídia, notificações, denúncias/moderação, ciclo de conta, Storage privado e Realtime. Processos que exigem autoridade de serviço — exclusão final de conta, exportação de dados, limpeza física de objetos e eventual cópia física de anexos — permanecem jobs operacionais/Edge, não ações simuladas no navegador.

As cinco Edge Functions estão `ACTIVE` no staging. `ORHA_CRON_SECRET` foi gerado criptograficamente em memória e provisionado junto de `ORHA_ALLOWED_ORIGINS`, sem gravar ou imprimir o valor. O gate reproduzível `npm run smoke:edge:anonymous` comprovou 7/7 checks: as cinco funções retornam `401` sem credenciais, a origem local exata recebe preflight `204` e uma origem externa recebe `403` sem header permissivo. A migration `20260914080000` instalou `pg_cron`/`pg_net` e funções privadas restritas a `postgres`; o Vault possui somente os nomes `orha_project_url` e `orha_cron_secret`. Os jobs `orha-account-lifecycle-worker` (5 min) e `orha-media-cleanup-worker` (10 min) estão ativos. Execuções idempotentes com filas vazias retornaram `200`: ciclo de conta com quatro contagens zero e mídia com oito filas zero. Fluxos autenticados com artefatos reais permanecem um gate separado.

## Inventário remoto confirmado

O inventário foi consultado pela Management API com o projeto já vinculado, sem imprimir tokens ou senhas:

```powershell
npx supabase db query --linked --file scripts/remote-inventory.sql --output-format json
```

Resultado confirmado pela execução autenticada:

- histórico remoto: somente migration `20260811040000`;
- tabelas públicas: `profiles`, `profile_details`, `profile_privacy`, `user_roles`;
- RLS habilitada nessas quatro tabelas;
- buckets Storage: zero;
- tabelas na publication `supabase_realtime`: zero;
- versão PostgreSQL observada no snapshot vinculado: 17.6;
- enforcement SSL de produção alterado de `false` para `true` pela CLI oficial; a leitura imediata do control plane confirmou `{database:true}`. O staging já estava com SSL obrigatório. Essa ação não alterou dados nem schema.

### Snapshot pré-promoção

Antes de qualquer promoção, foi criado e verificado um snapshot lógico mínimo da produção com `scripts/supabase-prelaunch-data-snapshot.sql`. O artefato v2 substitui o v1 como fonte operacional primária, está fora do repositório e foi criptografado por DPAPI `CurrentUser`, sem entropy adicional. Seu conteúdo não deve ser copiado para logs ou documentação:

- caminho operacional: `C:\Users\CPU\.codex\orha-backups\orha-production-prelaunch-20260816T222622Z-v2.json.dpapi`;
- SHA-256: `E1886B86C4E033F3F61B229B26D484ED6593A94672C5E9FA0C1642D232C941E7`;
- tamanho criptografado: 15.366 bytes;
- formato: `orha-prelaunch-v1`;
- inventário verificado: 1 usuário Auth, 1 identity, 1 profile, 1 profile_details, 1 profile_privacy e 1 user_role.

Uma descriptografia em processo Windows novo passou. O restore drill em staging vazio inseriu os seis conjuntos com interseção de colunas geradas, usou `session_replication_role` somente dentro da transação, verificou o subconjunto JSON e os relacionamentos FK, e terminou em `ROLLBACK`. As contagens posteriores permaneceram `auth_users=0` e `profiles=0`.

Esse snapshot lógico é recuperável e testado para o estado pré-lançamento capturado, mas não substitui Point-in-Time Recovery nem autoriza rollback destrutivo automático. O endpoint oficial continua informando zero backups e `PITR=false`; portanto, não existe recuperação física/ponto-no-tempo. Antes de restaurar qualquer dado, deve-se verificar novamente o hash, descriptografar somente no mesmo usuário Windows autorizado e comparar ledger/IDs com o inventário pós-falha.

### Gate transacional executado

Em 2026-08-16, as migrations `20260816130000` + `20260816170000` foram executadas integralmente contra o projeto vinculado dentro de `BEGIN ... ROLLBACK` pela Management API. Depois de duas correções sintáticas detectadas e revertidas pelos gates anteriores, a terceira execução retornou sucesso (`exit 0`, sem rows). O inventário imediatamente posterior confirmou que produção permaneceu intacta: somente `20260811040000`, quatro tabelas, zero buckets e zero tabelas Realtime.

Esse sucesso comprova apenas a revisão executada naquele momento. Depois dele, a migration recebeu mudanças materiais: validação das constraints herdadas, `community_memberships` no Realtime, cleanup de mídia pendente, status efetivo de restrições expiradas e projeções auditadas para conteúdo/anexos denunciados. Portanto, o gate transacional deve ser repetido com o hash corrente antes da promoção.

### Staging isolado

O projeto final de staging desta revisão é `bgeauxljwjbtbwpbzpoo`. A fundação `20260811040000`, o hardening `20260816130000` e o schema social `20260816170000` foram aplicados usando exatamente o hash C903 registrado abaixo. Uma tentativa anterior de preflight, em um staging descartado, havia falhado atomicamente antes de qualquer DDL porque o projeto hosted novo ainda não havia inicializado `realtime.messages`.

O Realtime foi então inicializado pelo caminho oficial, sem criar objetos internos manualmente:

1. configuração do serviço pela Management API com `suspend=false`, `presence_enabled=true` e `private_only=true`;
2. login temporário autenticado e tentativa de inscrição em um canal privado, que disparou as migrations gerenciadas pelo serviço;
3. remoção do usuário temporário;
4. verificação de que `realtime.messages` passou a existir antes da migration da aplicação.

O schema `realtime` é gerenciado e bloqueado pela Supabase. A migration ORHA apenas cria policies em `realtime.messages`; ela nunca cria, altera RLS ou substitui tabelas internas do fornecedor.

O primeiro `scripts/supabase-validate.ps1`, executado sobre uma revisão anterior, havia encontrado três divergências legítimas:

- o inventário ainda esperava nomes legados (`posts`, `comments`, `reactions`, `post_attachments`, `user_blocks`);
- `community_memberships` ainda não estava na publication;
- as 15 constraints `NOT VALID` do hardening ainda não haviam sido validadas.

As três causas foram corrigidas antes da reconstrução final. No staging `bgeauxljwjbtbwpbzpoo`, `scripts/supabase-validate.sql` retorna agora 23/23 checks aprovados, incluindo Cron/pg_net/Vault, onboarding server-authoritative, suporte operacional, papéis globais e consentimento de analytics. `scripts/supabase-rls-integration.sql` cobre anon, owner, outro usuário, amigo, bloqueado, membro, moderador comunitário, moderador global, admin, super-admin e suporte, além de Storage e Realtime; os scripts concluem com `ROLLBACK`, sem fixtures residuais.

No mesmo staging, o smoke de Auth passou: criação administrativa do usuário, login por senha via publishable key, leitura owner-only do perfil sob RLS e cleanup; o perfil novo nasceu corretamente com `onboarding_step = 0` e `onboarding_completed_at = null`.

O hash congelado aprovado no staging é:

- `20260816130000`: `78AB92778CD85EDD604E79C24B1708276D276CBB5445BEF8297CC10DB4D1E471`;
- `20260816170000`: `C903098ACC014624B16806748A63397A1FAF34877D03C87C8D4CE5A640AE98E3`.

As migrations forward seguintes já foram aplicadas, na ordem, no staging em 2026-09-14; seus gates de integração/RLS pós-aplicação ainda precisam ser repetidos antes de qualquer promoção:

- `20260816180000_edge_worker_contracts.sql`: aplicado;
- `20260816190000_explore_discovery.sql`: `046E07F8257352AE749F9116E97803943576C60304B26A1BA0077472942B8F63`;
- `20260816200000_conversation_preference_controls.sql`: favorito/limpeza por usuário e visibilidade autoritativa de mensagens; hash ainda não congelado;
- `20260816210000_profile_details_age_privacy.sql`: `09C766E036CDCB50EA23CE2E78FB0446936594FD19325083072DE6E203BED019`;
- `20260816220000_home_dashboard_summary.sql`: `20EE562075D507C54AFA89176D154FD8789B07F00AD67117DDEF5C4D271E5FE2`;
- `20260816230000_abuse_rate_limits.sql`: aplicado após correção validada transacionalmente pelo próprio staging;
- `20260816240000_notification_lifecycle_hardening.sql`: aplicado;
- `20260816250000_visible_community_post.sql`: aplicado;
- `20260903010000_group_conversation_lifecycle.sql`: aplicado; saída, transferência de owner e encerramento atômico de grupos.
- `20260914050000_worker_table_grant_hardening.sql`: aplicado;
- `20260914060000_audit_log_actor_anonymization.sql`: aplicado;
- `20260914070000_resolve_runtime_function_ambiguity.sql`: aplicado;
- `20260914080000_worker_scheduler_foundation.sql`: aplicado; `pg_cron`, `pg_net` e invocação privada via Vault.
- `20260914090000_atomic_onboarding_completion.sql`: aplicado; conclusão idempotente via `complete_own_onboarding`, timestamp do servidor e escrita direta da coluna revogada de `authenticated`; SHA-256 `171E4948ED53DE8506BADEF8A30019B9F6D3AC0413191F64A18E511BA6063428`.
- `20260914100000_support_ticket_operations.sql`: aplicado; tickets/mensagens separados do chat privado, RLS, rate limits, auditoria, notificações, Realtime e mutações RPC-only; SHA-256 `BDF9EB7936A04751D4715BA0D1005A8F5DA2ECD7A72A1D8EF40AF0D5044C451B`.
- `20260914101000_support_ticket_read_models.sql`: aplicado; projeções privadas com cursor estável e limite máximo para fila e mensagens; SHA-256 `6C7BEB2C24D85D7DDB5A071C7188C37BF2F033A98634C70F65BA62ABEB0087B8`.
- `20260914102000_role_management.sql`: aplicado; diretório sem e-mail, atribuição auditada, rate limit, proibição de autopromoção/escalada por Admin e proteção do último SuperAdmin; SHA-256 `60734E453211EAD1FEC83D3F79C42A87657EE18B9970B1F7543BABA1E284CFD1`.
- `20260914103000_role_management_read_type_fix.sql`: aplicado; mantém o contrato público `text` sobre o `citext` de username; SHA-256 `F2B55287A5962A1495CFFAA34828A35B59963D9D62152236EF14C438450DF0B8`.
- `20260914104000_analytics_consent.sql`: aplicado; analytics nasce desligado, somente o dono altera a escolha e o timestamp é derivado por trigger sem grant ao navegador; SHA-256 `C480E8B0751AE925DD30923BE204C5B2BE2AA73129E673166E2A64C7E8747185`.

Qualquer alteração posterior nesses arquivos invalida o resultado e exige staging descartável novo, reaplicação e repetição integral dos gates. A migration `20260816180000` e suas migrations posteriores estão aplicadas e cobertas pelos gates estruturais/RLS atuais; a execução funcional autenticada dos workers continua separada.

O script de inventário está em `scripts/remote-inventory.sql` e consulta apenas metadados: versão, migrations, tabelas públicas, RLS/policies, buckets e publication Realtime.

## Diferença entre remoto e migrations locais

| Camada | Remoto confirmado | Local preparado | Estado |
|---|---|---|---|
| Auth/onboarding | `20260811040000` | mesma fundação | aplicado |
| Privacidade de perfis | `20260816130000_security_privacy_hardening.sql` | owner-only + RPC mascarada + amizades | aplicado e validado |
| Social de lançamento | `20260816170000_social_launch_schema.sql` + suporte | 40 tabelas públicas protegidas | aplicado e validado |
| Workers/lifecycle | `20260816180000_edge_worker_contracts.sql` + cinco Edge Functions | mesma implementação versionada | implantado; jornadas autenticadas pendentes |
| Explore/chat/perfil/Home | `20260816190000` → `20260816220000` | mesma cadeia | aplicado e validado estruturalmente |
| Antiabuso/notificações | `20260816230000` → `20260816240000` | mesma cadeia | aplicado e validado estruturalmente |
| Storage | cinco buckets privados e policies | mesma configuração | aplicado; mídia autenticada pendente |
| Realtime | 16 tabelas + Broadcast/Presence privados | mesma configuração | aplicado; jornada multiusuário persistente ainda pendente |
| Suporte | tickets, mensagens, 6 RPCs, rate limits e audit log | rota `/suporte`, Drawer GodUI e fila chatcn | aplicado e gate transacional aprovado |
| Papéis globais | `user_roles`, 2 RPCs, rate limit, notificação e audit log | rota `/admin/funcoes` e atalhos operacionais por papel | aplicado e gate transacional aprovado |
| Analytics consentido | `user_settings.analytics_enabled` + timestamp do servidor | PostHog lazy atrás do `AnalyticsPort`, allowlist de eventos e Configurações > Dados | aplicado e gate transacional aprovado; serviço externo ainda sem key |
| Jobs privilegiados | Cron/Vault, funções privadas e dois jobs ativos | mesma configuração versionada | implantado e smoke de fila vazia aprovado |

A migration `20260816170000` depende explicitamente das duas anteriores. Ela não deve ser executada isoladamente.

Ela não contém `BEGIN`, `COMMIT`, índices concorrentes nem chamadas HTTP/Storage externas, portanto pode ser envolvida por `BEGIN ... ROLLBACK` no gate transacional. A migration é deliberadamente one-shot: se alguma tabela de lançamento já existir, a precondição falha antes de mutar estado. Depois de rollback completo ela é retry-safe; depois de commit, a idempotência pertence ao ledger `supabase_migrations`, e replay manual é proibido.

## Contrato local de lançamento

### Segurança e privacidade

- tabelas cruas de perfil continuam owner-only;
- descoberta usa `get_visible_profiles`/`search_visible_profiles`, com máscara de localização, favoritos e galeria;
- bloqueios são bidirecionais para visibilidade/contato, embora o registro pertença apenas ao bloqueador;
- `get_own_blocked_profile_by_username` resolve somente bloqueios criados pelo próprio usuário; bloqueio inverso continua indistinguível de perfil privado/inexistente;
- comunidades privadas continuam fechadas nas tabelas cruas; `get_community_discovery` projeta somente metadata/counts mínimos, block-aware, para deep link e pedido de entrada pendente;
- administração comunitária é RPC-only: `update_community_details`, `upsert_community_rule`, `delete_community_rule`, promoção/rebaixamento owner-only, ban/unban auditados e `archive_community` owner-only;
- `archive_community` encerra memberships, remove logicamente posts, bloqueia mídia antes do cleanup e grava auditoria na mesma transação;
- remoção de posts/comentários usa `remove_community_post`/`remove_post_comment`; status e campos de auditoria não são graváveis diretamente pelo navegador;
- não existe follow;
- amizade aceita e pedido de conversa são domínios independentes;
- `support` não recebe autoridade de moderação; somente `super_admin`, `admin` e `moderator`;
- `support`, `admin` e `super_admin` operam exclusivamente a fila de suporte; moderador não herda esse acesso;
- somente `super_admin` e `admin` acessam a gestão global de papéis; Admin administra apenas `user`/`support`/`moderator`, SuperAdmin não altera a própria função, o último SuperAdmin é preservado e toda mudança exige motivo, rate limit, auditoria e notificação;
- restrições/suspensões temporárias vencidas são derivadas como `active` no servidor; `reconcile_expired_profile_restrictions` persiste a transição e audita o evento;
- browser clients não recebem grants para IDs, roles, status de moderação ou timestamps de auditoria;
- `audit_logs` é append-only.

### Domínios persistentes

- perfis/mídia: `profile_media`;
- segurança: `blocks`, `profile_moderation_state`;
- preferências: `notification_preferences`, `user_settings`;
- ciclo da conta: `account_lifecycle_requests`;
- comunidades: `communities` (inclui `category` indexada para Explore), `community_memberships`, `community_rules`;
- conteúdo: `community_posts`, `post_media`, `post_comments`, `post_reactions`;
- conversa: `conversations`, `conversation_members`, `conversation_preferences`, `conversation_requests`;
- mensagens: `messages`, `message_reactions`, `message_attachments`, `message_receipts`;
- confiança: `notifications`, `reports`, `report_evidence`, `moderation_cases`, `sanctions`, `audit_logs`.
- suporte: `support_tickets`, `support_ticket_messages`, com leitura paginada e escrita exclusivamente por RPC.

### Storage privado

| Bucket | Limite | MIME permitido | Leitura |
|---|---:|---|---|
| `profile-media` | 10 MiB | JPEG, PNG, WebP, AVIF | dono ou perfil/galeria permitido pela privacidade |
| `community-media` | 25 MiB | imagens anteriores + MP4 | post `ready` visível, branding comunitário descobrível ou moderador enquanto o report e o conteúdo continuam ativos |
| `chat-media` | 25 MiB | imagens e áudio WebM/MP4/MPEG/OGG/WAV | membros ativos da conversa ou moderador quando o anexo pertence à mensagem denunciada |
| `report-evidence` | 10 MiB | JPEG, PNG, WebP | somente moderadores; upload somente pelo denunciante no report aberto |
| `account-exports` | 25 MiB | JSON gerado pelo worker | somente o dono do artefato autenticado; escrita e cleanup apenas por `service_role` |

O SQL configura `storage.buckets` e policies, mas nunca insere, atualiza ou apaga linhas de `storage.objects`. Upload, remoção e limpeza física usam a Storage API, conforme o modelo oficial do Supabase.

Trocas de avatar/capa deixam a mídia anterior em `deleting`. Reservas `pending` ou `failed` há mais de uma hora também entram no cleanup. Um worker `service_role` consulta `list_profile_media_cleanup`, remove o objeto pela Storage API e só então chama `complete_profile_media_cleanup`; o contrato é idempotente e não apaga metadata enquanto o objeto ainda existe.

Mídia de post usa o pipeline `reserve_post_media` → upload Storage → `finalize_post_media`. O path é estruturado como `<profile_id>/post/<post_id>/<media_id>.<ext>` e a policy de upload exige uma reserva `pending` exata. `remove_post_media`, remoção do post, arquivamento da comunidade e sanção de moderação promovem metadata para `deleting`, negando leitura antes da exclusão física. O worker consulta `list_post_media_cleanup`, remove o objeto e chama `complete_post_media_cleanup` somente quando o objeto já não existe.

Branding comunitário usa `<profile_id>/community/<community_id>/avatar|cover/<media_id>.<ext>` e exige que o uploader seja manager daquela comunidade. `update_community_details` só referencia objeto `community-media` já existente e pertencente ao ator.

Moderação usa duas projeções `SECURITY DEFINER`: `get_moderation_report_context` retorna somente o snapshot imutável do alvo denunciado, e `get_moderation_report_attachment` retorna metadata/path de um único anexo retido por aquele report. Ambas exigem moderator global e gravam auditoria; elas nunca projetam a thread privada ao redor da mensagem. O snapshot textual limitado a 32 KiB permanece no registro auditável do report/case; referências e evidências binárias expiram 180 dias depois de o caso ficar terminal, enquanto caso aberto estende a retenção. FKs de owner/reporter/uploader viram `null` após exclusão da conta.

Uma signed URL já emitida não pode ser revogada retroativamente pelo SQL; novas emissões são negadas após sanção, mas a URL anterior vive até o TTL. O cliente de moderação deve usar TTL mínimo (preferencialmente 60 segundos) ou download autenticado por requisição.

MIME, tamanho, owner e path são validados no banco/bucket. As Edge Functions implantadas no staging também verificam assinatura binária, compatibilidade MIME e dimensões decodificadas antes da promoção server-side; o smoke anônimo/CORS foi aprovado, mas a jornada autenticada de mídia ainda precisa comprovar o ciclo completo. PDF e arquivos genéricos foram retirados do contrato de lançamento porque exigiriam quarentena e inspeção antimalware. Canvas no cliente é otimização, não fronteira de confiança.

Forward de anexos usa uma cópia lógica autorizada (`forwarded_from_attachment_id`) para o mesmo objeto privado. Isso evita duplicar binário via SQL e adiciona a conversa de destino à autorização de leitura. Uma futura política de retenção pode materializar cópias físicas por worker se houver necessidade operacional.

Quando moderação remove uma mensagem, o banco marca imediatamente os anexos e todos os forwards descendentes como removidos; RLS, projeções de moderação e Storage negam a mídia antes do cleanup físico. O worker `service_role` processa folhas com `list_message_attachment_cleanup`, preserva objetos ainda referenciados e finaliza metadata com `complete_message_attachment_cleanup` somente depois de confirmar a ausência do objeto original.

### Realtime

- Postgres Changes: 16 tabelas — amizades, bloqueios, memberships/conteúdo comunitário, members/requests/preferences/messages/reactions/attachments/receipts, notificações, tickets e mensagens de suporte;
- Broadcast/Presence: policies em `realtime.messages` aceitam apenas o tópico `conversation:<uuid>` e exigem membership ativo;
- o lançamento usa Postgres Changes pela simplicidade; Broadcast é o caminho de escala já protegido por RLS.
- em projeto hosted novo, `realtime.messages` pode aparecer somente depois que o serviço Realtime executa suas migrations; o bootstrap suportado é habilitar/retomar o serviço pela Dashboard/Management API e abrir um canal privado autenticado temporário;
- criar `realtime.messages` manualmente é proibido: o schema pertence ao serviço, e a migration falha cedo com instrução operacional quando a tabela gerenciada ainda não existe.

### Ciclo da conta

- `data_export`: entra na fila imediatamente;
- `deactivate`: bloqueia os helpers sociais imediatamente;
- `delete`: bloqueia acesso social imediatamente e agenda execução final para 30 dias;
- `cancel_account_lifecycle` cancela pedido ainda pendente e só remove a restrição criada por aquele pedido;
- delete final de `auth.users`, exportação, revogação global e purge de Storage pertencem a um worker/Edge com `service_role` e trilha de auditoria.

Para `deactivate`/`delete`, o cliente prova a senha atual com `signInWithPassword`, verifica o mesmo `user.id` e só então chama a RPC; a checagem de `iat <= 10 minutos` no banco é defesa adicional. Para troca de senha, o cliente envia `current_password` no mesmo `updateUser`, e o GoTrue hospedado valida a senha atual server-side.

## Auth remoto parcialmente confirmado

Evidência obtida no Dashboard e pela CLI oficial, sem copiar secrets para logs:

- Site URL do staging: `http://127.0.0.1:4173`;
- redirects exatos: previews locais `4173`/`5173`, LAN existente e GitHub Pages legado;
- signup por e-mail e confirmação de e-mail: ativos; anônimo e manual linking: desligados;
- senha mínima: 12; maiúscula, minúscula, número e símbolo obrigatórios;
- `Require current password when updating`: ativo e reaberto no Dashboard para comprovar persistência;
- OTP: oito dígitos, expiração 3600 segundos;
- Auth rate limits sincronizados: refresh 150/5 min, verificação 30/5 min, signup/login 30/5 min e e-mail 2/h no mailer padrão;
- Google e demais OAuth: desligados; nenhum botão falso deve aparecer;
- custom SMTP: desligado; entrega de produção continua bloqueada até provisionar domínio/remetente/credenciais;
- leaked-password protection: indisponível no plano Free;
- nonce por e-mail para sessão antiga (`Secure password change`): desligado; a ORHA usa a validação server-side da senha atual, sem fluxo de OTP incompleto.

`npx supabase config push --project-ref bgeauxljwjbtbwpbzpoo` confirmou API, banco, SSL, Auth e Storage como `up_to_date`. `storage.vector` foi alinhado para `false`, pois o staging Free rejeita esse recurso pago. Ainda faltam CAPTCHA/bot protection, templates/entrega SMTP real, jornadas de confirmação/reset e revisão de MFA/sessões.

## Gates concluídos e próximos gates

- concluído: snapshot pré-promoção da produção, hashes e isolamento do staging;
- concluído: 22 migrations ledgered, lint SQL remoto, validação estrutural 23/23 e matrizes RLS/Storage/Realtime/onboarding/suporte/papéis globais/consentimento com rollback;
- concluído: cinco Edge Functions ativas, CORS/anon 7/7, Cron/Vault e workers com filas vazias;
- concluído nesta fatia: Auth config sincronizada, política de senha endurecida e contrato do cliente atualizado para `current_password`;
- concluído nesta fatia: onboarding finalizado somente por RPC autenticada e idempotente; o gate transacional rejeitou perfil incompleto, UF inválida e escrita direta do timestamp, aceitou o perfil válido e preservou o primeiro timestamp no retry;
- concluído nesta fatia: validação visual e automatizada do Auth/PWA em `320×568`; todos os campos editáveis permanecem em 16 px, o cadastro rejeita senha abaixo de 12 caracteres, o aviso offline não cobre nem intercepta o CTA após o scroll e o botão Voltar conserva pelo menos 44 px durante a animação;
- concluído nesta fatia: canal de suporte persistente na rota `/suporte`; solicitante vê apenas os próprios tickets, `support`/`admin`/`super_admin` operam a fila, moderador não herda acesso, respostas e estados notificam sem copiar o corpo privado; o gate transacional terminou em `ROLLBACK`.
- concluído nesta fatia: gestão global de papéis na rota `/admin/funcoes`, com busca sem e-mail, UI por papel, autoridade no PostgreSQL, menor privilégio de tabela, proteção contra escalada e log de auditoria; `scripts/supabase-role-management-integration.sql` passou com `ROLLBACK`.
- concluído nesta fatia: consentimento de analytics persistido no Supabase e desligado por padrão; PostHog é importado somente após opt-in, bloqueia autocapture/replay/URLs/conteúdo e aceita apenas eventos técnicos allowlisted; `scripts/supabase-analytics-consent-integration.sql` provou owner, negação cross-user e timestamp server-side com `ROLLBACK`.
- concluído nesta fatia: orçamento de bundle versionado e obrigatório no CI; contrato operacional define SLOs de Auth/social/chat/Realtime/upload/PWA, orçamento de erro, alertas, severidades e contenção sem declarar integrações externas ainda inexistentes.
- concluído nesta fatia: o contrato E2E usa cinco sessões Supabase nomeadas e distintas — A, B, Admin, Moderador e Suporte —; a jornada de moderação usa o papel mínimo correto; suporte persistente e a matriz negativa/positiva de autoridade por rota possuem jornadas próprias; o CI exige os 22 valores operacionais e falha fechado antes de abrir o navegador.
- concluído nesta fatia: os sete gates remotos rollback-only foram reconciliados com o onboarding atômico atual e repetidos no staging: onboarding, notificações, abuso, suporte, papéis, analytics e RLS/Storage/Realtime. O gate de abuso comprovou `PT429`, rollback da mutação excedente, contadores limitados, auditoria sem conteúdo/target, bloqueio antes do consumo de quota e isolamento das tabelas/funções privadas. A leitura posterior confirmou zero resíduos em Auth, perfis, contadores, tickets, notificações e auditoria para todos os IDs reservados.
- concluído nesta fatia: o setup das cinco sessões E2E valida o `sub` real, rejeita subjects duplicados e consulta no processo Node o onboarding e o papel exato de cada conta em `user_roles`; divergência entre nome configurado e autoridade do backend interrompe o gate antes das jornadas.
- concluído nesta fatia: termos, privacidade e contato consomem uma configuração pública tipada e validada; o workflow exige operador, controlador, endereço, foro, data de vigência, e-mail de suporte e e-mail de privacidade antes do build de deploy. Desenvolvimento sem esses dados continua exibindo avisos honestos, mas a publicação falha fechada em vez de liberar placeholders.
- concluído nesta fatia: Vercel foi selecionado como host rewrite-capable usando o contrato já existente, sem adicionar infraestrutura paralela; `cleanUrls` e o rewrite SPA foram corrigidos para o destino oficial `/`. A inspeção no Chrome confirmou que não há sessão Vercel autenticada, então nenhum projeto externo foi criado e o gate HTTP continua pendente.
- gates atuais: matriz E2E pública completa `111/111`, inclusive WebKit 390×844 após reforço dos alvos de toque canônicos contra arredondamento subpixel; guards/deep links de `/suporte` e `/admin/funcoes` revalidados em `66/66` nos 11 projetos públicos; Playwright descobre 128 execuções em 16 arquivos — 111 públicas, 12 jornadas autenticadas e cinco setups de sessão —; Vitest `345/345` em 79 arquivos, catálogo, TypeScript, ESLint, secrets, encoding, dívida de produção, auditoria de dependências, orçamento de bundle e build PWA com 103 entradas aprovados;
- pendente: fornecer e aprovar os sete valores públicos reais do gate jurídico/de suporte; nenhuma identidade, endereço, foro ou e-mail foi inventado ou presumido;
- pendente: custom SMTP + domínio de envio, CAPTCHA e jornadas reais de confirmação/reenvio/reset;
- pendente: contas sintéticas A/B/Admin/Moderador/Suporte e execução das jornadas autenticadas completas já contratadas, inclusive suporte, autoridade por papel e rejeição da senha atual incorreta;
- pendente: mídia real, Realtime multiusuário, QA native-first/PWA, host definitivo, provisionamento do PostHog/dashboards/alertas, prova de carga, escala humana e promoção controlada da produção.

## Limitações conhecidas do ambiente atual

- Docker/Podman não está disponível neste workspace; `supabase status/db reset` não pode executar o banco local;
- os testes locais continuam sendo estáticos/contratuais, mas o schema social também passou por aplicação SQL real, 23/23 validações e gates transacionais de RLS, onboarding, suporte, papéis globais e consentimento com `ROLLBACK` no staging `bgeauxljwjbtbwpbzpoo`;
- todas as 22 migrations locais estão aplicadas no staging; produção permanece sem promoção;
- buckets, publication e policies do staging foram criados pelas migrations e cobertos pela repetição integral dos gates estrutural e RLS/Storage/Realtime;
- os workers estão implantados, protegidos por bearer próprio, agendados por Cron/Vault e aprovados com filas vazias no staging; jornadas autenticadas de exportação, delete final, purge e retenção ainda precisam ser comprovadas antes do lançamento público;
- as Edge Functions de mídia estão implantadas e passam o gate anônimo/CORS; PDF/arquivo genérico permanece fora do lançamento até existir quarentena e antimalware.

## Referências oficiais

- [Supabase CLI e migrations](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Checklist de produção](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control)
- [Storage schema](https://supabase.com/docs/guides/storage/schema/design)
- [Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization)
- [Realtime Settings](https://supabase.com/docs/guides/realtime/settings)
- [Management API — Realtime config](https://supabase.com/docs/reference/api/getting-started)
- [Realtime schema locked down](https://supabase.com/changelog/realtime-schema-locked-down-against-modification)
