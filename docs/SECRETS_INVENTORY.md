# ORHA — Inventário de secrets e configurações públicas

Última verificação operacional: 2026-08-16.

Este inventário contém somente nomes e estado de disponibilidade. Valores, hashes, tokens e senhas não pertencem a este documento.

## Regras

- Variáveis `VITE_*` são entregues ao navegador e nunca podem conter credencial privilegiada.
- `service_role`, senha do banco, SMTP e OAuth secret ficam apenas em superfícies server-side autorizadas.
- `.env.local`, dumps, snapshots e logs não entram no Git.
- O GitHub deve usar environments/secrets/variables por escopo; não repetir credenciais em YAML.
- Rotação precisa registrar owner, consumidores e data, sem registrar o valor.

## Inventário verificado

| Nome | Classe | Estado observado | Local correto |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | configuração pública | presente em `.env.local` e no workflow | GitHub Actions Variable e ambiente local ignorado |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | chave pública | presente em `.env.local` e no workflow | GitHub Actions Variable e ambiente local ignorado |
| `ORHA_STAGING_SUPABASE_URL` | configuração pública de staging | nome exigido; valor não pertence ao repositório | GitHub Actions Variable do gate E2E |
| `ORHA_STAGING_SUPABASE_PUBLISHABLE_KEY` | chave pública isolada de staging | nome exigido; valor não pertence ao repositório | GitHub Actions Secret do gate E2E |
| `ORHA_E2E_SUPABASE_HOST` | verificação pública de destino | nome exigido; deve corresponder à URL de staging | GitHub Actions Variable do gate E2E |
| `ORHA_E2E_SERVICE_ROLE_KEY` | secret crítico de staging | nome exigido; valor não encontrado | GitHub Actions Secret; somente processo Node do E2E, nunca `VITE_*` |
| `ORHA_E2E_USER_A_*`, `ORHA_E2E_USER_B_*`, `ORHA_E2E_ADMIN_*` | contas dedicadas de teste | nomes definidos; valores não encontrados | GitHub Actions Secrets, exclusivamente no projeto de staging |
| `ORHA_E2E_EMAIL_DOMAIN` | configuração sensível de teste | nome definido; valor não encontrado | GitHub Actions Secret, domínio catch-all do staging |
| `ORHA_E2E_SMTP_DELIVERY_VERIFIED` | gate operacional | nome definido; valor não encontrado | GitHub Actions Secret, somente `true` após prova externa de entrega |
| `SUPABASE_ACCESS_TOKEN` | secret operacional | CLI autenticada, mas variável não encontrada | credential store local ou secret de CI restrito |
| `SUPABASE_DB_PASSWORD` | secret crítico | não encontrado | secret manager operacional; nunca `VITE_*` |
| `SUPABASE_SERVICE_ROLE_KEY` | secret crítico | não encontrado | Edge Function/servidor; nunca navegador |
| `ORHA_CRON_SECRET` | secret crítico | nome definido; valor ainda não provisionado | Supabase Edge secrets e Vault, com o mesmo valor gerado fora do código |
| `ORHA_ALLOWED_ORIGINS` | configuração server-side | nome definido; valor por ambiente ainda não provisionado | Supabase Edge secrets/config, lista exata sem `*` |
| `SMTP_HOST` | configuração sensível | não encontrado | Supabase Auth/Dashboard ou secret manager |
| `SMTP_PORT` | configuração | não encontrado | Supabase Auth/Dashboard |
| `SMTP_USER` | secret | não encontrado | Supabase Auth/Dashboard ou secret manager |
| `SMTP_PASSWORD` | secret crítico | não encontrado | Supabase Auth/Dashboard ou secret manager |
| `SMTP_FROM_ADDRESS` | configuração | não encontrado | Supabase Auth/Dashboard |
| `SMTP_FROM_NAME` | configuração | não encontrado | Supabase Auth/Dashboard |
| `SENDGRID_API_KEY` | secret crítico | somente referência no template local; valor não encontrado | Supabase Auth/secret manager, se SendGrid for adotado |
| `GOOGLE_OAUTH_CLIENT_ID` | configuração sensível | não encontrado; Google desativado | Supabase Auth/Dashboard |
| `GOOGLE_OAUTH_CLIENT_SECRET` | secret crítico | não encontrado; Google desativado | Supabase Auth/Dashboard |
| `SUPABASE_AUTH_EXTERNAL_APPLE_SECRET` | secret não permitido | somente referência no template; não provisionar | Apple Sign-In está fora das regras da ORHA |
| `GITHUB_TOKEN` | token automático | disponível somente durante GitHub Actions | fornecido automaticamente pelo GitHub |
| `CLOUDFLARE_API_TOKEN` | secret DNS, se Cloudflare | não encontrado | secret manager/connector DNS |
| `CLOUDFLARE_ZONE_ID` | identificador DNS, se Cloudflare | não encontrado | secret manager/connector DNS |
| `DNS_PROVIDER_API_TOKEN` | secret DNS genérico | não encontrado | secret manager do provedor escolhido |

## Superfícies verificadas

- Processo atual: nenhuma variável relevante de GitHub, Supabase, SMTP, Google ou DNS foi encontrada.
- GitHub Actions: os nomes de variables/secrets do staging estão declarados no workflow, mas nenhum valor é materializado no repositório.
- Supabase Edge Functions: lista de secrets vazia.
- Arquivos locais: apenas as duas configurações públicas do Supabase em `.env.local`.
- Workflow: o job de build/deploy mantém as duas configurações públicas de produção; o job E2E não repete esses valores e consome somente `ORHA_STAGING_*`/`ORHA_E2E_*`. O smoke pós-deploy é público e não recebe contas persistentes.
- GitHub conectado: sessão disponível com permissão administrativa; a credencial do conector não é exportável nem deve ser registrada.
- Supabase CLI: sessão disponível e projeto vinculado; a credencial local não deve ser copiada para o repositório.

## Pendências externas

1. Provisionar as variables/secrets do gate E2E no escopo de staging e confirmar que a `service_role`, A, B e admin pertencem ao mesmo projeto isolado.
2. Selecionar e configurar SMTP ou confirmar formalmente o mailer aceito para produção.
3. Fornecer `GOOGLE_OAUTH_CLIENT_ID` e `GOOGLE_OAUTH_CLIENT_SECRET` para ativar Google.
4. Informar domínio e provedor DNS; então usar os nomes específicos do provedor.
5. Definir credencial e processo de backup/restauração sem expor senha do banco.

## Checklist de rotação

- [ ] Identificar consumidores.
- [ ] Criar nova versão no secret manager.
- [ ] Atualizar staging e validar.
- [ ] Atualizar produção.
- [ ] Revogar versão antiga.
- [ ] Verificar Auth, Edge Functions e deploy.
- [ ] Registrar somente data, owner e nome rotacionado.

## Proibições explícitas

- Nunca criar `VITE_SUPABASE_SERVICE_ROLE_KEY`.
- Nunca colocar `SUPABASE_DB_PASSWORD` em GitHub Pages.
- Nunca registrar tokens em `docs/ORHA_PRODUCTION_EXECUTION_STATE.md`.
- Nunca imprimir secrets com `--debug` em CI pública.
- Nunca usar ausência de credencial para inventar um valor.
