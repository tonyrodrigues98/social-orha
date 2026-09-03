# ORHA — estado de execução Supabase

Atualizado em: 2026-09-03  
Projeto vinculado: `iuaczhkfmwpyhtpdmuyt`  
Estado: **produção intacta e com snapshot pré-promoção; projetos remoto e staging atualmente pausados pelo Supabase; schema social C903 aprovado anteriormente em staging isolado**.

## Resumo executivo

O banco de produção ainda contém somente a fundação inicial de Auth/onboarding. A correção de privacidade e o schema social de lançamento existem como migrations locais forward-only e nunca foram promovidos à produção. No staging isolado `bgeauxljwjbtbwpbzpoo`, o hash congelado C903 do schema social foi aplicado com sucesso, passou por 14/14 validações estruturais e pelo gate RLS transacional completo, que terminou em `ROLLBACK` e deixou as contagens de fixtures em zero.

Em 2026-09-03, a CLI autenticada confirmou `status=INACTIVE` tanto para produção quanto para staging. Tentativas de `supabase link` foram recusadas com `LegacyProjectPausedError`; nenhuma migration foi aplicada. A retomada dos projetos no painel Supabase é pré-condição externa para repetir os gates remotos. O vínculo local foi restaurado para a referência de produção após a inspeção.

O schema local agora cobre identidade e privacidade, amizades sem follow, bloqueios, comunidades e conteúdo, conversas consentidas, mensagens e mídia, notificações, denúncias/moderação, ciclo de conta, Storage privado e Realtime. Processos que exigem autoridade de serviço — exclusão final de conta, exportação de dados, limpeza física de objetos e eventual cópia física de anexos — permanecem jobs operacionais/Edge, não ações simuladas no navegador.

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

As três causas foram corrigidas antes da reconstrução final. No staging `bgeauxljwjbtbwpbzpoo`, `scripts/supabase-validate.sql` retornou 14/14 checks aprovados. Em seguida, `scripts/supabase-rls-integration.sql` cobriu anon, owner, outro usuário, amigo, bloqueado, membro, moderador comunitário, moderador global, admin, super-admin e suporte, além de introspecção de Storage e Realtime; o script concluiu com `ROLLBACK`, e a verificação posterior confirmou zero linhas residuais das fixtures.

No mesmo staging, o smoke de Auth passou: criação administrativa do usuário, login por senha via publishable key, leitura owner-only do perfil sob RLS e cleanup; o perfil novo nasceu corretamente com `onboarding_step = 0` e `onboarding_completed_at = null`.

O hash congelado aprovado no staging é:

- `20260816130000`: `78AB92778CD85EDD604E79C24B1708276D276CBB5445BEF8297CC10DB4D1E471`;
- `20260816170000`: `C903098ACC014624B16806748A63397A1FAF34877D03C87C8D4CE5A640AE98E3`.

As migrations forward seguintes já têm contratos locais, mas não fazem parte da aprovação C903 e precisam ser reaplicadas, na ordem, em staging descartável antes de qualquer promoção:

- `20260816180000_edge_worker_contracts.sql`: workers, validação de mídia, lifecycle e retenção de evidência; hash ainda não congelado;
- `20260816190000_explore_discovery.sql`: `046E07F8257352AE749F9116E97803943576C60304B26A1BA0077472942B8F63`;
- `20260816200000_conversation_preference_controls.sql`: favorito/limpeza por usuário e visibilidade autoritativa de mensagens; hash ainda não congelado;
- `20260816210000_profile_details_age_privacy.sql`: `09C766E036CDCB50EA23CE2E78FB0446936594FD19325083072DE6E203BED019`;
- `20260816220000_home_dashboard_summary.sql`: `20EE562075D507C54AFA89176D154FD8789B07F00AD67117DDEF5C4D271E5FE2`;
- `20260816230000_abuse_rate_limits.sql`: rate limits server-authoritative; hash e gate remoto pendentes;
- `20260816240000_notification_lifecycle_hardening.sql`: produtores/dedupe/contexto tipado de notificações; hash e gate remoto pendentes.
- `20260816250000_visible_community_post.sql`: deep link autoritativo de publicação comunitária; hash e gate remoto pendentes.
- `20260903010000_group_conversation_lifecycle.sql`: saída, transferência de owner e encerramento atômico de grupos; SHA-256 `DCF36B5DA75D7D255682104F8B409EB066259EE5C9B595F6DDA7A85A8BE1986F`; gate remoto pendente.

Qualquer alteração posterior nesses arquivos invalida o resultado e exige staging descartável novo, reaplicação e repetição integral dos gates. A migration `20260816180000` dos workers privilegiados permanece um gate separado e ainda não está coberta por esta aprovação C903.

O script de inventário está em `scripts/remote-inventory.sql` e consulta apenas metadados: versão, migrations, tabelas públicas, RLS/policies, buckets e publication Realtime.

## Diferença entre remoto e migrations locais

| Camada | Remoto confirmado | Local preparado | Estado |
|---|---|---|---|
| Auth/onboarding | `20260811040000` | mesma fundação | aplicado |
| Privacidade de perfis | leitura crua ampla da fundação inicial | `20260816130000_security_privacy_hardening.sql`: owner-only + RPC mascarada + amizades | pendente |
| Social de lançamento | ausente | `20260816170000_social_launch_schema.sql` | pendente |
| Workers/lifecycle | ausente | `20260816180000_edge_worker_contracts.sql` + Edge Functions versionadas | pendente de gate/deploy |
| Explore/chat/perfil/Home | ausente | `20260816190000` → `20260816220000` | pendente |
| Antiabuso/notificações | ausente | `20260816230000` → `20260816240000` | pendente |
| Storage | nenhum bucket | cinco buckets privados e policies | pendente |
| Realtime | nenhuma tabela publicada | Postgres Changes + Broadcast/Presence privados | pendente |
| Jobs privilegiados | não inventariados | contratos persistentes e código Edge local, sem worker remoto implantado | pendente |

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

MIME, tamanho, owner e path são validados no banco/bucket. As Edge Functions versionadas também verificam assinatura binária, compatibilidade MIME e dimensões decodificadas antes da promoção server-side; elas ainda não estão implantadas no remoto. PDF e arquivos genéricos foram retirados do contrato de lançamento porque exigiriam quarentena e inspeção antimalware. Canvas no cliente é otimização, não fronteira de confiança.

Forward de anexos usa uma cópia lógica autorizada (`forwarded_from_attachment_id`) para o mesmo objeto privado. Isso evita duplicar binário via SQL e adiciona a conversa de destino à autorização de leitura. Uma futura política de retenção pode materializar cópias físicas por worker se houver necessidade operacional.

Quando moderação remove uma mensagem, o banco marca imediatamente os anexos e todos os forwards descendentes como removidos; RLS, projeções de moderação e Storage negam a mídia antes do cleanup físico. O worker `service_role` processa folhas com `list_message_attachment_cleanup`, preserva objetos ainda referenciados e finaliza metadata com `complete_message_attachment_cleanup` somente depois de confirmar a ausência do objeto original.

### Realtime

- Postgres Changes: 14 tabelas — amizades, bloqueios, memberships/conteúdo comunitário, members/requests/preferences/messages/reactions/attachments/receipts e notificações;
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

Para email/senha, o cliente deve provar a senha atual com novo `signInWithPassword`, verificar o mesmo `user.id` e só então chamar a RPC. A checagem de `iat <= 10 minutos` no banco é defesa adicional; refresh silencioso isolado não deve ser tratado como reautenticação.

## Auth remoto ainda não confirmado

SQL de inventário não retorna com segurança toda a configuração GoTrue hospedada. Portanto, ainda precisam ser verificados no Dashboard/Management API, sem copiar secrets para logs:

- Site URL e allow-list exata para `https://tonyrodrigues98.github.io/social-orha/`;
- confirmação de email e templates;
- comprimento/política de senha;
- rotação/reuso de refresh token;
- rate limits e proteção contra bots;
- SMTP de produção;
- MFA e provedores externos efetivamente habilitados.

O `supabase/config.toml` local é intenção de configuração, não prova do remoto. Ele define confirmação de email, senha mínima de oito caracteres, rotação de refresh token, cadastro anônimo desativado e TOTP disponível.

## Gates obrigatórios antes de aplicar

### Precondições verificadas pelo próprio SQL

- fundação `profiles/profile_details/profile_privacy/user_roles` presente;
- hardening `friendships` + `get_visible_profiles(uuid,integer,integer)` presente;
- nenhuma tabela sentinela de lançamento (`blocks`, `communities`, `conversations`, `reports`) já existente;
- `storage.buckets`, `storage.objects`, `realtime.messages` e publication `supabase_realtime` presentes;
- quando `realtime.messages` estiver ausente, inicializar o serviço oficial e repetir o preflight; nunca suprir a ausência com DDL de aplicação.

### Pós-condições verificadas pelo próprio SQL

- a migration social verifica suas 27 tabelas de lançamento; a validação da cadeia até `20260816240000` exige 38 tabelas públicas com RLS;
- `anon` não possui grants de mutação e não recebe leitura crua das tabelas protegidas;
- os cinco buckets existem e continuam privados;
- policies privadas SELECT/INSERT existem em `realtime.messages`;
- as 14 tabelas de evento estão na publication após `conversation_preferences`;
- RPCs críticas de busca, mensagem idempotente, denúncia/contexto de moderação, status efetivo, lifecycle, perfil/idade, Home e cleanup de rate limit existem.

Qualquer falha nessas pós-condições levanta erro e deve reverter a transação inteira.

1. **Snapshot repetível**
   - repetir `scripts/remote-inventory.sql`;
   - verificar o SHA-256 do snapshot DPAPI pré-promoção e preservar o artefato fora do repositório;
   - salvar o JSON fora do repositório se contiver dados operacionais;
   - confirmar que o remoto continua apenas em `20260811040000`;
   - calcular e registrar SHA-256 de cada migration pendente, na ordem `20260816130000` → `20260816240000`.
   - depois de `20260816130000`, executar `scripts/supabase-hardening-audit.sql`; todas as 15 contagens devem ser zero antes do `VALIDATE CONSTRAINT` de `20260816170000`.

2. **Gate estático local**
   - `npm run typecheck`;
   - executar os testes contratuais de todas as migrations, incluindo Edge workers, Explore, conversa, perfil/idade, Home, antiabuso e notificações;
   - `npm run audit:secrets` e confirmar que `.env.local` ignorado não é lido nem valores são impressos;
   - `npm run lint` para os arquivos alterados;
   - `npm run build`.

3. **Gate SQL real em staging**
   - usar projeto/branch Supabase descartável com PostgreSQL 17;
   - confirmar Realtime ativo/private-only e `to_regclass('realtime.messages')` não nulo antes da aplicação;
   - aplicar a cadeia ledgered, sem saltos: `20260816130000`, `20260816170000`, `20260816180000`, `20260816190000`, `20260816200000`, `20260816210000`, `20260816220000`, `20260816230000` e `20260816240000`;
   - executar `scripts/supabase-validate.ps1`/`scripts/supabase-validate.sql`;
   - executar `scripts/supabase-rls-integration.sql`, que cria atores sintéticos para anon, dono, estranho, amigo, bloqueado, membro, moderador de comunidade, `moderator`, `admin`, `super_admin` e `support`, testa RLS/Storage/Realtime e termina em `ROLLBACK`;
   - verificar download/upload em cada bucket e negação de evidência para denunciante/denunciado;
   - verificar Postgres Changes e Broadcast/Presence privados;
   - validar rollback restaurando o snapshot de staging.

4. **Gate de Auth**
   - conferir allow-list GitHub Pages;
   - testar signup confirmado, reset e recuperação de sessão;
   - testar reautenticação real antes de deactivate/delete.

5. **Aplicação controlada**
   - não usar `db query` como substituto improvisado de migrations sem também registrar o histórico na mesma transação;
   - preferir o fluxo oficial de migration quando a conexão SQL autenticada estiver disponível;
   - se Management API for a única via, usar um wrapper revisado que execute migration + registro em `supabase_migrations.schema_migrations` atomicamente;
   - repetir inventário e contagens após cada migration;
   - interromper se o snapshot tiver divergido.

## Limitações conhecidas do ambiente atual

- Docker/Podman não está disponível neste workspace; `supabase status/db reset` não pode executar o banco local;
- os testes locais continuam sendo estáticos/contratuais, mas o schema social C903 também passou por aplicação SQL real, 14/14 validações e gate RLS transacional com `ROLLBACK` no staging `bgeauxljwjbtbwpbzpoo`;
- nenhuma migration pendente foi aplicada ao projeto remoto;
- nenhum bucket, publication ou policy novo está ativo remotamente neste momento;
- workers de exportação, delete final, purge e retenção ainda precisam ser provisionados antes do lançamento público.
- as Edge Functions locais implementam inspeção de assinatura/MIME e decode de dimensões, mas ainda não foram implantadas; PDF/arquivo genérico permanece fora do lançamento até existir quarentena e antimalware.

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
