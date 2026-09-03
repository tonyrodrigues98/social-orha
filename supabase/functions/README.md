# ORHA Edge Functions

Funções server-side versionadas para operações que o navegador não pode autorizar.

| Função | Chamada | Autoridade | Resultado |
| --- | --- | --- | --- |
| `account-export` | usuário autenticado | JWT + owner check | JSON em `account-exports`, URL assinada de 5 min, TTL de 24 h |
| `media-verify` | usuário autenticado | JWT + owner/message check | inspeção de bytes e promoção trusted de perfil/post/chat |
| `account-lifecycle-worker` | cron interno | `ORHA_CRON_SECRET` | desativação, exclusão +30 d, Storage, Auth Admin e reconciliação |
| `media-cleanup-worker` | cron interno | `ORHA_CRON_SECRET` | filas idempotentes de perfil, post, chat e exportação |
| `catalog-search` | usuário autenticado | JWT + allowlist | catálogo público de favoritos, sem proxy arbitrário |

## Contratos de segurança

- `SUPABASE_SERVICE_ROLE_KEY` é lida somente no runtime Edge e nunca pertence a `VITE_*`, resposta ou log.
- Funções de usuário mantêm `verify_jwt = true` e ainda validam o usuário no handler.
- Workers mantêm `verify_jwt = false` porque não recebem JWT de usuário; exigem um bearer `ORHA_CRON_SECRET` comparado por hash em tempo constante.
- `ORHA_ALLOWED_ORIGINS` é uma allowlist exata, separada por vírgulas. Não use `*`.
- Uploads são imutáveis. O browser reserva e envia com `upsert=false`; somente `media-verify` promove/associa os bytes.
- Nenhuma função registra headers, tokens, caminhos privados ou payloads completos.

## Media launch boundary

- Chat accepts only server-verified images and audio. Generic files and PDF are rejected by the UI, Storage policy, database constraint, and `media-verify`.
- PDF/file support may return only after a malware scanner, quarantine bucket, asynchronous release decision, and hostile-file tests exist.
- Community branding, post media, profile media, report evidence, and chat media are reserved first, uploaded with `upsert=false`, inspected from trusted bytes, then promoted by service-role-only RPCs.
- A report captures an immutable, bounded target snapshot and private attachment references. The cleanup worker retains those objects while the moderation case is active or retention has not expired.
- Moderation snapshot and retained attachment paths are never returned to the reporter, target, account export, or normal table reads; moderators receive them only through audited RPCs.

## Desenvolvimento e testes

O runtime é Deno 2, conforme `supabase/config.toml`.

```powershell
deno task --config supabase/functions/deno.json --cwd supabase/functions check
deno task --config supabase/functions/deno.json --cwd supabase/functions test
```

Para paridade local completa, o Supabase CLI exige Docker. Sem Docker, execute `deno check`, os testes puros e depois o deploy apenas no projeto descartável de staging.

Referências oficiais:

- [Edge Functions](https://supabase.com/docs/guides/functions)
- [Autorização de Edge Functions](https://supabase.com/docs/guides/functions/auth-headers)
- [Agendamento com Cron e Vault](https://supabase.com/docs/guides/functions/schedule-functions)
- [Testes de Edge Functions](https://supabase.com/docs/guides/functions/unit-test)
- [Exclusão Auth Admin](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser)
