# Runbook — ORHA Edge Functions

## Ordem de instalação

1. Aplicar e validar `20260816180000_edge_worker_contracts.sql` depois da migration social `170000`.
2. Regenerar os tipos TypeScript do schema remoto.
3. Definir os secrets/configurações no projeto alvo por arquivo local ignorado, nunca na linha de comando ou Git.
4. Implantar as cinco funções versionadas.
5. Executar os smoke tests de Auth, exportação, magic-byte, cleanup e exclusão em staging.
6. Somente depois criar os jobs no Supabase Cron usando valores guardados no Vault.

## Nomes de ambiente

Fornecidos automaticamente pelo Supabase Edge Runtime:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Configurações ORHA:

- `ORHA_CRON_SECRET` — segredo aleatório exclusivo para workers, gerado fora do repositório.
- `ORHA_ALLOWED_ORIGINS` — lista exata de origins, separada por vírgulas; é configuração server-side, não credencial.

Crie um arquivo temporário ignorado com esses dois nomes, use `supabase secrets set --env-file <arquivo>` e apague o arquivo com operação recuperável/segura quando os ambientes estiverem validados. Nunca reutilize senha, publishable key ou service role como `ORHA_CRON_SECRET`.

## Deploy por ambiente

Depois de vincular explicitamente o projeto correto:

```powershell
npx supabase functions deploy account-export media-verify catalog-search --use-api
npx supabase functions deploy account-lifecycle-worker media-cleanup-worker --use-api --no-verify-jwt
```

Confira no remoto os flags:

- `account-export`, `media-verify`, `catalog-search`: JWT verificado.
- `account-lifecycle-worker`, `media-cleanup-worker`: JWT de usuário desativado, bearer de cron obrigatório no handler.

## Cron + Vault

Guarde no Vault, sem colocar valores no SQL versionado:

- `orha_project_url`
- `orha_publishable_key`
- `orha_cron_secret`

Crie dois jobs via Dashboard/SQL:

- `orha-account-lifecycle-worker`: a cada 5 minutos, `POST /functions/v1/account-lifecycle-worker` com `{ "limit": 10 }`.
- `orha-media-cleanup-worker`: a cada 10 minutos, `POST /functions/v1/media-cleanup-worker` com `{ "limit": 50 }`.

Cada `net.http_post` deve montar headers com:

- `Content-Type: application/json`
- `apikey`: Vault `orha_publishable_key`
- `Authorization: Bearer <Vault orha_cron_secret>`

O secret de cron nunca é argumento de query, payload, migration, log ou resposta.

## Moderation retention and media boundary

- Chat launch media is limited to verified image/audio. Do not enable PDF or generic files until malware scanning, quarantine, release review, and hostile-file coverage are deployed.
- `create_report` writes its bounded target snapshot and retained media references in the same transaction as the report/case.
- Moderation attachment objects are excluded from account purge and domain cleanup while a case is active or retention is valid.
- After a terminal case and retention expiry, `media-cleanup-worker` removes the retained reference and deletes the object only when no live domain row or another active report still references it.
- The reporter and target must receive permission denied for snapshot columns/reference rows; only moderator-only audited RPCs may project context or sign one retained object.

## Gates de staging

1. Chamada sem JWT em `account-export`/`media-verify` retorna 401.
2. Origin fora da allowlist retorna 403.
3. Chamada de worker sem bearer correto retorna 401.
4. Export de A não aceita `requestId` de B; artefato é privado, expira e o cleanup o remove.
5. Arquivo PNG renomeado para JPEG é rejeitado; objeto removido e metadata não fica `ready`.
6. Objeto validado não pode ser sobrescrito nem apagado diretamente pelo browser.
7. Retry da mesma mensagem não duplica attachment.
8. Exclusão antes de 30 dias não é claimable.
9. Exclusão vencida remove todos os objetos, registra início, apaga Auth por último e reconcilia o tombstone.
10. Reexecutar ambos workers sem filas retorna contagens zero e não cria efeitos duplicados.
11. Reportar post/mensagem, apagar ou redigir o alvo e excluir a conta autora preserva o snapshot exato e o unico anexo autorizado para o moderador.
12. Reporter, alvo e anonimo nao conseguem ler `target_snapshot`, `report_target_attachments` ou o objeto retido.
13. UPDATE do snapshot e das referencias e rejeitado; expiracao terminal converge pelo cleanup sem apagar objeto ainda referenciado.
14. PDF, HTML renomeado e arquivos genericos sao rejeitados antes da criacao de mensagem/notificacao.

## Rollback / forward-fix

Não reverta a migration em produção removendo tabelas ou reabrindo grants do browser. Em caso de falha:

1. desative os jobs Cron;
2. preserve as filas e objetos privados;
3. reverta o frontend para não iniciar novos fluxos;
4. publique uma Edge Function corrigida ou migration forward-fix;
5. reexecute staging e reative os jobs.

Uma exclusão Auth concluída não é reversível; por isso o worker respeita `execute_after`, remove Auth por último e mantém auditoria/reconciliação.
