# ORHA — Inventário de secrets e configurações públicas

Última verificação operacional: 2026-09-14.

Este inventário contém somente nomes e estado de disponibilidade. Valores, hashes, tokens e senhas não pertencem a este documento.

## Regras

- Variáveis `VITE_*` são entregues ao navegador e nunca podem conter credencial privilegiada.
- `service_role`, senha do banco, SMTP e OAuth secret ficam apenas em superfícies server-side autorizadas.
- `.env.local`, dumps, snapshots e logs não entram no Git.
- O GitHub deve usar environments/secrets/variables por escopo; não repetir credenciais em YAML.
- A Vercel deve separar Preview e Production: Preview usa exclusivamente o Supabase de staging e Production usa exclusivamente o Supabase de produção.
- Nenhum secret server-side pode ser provisionado como `VITE_*` nem herdado por um build público da Vercel.
- Rotação precisa registrar owner, consumidores e data, sem registrar o valor.

## Inventário verificado

| Nome | Classe | Estado observado | Local correto |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | configuração pública | presente em `.env.local` e no workflow | GitHub Actions Variable e ambiente local ignorado |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | chave pública | presente em `.env.local` e no workflow | GitHub Actions Variable e ambiente local ignorado |
| `VITE_ORHA_LEGAL_OPERATOR_NAME`, `VITE_ORHA_LEGAL_CONTROLLER_NAME` | identidade pública, não secret | nomes exigidos; valores reais ainda não fornecidos | GitHub Actions Variables; publicação falha fechada sem ambos |
| `VITE_ORHA_LEGAL_ADDRESS`, `VITE_ORHA_LEGAL_FORUM`, `VITE_ORHA_LEGAL_EFFECTIVE_DATE` | informação jurídica pública | nomes exigidos; valores reais ainda não fornecidos | GitHub Actions Variables; data em `AAAA-MM-DD` |
| `VITE_ORHA_SUPPORT_EMAIL`, `VITE_ORHA_PRIVACY_EMAIL` | canais públicos, não secrets | nomes exigidos; valores reais ainda não fornecidos | GitHub Actions Variables; publicação falha fechada se inválidos |
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
| `ORHA_CRON_SECRET` | secret crítico | provisionado no Edge Runtime e Vault do staging; valor não registrado | Supabase Edge secrets e Vault, com o mesmo valor gerado fora do código |
| `ORHA_ALLOWED_ORIGINS` | configuração server-side | provisionada no staging com origins exatas, sem wildcard | Supabase Edge secrets/config, lista exata sem `*` |
| `SMTP_HOST` | configuração sensível | não provisionado; custom SMTP confirmado desligado no staging e necessário para liberar templates personalizados | Supabase Auth/Dashboard ou secret manager |
| `SMTP_PORT` | configuração | não provisionado; custom SMTP confirmado desligado no staging | Supabase Auth/Dashboard |
| `SMTP_USER` | secret | não provisionado; custom SMTP confirmado desligado no staging | Supabase Auth/Dashboard ou secret manager |
| `SMTP_PASSWORD` | secret crítico | não provisionado; custom SMTP confirmado desligado no staging | Supabase Auth/Dashboard ou secret manager |
| `SMTP_FROM_ADDRESS` | configuração | não provisionado; custom SMTP confirmado desligado no staging | Supabase Auth/Dashboard |
| `SMTP_FROM_NAME` | configuração | não provisionado; custom SMTP confirmado desligado no staging | Supabase Auth/Dashboard |
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
- Supabase Edge Functions: secrets gerenciados da plataforma presentes; `ORHA_CRON_SECRET` e `ORHA_ALLOWED_ORIGINS` provisionados no staging, com listagem somente de nomes/hashes. Vault contém os nomes `orha_project_url` e `orha_cron_secret`; dois jobs Cron privados estão ativos.
- Arquivos locais: apenas as duas configurações públicas do Supabase em `.env.local`.
- Workflow: o job de build/deploy mantém as duas configurações públicas de produção; o job E2E não repete esses valores e consome somente `ORHA_STAGING_*`/`ORHA_E2E_*`. O smoke pós-deploy é público e não recebe contas persistentes.
- Vercel: o contrato versionado exige preflight por ambiente antes do build; os valores reais de Preview/Production ainda não foram provisionados.
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
