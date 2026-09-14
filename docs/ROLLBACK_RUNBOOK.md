# ORHA — Runbook de rollback

Última verificação operacional: 2026-08-16.

Rollback de frontend e recuperação de banco são operações diferentes. Uma migration publicada não deve ser revertida por comandos destrutivos improvisados.

## Estado de recuperação observado

- Produção atual usa GitHub Pages via workflow.
- Não existe tag/release registrada.
- A branch `main` não possui proteção observada.
- PITR está desligado.
- O endpoint oficial informa zero backups físicos, mas existe um snapshot lógico pré-lançamento v2, criptografado e com restore drill aprovado.
- O deep link de Auth retorna `404` no host atual.

O snapshot lógico v2 permite recuperar somente os seis conjuntos capturados no estado pré-lançamento. Ele não oferece Point-in-Time Recovery, não cobre escritas posteriores ao snapshot e não autoriza down migration ou restore destrutivo automático.

### Artefato lógico primário

- caminho operacional fora do repositório: `C:\Users\CPU\.codex\orha-backups\orha-production-prelaunch-20260816T222622Z-v2.json.dpapi`;
- SHA-256: `E1886B86C4E033F3F61B229B26D484ED6593A94672C5E9FA0C1642D232C941E7`;
- tamanho: 15.366 bytes;
- formato: `orha-prelaunch-v1`;
- proteção: DPAPI `CurrentUser`, sem entropy adicional;
- conteúdo inventariado: 1 usuário Auth, 1 identity, 1 profile, 1 profile_details, 1 profile_privacy e 1 user_role.

A descriptografia em um processo Windows novo passou. O restore drill em staging vazio inseriu os seis conjuntos usando a interseção de colunas geradas, limitou `session_replication_role` à transação, verificou o subconjunto JSON e os relacionamentos FK e terminou em `ROLLBACK`. As contagens posteriores foram `auth_users=0` e `profiles=0`. O artefato v2 substitui o v1 como fonte operacional primária; seu conteúdo nunca deve ser copiado para logs ou para o repositório.

## 1. Classificar o incidente

Escolher uma classe antes de agir:

- `frontend`: regressão de UI, bundle, rota, PWA ou configuração pública;
- `schema compatível`: migration aditiva com frontend incompatível;
- `schema incompatível`: coluna/tabela/enum alterado de forma que a versão anterior não funciona;
- `dados`: corrupção, exclusão ou transformação incorreta;
- `Auth/Storage/Realtime`: configuração, policy, provider ou publication incorreta;
- `domínio`: DNS, certificado, redirect ou cache de service worker.

Registrar horário, impacto, commit, migration mais recente e responsável.

## 2. Preservar evidências

Antes de qualquer correção:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/supabase-snapshot.ps1 -OutputPath .tmp/supabase-incident.json
npx supabase migration list --linked
git rev-parse HEAD
```

Capturar também workflow, console, requests, WebSocket, service worker e domínio afetado. O snapshot é somente metadado e não substitui backup de dados.

## 3. Rollback do frontend

Pré-condição: confirmar que o schema remoto continua compatível com o commit anterior.

1. Identificar o `KNOWN_GOOD_COMMIT` no último release aprovado.
2. Criar um commit de reversão auditável pelo GitHub conectado ou por `git revert`; não reescrever `main`.
3. Publicar pelo workflow normal.
4. Confirmar que build e deploy passaram.
5. Fazer smoke das rotas raiz, Auth, rota privada direta e PWA.

Não usar `git reset --hard`, force push ou exclusão do histórico como rollback operacional.

## 4. Migration aditiva com frontend incompatível

Se a migration foi somente aditiva e preserva contratos antigos:

1. Reverter apenas o frontend para `KNOWN_GOOD_COMMIT`.
2. Manter o schema novo.
3. Criar forward-fix versionado.
4. Retestar contra o mesmo schema remoto.

Esse é o padrão preferido de expand/contract.

## 5. Migration incompatível

Não executar down migration destrutiva automaticamente.

1. Parar novas escritas afetadas pela aplicação, sem desligar RLS.
2. Criar migration de forward-fix que recupere compatibilidade.
3. Testar em staging com cópia sanitizada ou backup restaurado.
4. Aplicar somente após revisão dos dados afetados.
5. Validar schema, RLS, Storage e Realtime.

Se houver perda de dados, seguir a seção de recuperação.

## 6. Recuperação de dados

Pré-condição obrigatória: uma fonte de recuperação compatível com o instante e o escopo do incidente deve estar confirmada e testada. O snapshot lógico v2 atende somente ao estado pré-lançamento que capturou; o endpoint oficial continua com zero backups e `PITR=false`.

1. Definir instante e escopo de restauração.
2. Verificar novamente tamanho e SHA-256 do artefato antes de descriptografar.
3. Descriptografar somente sob o mesmo usuário Windows autorizado e nunca imprimir o JSON.
4. Restaurar primeiro em ambiente isolado, com `session_replication_role` limitado à transação revisada.
5. Comparar ledger, IDs, contagens, subconjunto JSON e relacionamentos FK sem expor conteúdo privado.
6. Planejar reconciliação idempotente e forward-fix para qualquer schema posterior ao snapshot.
7. Promover somente com aprovação explícita e trilha de auditoria.

Se o incidente envolver dados criados ou alterados depois do snapshot v2, a recuperação física/ponto-no-tempo permanece indisponível. Nesse caso, preservar evidências, interromper escritas afetadas e usar reconciliação/forward-fix; não fingir que o snapshot pré-lançamento cobre o período.

## 7. Auth, Storage e Realtime

- Auth: restaurar Site URL, redirect allowlist e providers a partir da configuração registrada; nunca simular confirmação no frontend.
- Storage: corrigir policies por migration/forward-fix; não tornar bucket privado público.
- Realtime: remover/adicionar tabelas por migration versionada e validar vazamento por participação.
- Secrets: rotacionar apenas quando houver suspeita de exposição; atualizar consumidores de forma coordenada.

## 8. Domínio e PWA

Para incidente de domínio:

1. Confirmar DNS autoritativo e certificado.
2. Reduzir impacto voltando ao host estável conhecido, se Auth redirects permitirem.
3. Não apagar o domínio do Supabase antes de adicionar redirect temporário seguro.
4. Verificar cache do service worker e a versão do manifest.
5. Validar deep links após propagação.

## 9. Validação após rollback/forward-fix

```powershell
powershell -ExecutionPolicy Bypass -File scripts/supabase-validate.ps1
npx supabase db lint --linked --level warning
npm run typecheck
npm run lint
npm test
npm run build
npm run audit:bundle
```

Executar as jornadas críticas com duas contas e confirmar ausência de cache cruzado.

## 10. Encerramento do incidente

Registrar:

- causa-raiz;
- primeiro commit afetado;
- migration afetada;
- commit de rollback ou forward-fix;
- dados reconciliados;
- testes executados;
- domínio e workflow finais;
- medidas preventivas.

Atualizar o execution state e criar tag/release somente quando a produção estiver estável.
