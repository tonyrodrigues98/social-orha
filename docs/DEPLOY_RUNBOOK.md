# ORHA — Runbook de deploy

Última verificação operacional: 2026-08-16.

Este runbook separa verificação, alteração de banco e publicação. Nenhum gate pode ser considerado aprovado por inferência. A evidência deve vir do Supabase remoto, do workflow e do domínio publicado.

## Estado observado

- Repositório: `tonyrodrigues98/social-orha`.
- Branch remota padrão: `main`.
- Produção atual: <https://tonyrodrigues98.github.io/social-orha/>.
- GitHub Pages usa workflow e HTTPS, mas não possui `CNAME` nem domínio customizado.
- O caminho direto `/social-orha/auth/login` retorna `404`; deep links ainda são gate reprovado.
- O manifest usa `id`, `start_url` e `scope` em `/social-orha/`.
- Supabase remoto: projeto `iuaczhkfmwpyhtpdmuyt`, região `sa-east-1`.
- `20260811040000` está aplicada; `20260816130000` foi observada somente localmente.
- O remoto observado contém apenas `profiles`, `profile_details`, `profile_privacy` e `user_roles`.
- Storage não possui buckets publicados.
- Google OAuth está desativado.
- Confirmação de e-mail está ativa, mas não há credencial SMTP própria identificada.
- SSL enforcement do banco está ligado; a mudança oficial foi confirmada pelo control plane com `{database:true}`.
- PITR está desligado e o endpoint oficial lista zero backups físicos. Existe um snapshot lógico pré-lançamento v2, criptografado, cuja restauração transacional foi testada em staging vazio.

## Autoridade e segurança

- Nunca usar `service_role` em `VITE_*`, JavaScript entregue ao navegador, logs ou artifacts.
- Toda mudança remota deve existir em migration/configuração versionada antes de ser aplicada.
- Não desabilitar RLS para liberar uma feature.
- Não aplicar migration se não existir snapshot recuperável e plano de forward-fix.
- Não executar `DROP`, `TRUNCATE`, reset remoto ou exclusão em massa neste fluxo.
- O deploy do frontend somente pode seguir quando o schema remoto e o cliente forem compatíveis nas duas direções necessárias ao rollback.

## 1. Preparar o checkpoint

1. Confirmar branch, HEAD e worktree:

   ```powershell
   git status --short --branch
   git rev-parse HEAD
   git fetch origin main
   git rev-list --left-right --count origin/main...HEAD
   ```

2. Registrar no `docs/ORHA_PRODUCTION_EXECUTION_STATE.md`:
   - commit candidato;
   - ambiente;
   - migrations locais e remotas;
   - buckets;
   - domínio;
   - resultado dos testes;
   - rollback target.

3. Confirmar que nenhum secret foi adicionado ao diff:

   ```powershell
   git diff --check
   git diff --cached --check
   rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' "service_role|SUPABASE_DB_PASSWORD|SMTP_PASSWORD|GOOGLE_OAUTH_CLIENT_SECRET"
   ```

4. Não publicar caches, dumps, snapshots ou `.env.local`.

## 2. Gates locais

Executar com lockfile congelado:

```powershell
npm ci
npm run check:catalog
npm run typecheck
npm run lint
npm run audit:production-debt
npm run audit:secrets
npm run audit:text-encoding
npm test
npm run build
npm run audit:bundle
```

Executar também a suíte E2E e a inspeção PWA definida no repositório. As jornadas
autenticadas usam exclusivamente o Supabase de staging via `ORHA_STAGING_*` e
`ORHA_E2E_*`; o build/deploy continua usando a configuração pública de produção.
Qualquer falha encerra o deploy.

## 3. Snapshot e validação remota somente leitura

O snapshot contém apenas metadados de schema, políticas, grants, buckets e publication; não contém valores de usuários.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/supabase-snapshot.ps1 -OutputPath .tmp/supabase-before-deploy.json
powershell -ExecutionPolicy Bypass -File scripts/supabase-validate.ps1
```

Os wrappers usam exclusivamente:

```powershell
npx supabase db query --linked --file <arquivo.sql> --output json
```

O script de validação retorna código `2` quando algum contrato falha. Ele não corrige o remoto.

## 4. Gate de backup

Antes de qualquer migration de produção:

1. Confirmar backup/PITR pela API ou Dashboard.
2. Verificar o artefato lógico primário fora do repositório:
   - `C:\Users\CPU\.codex\orha-backups\orha-production-prelaunch-20260816T222622Z-v2.json.dpapi`;
   - SHA-256 `E1886B86C4E033F3F61B229B26D484ED6593A94672C5E9FA0C1642D232C941E7`;
   - 15.366 bytes, formato `orha-prelaunch-v1`, DPAPI `CurrentUser` sem entropy adicional.
3. Registrar timestamp, retenção, responsável, ledger e escopo exato protegido.
4. Confirmar descriptografia em processo novo e restauração em ambiente descartável/staging antes da promoção.
5. Confirmar que o restore drill preserva o subconjunto JSON e os FKs e termina sem fixtures residuais.
6. Se não houver uma fonte recuperável compatível com o escopo da mudança, **parar**.

Em 2026-08-16, o snapshot v2 passou por descriptografia em processo novo e por restore drill dos seis conjuntos capturados, com `ROLLBACK` e contagens finais `auth_users=0`/`profiles=0`. Ele substitui o v1 como artefato operacional primário. O endpoint oficial ainda informa zero backups e `PITR=false`; logo o gate cobre apenas o estado lógico pré-lançamento capturado, não recuperação física nem escritas posteriores. O conteúdo descriptografado não deve aparecer em logs, artifacts ou no repositório.

## 5. Staging

1. Aplicar as migrations em projeto de staging/branch de preview, nunca diretamente em produção como primeiro teste.
2. Executar reset completo no ambiente descartável.
3. Executar lint SQL, testes RLS, Storage e Realtime.
4. Regenerar tipos e executar frontend/E2E contra staging.
5. Executar `scripts/supabase-validate.ps1` apontando o workspace ao staging vinculado.
6. Registrar o resultado antes de promover.

O staging dedicado existe e deve continuar isolado. O gate E2E precisa receber
URL, publishable key, host, `service_role` e contas A/B/admin desse mesmo projeto
via GitHub Actions Variables/Secrets, sem registrar valores no repositório.

## 6. Aplicar migrations em produção

Somente após os gates anteriores:

```powershell
npx supabase migration list --linked
npx supabase db push --linked --dry-run
```

Revisar a lista exata. A aplicação real é uma ação separada e consciente:

```powershell
npx supabase db push --linked
```

Depois da aplicação:

```powershell
npx supabase migration list --linked
powershell -ExecutionPolicy Bypass -File scripts/supabase-snapshot.ps1 -OutputPath .tmp/supabase-after-deploy.json
powershell -ExecutionPolicy Bypass -File scripts/supabase-validate.ps1
npx supabase db lint --linked --level warning
```

Não declarar migration aplicada até ela aparecer na tabela remota de migrations.

## 7. Auth, Storage e Realtime

Validar no remoto:

- Site URL e allowlist de redirects para localhost, preview e domínio definitivo.
- Confirmação de e-mail e recuperação de senha com entrega real.
- SMTP próprio, quando adotado.
- Google OAuth somente após `GOOGLE_OAUTH_CLIENT_ID` e `GOOGLE_OAUTH_CLIENT_SECRET` estarem configurados.
- Buckets `profile-media`, `community-media`, `chat-media`, `report-evidence` e `account-exports`.
- `chat-media` e `report-evidence` privados.
- MIME, tamanho, ownership, policies e URLs assinadas.
- Publication Realtime somente para tabelas necessárias.
- Subscriptions autenticadas sem vazamento entre usuários.

Configuração manual no Dashboard deve ser representada no repositório ou no inventário operacional.

## 8. Publicar frontend

O workflow `.github/workflows/deploy-pages.yml` deve passar:

- `npm ci`;
- audit de dependências de produção;
- typecheck;
- lint;
- testes;
- catálogo;
- build;
- upload e deploy.

Publicar pela branch/revisão aprovada e acompanhar o workflow pelo GitHub conectado. Não usar um deploy verde como prova de que as jornadas sociais persistem.

## 9. Gate de host e deep link

GitHub Pages somente pode permanecer como produção se responder `200` com a aplicação para rotas diretas autenticadas e públicas. O estado atual reprova este gate.

Verificar:

```powershell
Invoke-WebRequest -Method Get -Uri https://tonyrodrigues98.github.io/social-orha/
Invoke-WebRequest -Method Get -Uri https://tonyrodrigues98.github.io/social-orha/auth/login
Invoke-WebRequest -Method Get -Uri https://tonyrodrigues98.github.io/social-orha/conversas/exemplo
```

O gate executável não considera o JavaScript de `404.html` um rewrite. Ele exige
que o próprio host devolva `200` e `text/html` para a raiz e para cada rota direta:

```powershell
$env:ORHA_HOST_URL='https://tonyrodrigues98.github.io/social-orha/'
npm run audit:host
```

Na verificação de 2026-08-16, a raiz respondeu `200`, enquanto
`/social-orha/auth/login` e `/social-orha/conversas/exemplo` responderam `404`.
Portanto, a migração para um host com rewrite de SPA continua sendo um bloqueador
externo explícito; o fallback atual melhora a navegação humana, mas não satisfaz
o contrato HTTP de produção.

Vercel é o host selecionado para substituir Pages. O contrato versionado em `vercel.json` usa Vite, saída `dist`, `cleanUrls` e rewrite de todas as rotas para `/`, preservando a URL solicitada. Com `cleanUrls: true`, o destino não pode conter `.html`. Ainda é necessário autenticar uma conta Vercel autorizada, importar o repositório e provar o resultado com `npm run audit:host` antes de qualquer promoção.

## 10. Domínio e PWA

Concluir `docs/DOMAIN_CHECKLIST.md`. Após o domínio:

- `base`, manifest `id`, `start_url` e `scope` devem refletir a raiz real;
- Auth Site URL e redirects devem usar o domínio;
- canonical, Open Graph, favicon e Apple Touch icon devem usar URLs corretas;
- service worker antigo de `/social-orha/` não pode manter shell obsoleto;
- HTTPS e certificado devem estar válidos.

O mesmo código suporta os dois formatos por ambiente:

```text
# GitHub Pages
VITE_ORHA_BASE_PATH=/social-orha/
VITE_ORHA_PUBLIC_ORIGIN=https://tonyrodrigues98.github.io

# Futuro domínio raiz
VITE_ORHA_BASE_PATH=/
VITE_ORHA_PUBLIC_ORIGIN=https://<dominio-definitivo>
```

Essas variáveis também derivam canonical, Open Graph, URLs de ícone e escopo do
manifest. Uma atualização solicitada do service worker preserva temporariamente
somente campos editáveis autenticados em `sessionStorage`, por usuário e rota,
com expiração de 15 minutos; senhas, códigos, dados de pagamento e arquivos são
sempre excluídos. O estado é consumido após a retomada ou apagado na troca de conta.

## 11. Smoke pós-deploy

Executar com pelo menos duas contas isoladas:

1. Cadastro, confirmação, login, recuperação e logout.
2. Onboarding com reload e novo dispositivo.
3. Amizade e bloqueio server-side.
4. Comunidade, post, comentário e reação.
5. Solicitação de conversa, texto, imagem e áudio persistidos.
6. Realtime, read receipt e retry sem duplicação.
7. Upload privado e URL assinada.
8. Notificação e deep link.
9. PWA standalone, offline honesto e atualização.
10. Console, requests, WebSocket e service worker sem falhas críticas.

## 12. Encerramento

Somente após todos os gates:

- registrar commit, workflow, domínio e migrations no execution state;
- criar tag/release;
- registrar snapshot pós-deploy;
- registrar rollback target;
- confirmar explicitamente que a build não usa mocks ou seeds de produção.
