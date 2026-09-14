# ORHA — observabilidade, SLO e resposta a incidentes

Atualizado em: 2026-09-14

Estado: contrato operacional versionado e baseline remoto curto comprovado no staging; integrações de alertas, responsáveis humanos e teste de capacidade sustentado ainda são gates de lançamento.

Este runbook não afirma que existe monitoramento externo ativo. Ele define o que deve ser medido, como classificar impacto e quais evidências precisam existir antes de abrir a ORHA ao público.

## Princípios

- Conteúdo de perfil, pesquisa, mensagem, arquivo, áudio e denúncia nunca é telemetria.
- Analytics de produto é opt-in, desligado por padrão e separado de logs operacionais indispensáveis à segurança e disponibilidade.
- IDs de usuário, conversa e comunidade não entram em alertas ou dashboards gerais; investigação privilegiada usa a trilha auditada e o menor escopo possível.
- Ausência de evento consentido não significa ausência de usuário nem falha de produto.
- Métrica do navegador nunca substitui a autoridade do PostgreSQL, RLS, Storage, Auth ou Edge Functions.

## Indicadores e objetivos de lançamento

Janela padrão: 28 dias corridos. Percentuais excluem rejeições esperadas `4xx` causadas por credencial inválida, RLS, validação ou rate limit corretamente aplicado. Timeout, `5xx`, falha de rede no serviço e resposta inválida contam como erro.

| Fluxo | SLI | SLO inicial | Limite de latência saudável |
|---|---|---:|---:|
| Auth | logins/refreshes válidos concluídos | 99,9% | p95 ≤ 1,5 s; p99 ≤ 3 s |
| Leitura social | queries válidas de início, comunidade, explorar e perfil | 99,9% | p95 ≤ 1,2 s; p99 ≤ 2,5 s |
| Mutação social | amizade, membership, post, comentário e reação confirmados | 99,9% | p95 ≤ 1,5 s; p99 ≤ 3 s |
| Chat | mensagem aceita e persistida sem duplicação | 99,95% | p95 ≤ 1 s; p99 ≤ 2,5 s |
| Realtime | evento persistido recebido por participante conectado | 99,5% | p95 ≤ 2 s; p99 ≤ 5 s |
| Upload | reserva, envio, verificação e associação concluídos | 99,5% | p95 ≤ 10 s para mídia dentro do limite |
| Edge workers | execuções sem item perdido e reconciliação convergente | 99,9% | fila elegível mais antiga ≤ 15 min |
| PWA pública | app shell disponível e instalável | 99,9% | LCP p75 ≤ 2,5 s |

Metas de experiência no percentil 75: INP ≤ 200 ms e CLS ≤ 0,1. O gate local `npm run audit:bundle` limita a entrada JavaScript a 340 KiB gzip, CSS a 36 KiB gzip e o maior chunk lazy a 100 KiB gzip. Esses limites impedem crescimento silencioso; não provam Web Vitals de rede real.

## Baseline remoto de latência

Em 2026-09-14, `e2e/authenticated-load-baseline.spec.ts` passou no Supabase Staging com cinco identidades efêmeras autenticadas simultaneamente e cleanup verificado. O gate executou cinco logins reais e, após aquecimento, seis rodadas concorrentes de três leituras server-side, totalizando 90 consultas sociais sem interceptação, mock ou seed persistente.

| Operação | Amostras | Erros | p50 | p95 | p99 | Máximo |
|---|---:|---:|---:|---:|---:|---:|
| Auth por senha | 5 | 0 | 355 ms | 385 ms | 385 ms | 385 ms |
| Resumo da Home | 30 | 0 | 44 ms | 60 ms | 110 ms | 110 ms |
| Busca de perfis visíveis | 30 | 0 | 41 ms | 54 ms | 56 ms | 56 ms |
| Interesses descobríveis | 30 | 0 | 42 ms | 50 ms | 64 ms | 64 ms |

Esse resultado comprova conectividade concorrente básica e conformidade inicial com os SLOs acima no ambiente atual. Ele não mede pico público, saturação, backpressure nem estabilidade por 60 minutos. Antes do lançamento em massa ainda é obrigatório registrar o envelope de tráfego esperado e sustentar pelo menos 3× esse pico em ambiente e plano representativos de produção.

## Orçamento de erro e política de mudança

- Se um fluxo consumir 50% do orçamento na primeira metade da janela, congelar mudanças não essenciais nesse domínio.
- Se consumir 100%, suspender releases do domínio até causa-raiz, correção e recuperação do SLO.
- Incidente de segurança ou risco de perda/vazamento ignora orçamento: conter imediatamente.
- Mudança de limite ou SLO exige evidência, justificativa versionada e aprovação de operação; não se aumenta orçamento apenas para fazer CI passar.

## Alertas obrigatórios antes do lançamento

| Alerta | Condição inicial | Severidade |
|---|---|---|
| Auth indisponível | erro operacional > 2% por 5 min | SEV-1 |
| API/DB degradada | `5xx` > 1% ou p95 > 2× SLO por 10 min | SEV-1 |
| Mensagem não persistida | erro > 0,5% por 5 min | SEV-1 |
| Realtime atrasado | p95 > 5 s por 10 min | SEV-2 |
| Fila de worker parada | item elegível mais antigo > 15 min | SEV-1 |
| Upload/verificação degradado | erro > 2% por 10 min | SEV-2 |
| Storage/banco próximos do limite | utilização ≥ 80% | SEV-2 |
| Rate limit anormal | crescimento ≥ 3× baseline por 15 min | SEV-2; investigar abuso |
| Possível vazamento ou escalada | qualquer evidência | SEV-0 |

Os destinos de alerta, dashboards e integração de plantão permanecem bloqueadores externos até serem provisionados e testados. Um alerta só conta como ativo depois de um teste sintético recebido e reconhecido pelo responsável.

## Severidades e resposta

| Nível | Exemplo | Reconhecimento | Atualização |
|---|---|---:|---:|
| SEV-0 | vazamento, tomada de conta em massa, corrupção irreversível | imediato | a cada 15 min |
| SEV-1 | Auth/chat indisponível, perda potencial, worker crítico parado | 15 min | a cada 30 min |
| SEV-2 | degradação parcial ou latência grave com alternativa | 30 min | a cada 60 min |
| SEV-3 | defeito localizado sem risco de dados | próximo horário operacional | ao mudar estado |

Papéis mínimos por incidente: comandante, responsável técnico e comunicação. Uma pessoa pode acumular papéis apenas no início, mas o lançamento exige nomes, contatos, substitutos e escala registrados em superfície privada de operação; dados pessoais de plantão não pertencem ao Git.

## Sequência de contenção

1. Confirmar o sintoma por fonte independente e registrar início, ambiente, commit e migration.
2. Classificar severidade e domínio; preservar logs sem copiar conteúdo privado.
3. Conter a menor superfície possível: pausar workflow, cron ou feature afetada sem desligar RLS.
4. Para risco de dados, interromper escritas afetadas e preservar evidências antes de corrigir.
5. Preferir rollback de frontend compatível ou migration forward-fix; seguir `docs/ROLLBACK_RUNBOOK.md`.
6. Validar correção no staging, executar gates focados e smoke remoto.
7. Restaurar gradualmente, acompanhar SLI e reconciliar filas/dados.
8. Encerrar somente com causa-raiz, impacto, linha do tempo, prevenção e responsável registrados.

## Fontes e dashboards mínimos

- Supabase: Auth, API, PostgreSQL, Storage, Realtime, Edge Functions, Cron/Vault e consumo de limites.
- Host: disponibilidade HTTP 200 do root e deep links, TLS, cache e service worker.
- Cliente: somente eventos allowlisted pelo `AnalyticsPort` depois do opt-in; erros guardam categoria, rota lógica e versão, nunca mensagem/stack/URL integral.
- CI: migrations, RLS, testes, E2E, dependências, secrets, dívida de produção, bundle e host capability.

Dashboards mínimos: visão executiva de SLO/orçamento; Auth; banco/API; chat/Realtime; mídia/workers; segurança/abuso; release/deploy. Cada painel deve indicar fonte, unidade, janela, freshness e owner operacional.

## Gates de ativação

- [ ] Projeto de observabilidade provisionado e segregado por staging/produção.
- [ ] Eventos consentidos verificados sem payload privado.
- [ ] Logs operacionais com retenção e acesso definidos.
- [ ] Alertas acima implantados, disparados sinteticamente e reconhecidos.
- [ ] Responsáveis e substitutos registrados fora do Git.
- [x] Baseline remoto curto registra p50/p95/p99, erro e concorrência no staging.
- [ ] Teste de carga mede p95/p99, erro, concorrência e backpressure.
- [ ] Recovery/rollback exercitado no ambiente compatível.
- [ ] Dashboard acompanha limites do plano Supabase e do host.
- [ ] Processo de comunicação e pós-incidente aprovado.

Até todos os itens estarem comprovados, a ORHA não pode ser declarada operacional para as massas.
