# Testes de produção do ORHA

A infraestrutura usa o runner oficial do Playwright e mantém o princípio
`search before build`: autenticação, isolamento de contexto, emulação de
dispositivos, traces e armazenamento de sessão são primitives do próprio
Playwright. Não há interceptação de requests nem injeção de `localStorage`.

Referências primárias: [instalação](https://playwright.dev/docs/intro),
[autenticação e múltiplos papéis](https://playwright.dev/docs/auth),
[projetos/viewports](https://playwright.dev/docs/test-projects) e
[testes de acessibilidade](https://playwright.dev/docs/accessibility-testing).

## Alvos

Sem `ORHA_E2E_BASE_URL`, a configuração compila o app e sobe o preview local
em `http://127.0.0.1:4173/`:

```powershell
npm run test:e2e:public
```

Para validar o GitHub Pages, informe a URL com o base path do repositório:

```powershell
$env:ORHA_E2E_BASE_URL='https://tonyrodrigues98.github.io/social-orha/'
npm run test:e2e:public
```

Os projetos públicos percorrem no Chromium 320×568, 375×667, 390×844,
393×852, 430×932, o limite do shell em 440×932 e os palcos desktop 1280×800 e
1440×900. O iPhone/WebKit 390×844 roda como verificação adicional. Eles
verificam Auth/guards, as rotas canônicas `/auth/login`, `/auth/signup`,
`/forgot-password` e `/reset-password`, um alias retrocompatível,
`prefers-reduced-motion`, overflow, tamanho mínimo de 16px em campos editáveis,
alvos interativos de pelo menos 44×44 CSS px, nomes acessíveis, IDs, WCAG A/AA
com `axe-core`, console e falhas HTTP/rede.
Essa cobertura é emulação automatizada; ela não equivale a um teste em iPhone
físico com Safari e teclado reais.

A suíte funcional bloqueia service workers para que Auth, guards e falhas de
rede não sejam mascarados por caches antigos. O projeto isolado `public-pwa-chromium`
os habilita e valida separadamente o manifest, seus ícones, a ativação do worker
e a reabertura offline honesta do app shell gerado para produção. A jornada
autenticada dedicada abre com worker real, recarrega sem rede, confirma que
perfil/conversas/comunidades não são apresentados como cache de servidor e
prova a reidratação automática da sessão ao reconectar.

O contrato de host é independente do roteamento no navegador:

```powershell
$env:ORHA_HOST_URL='https://tonyrodrigues98.github.io/social-orha/'
npm run audit:host
```

O comando falha se qualquer deep link responder `404`, redirecionar ou entregar
algo que não seja o app shell HTML com status `200`. Isso mantém explícita a
limitação atual do GitHub Pages mesmo quando `404.html` consegue recuperar a URL
depois que o navegador já recebeu uma resposta 404.

## Isolamento obrigatório de staging

As jornadas autenticadas nunca executam contra o Supabase de produção. O job
E2E compila um bundle local e o Playwright injeta nele apenas:

- `ORHA_STAGING_SUPABASE_URL`, armazenada como GitHub Actions Variable;
- `ORHA_STAGING_SUPABASE_PUBLISHABLE_KEY`, armazenada como GitHub Actions Secret;
- `ORHA_E2E_SUPABASE_HOST`, Variable usada para confirmar o destino exato.

Nenhum valor desses é registrado no YAML, nos exemplos ou nos logs. O preflight
exige origem HTTPS sem path, confirma que URL e host coincidem e rejeita
explicitamente o host de produção. Ele também rejeita `ORHA_E2E_BASE_URL` no
gate autenticado, impedindo que as contas persistentes sejam usadas por engano
no Pages implantado. `ORHA_E2E_BASE_URL` permanece válido apenas para a matriz
pública. O smoke pós-deploy testa o artefato de produção sem credenciais e sem
mutar dados.

## Sessões reais nomeadas

Copie apenas os nomes de `.env.e2e.example` para o cofre de secrets do ambiente.
As contas devem existir no Supabase e ter onboarding concluído:

- `ORHA_E2E_USER_A_EMAIL` / `ORHA_E2E_USER_A_PASSWORD` /
  `ORHA_E2E_USER_A_PROFILE_TEXT`
- `ORHA_E2E_USER_A_ROTATED_PASSWORD`, diferente da senha principal e com pelo
  menos 12 caracteres, para o teste reversível de troca de senha
- `ORHA_E2E_USER_B_EMAIL` / `ORHA_E2E_USER_B_PASSWORD` /
  `ORHA_E2E_USER_B_PROFILE_TEXT`
- `ORHA_E2E_ADMIN_EMAIL` / `ORHA_E2E_ADMIN_PASSWORD` /
  `ORHA_E2E_ADMIN_PROFILE_TEXT`
- `ORHA_E2E_MODERATOR_EMAIL` / `ORHA_E2E_MODERATOR_PASSWORD` /
  `ORHA_E2E_MODERATOR_PROFILE_TEXT`
- `ORHA_E2E_SUPPORT_EMAIL` / `ORHA_E2E_SUPPORT_PASSWORD` /
  `ORHA_E2E_SUPPORT_PROFILE_TEXT`
- `ORHA_E2E_SERVICE_ROLE_KEY`, pertencente ao mesmo projeto de staging e lida somente pelo processo Node para criar e
  remover usuários descartáveis da jornada Auth; ela nunca recebe prefixo
  `VITE_`, nunca entra no browser e não pode aparecer em artefatos
- `ORHA_E2E_EMAIL_DOMAIN`, um domínio catch-all dedicado aos cadastros
  temporários, e `ORHA_E2E_SMTP_DELIVERY_VERIFIED=true`, aprovação externa
  explícita da entrega SMTP

Todos esses secrets são obrigatórios no gate final. Os valores `*_PROFILE_TEXT`
confirmam visualmente a identidade esperada sem expor e-mail ou id. Os arquivos
de estado ficam temporariamente em `playwright/.auth/`, estão ignorados pelo Git
e são removidos pelo teardown global ao fim de cada execução. Eles nunca devem
virar artefatos públicos. Trace e vídeo ficam desativados nos projetos autenticados para que
tokens e credenciais não sejam incorporados a diagnósticos. A suíte pública
pode ser executada isoladamente sem secrets; a suíte autenticada nunca cria
sessão falsa e nunca é ignorada.

As cinco contas devem ser dedicadas ao gate, distintas e sem dados pessoais. A e
B precisam estar ativas, com onboarding concluído, inicialmente pesquisáveis e
com ao menos uma vaga livre na galeria de A. Admin, Moderador e Suporte precisam
ter exatamente os papéis correspondentes atribuídos pelo backend. A suíte normaliza amizade/bloqueio e restaura bio,
privacidade, associação à comunidade, preferências e senha ao terminar. As
comunidades de teste são arquivadas. Mensagens criadas pelo gate são excluídas
pela própria UI, removendo seus anexos e preservando apenas o tombstone de
auditoria; denúncias são encerradas pelo moderador e permanecem no histórico
append-only do produto.

O gate final executa um preflight que falha antes do browser se a configuração
isolada de staging, A, B, admin, moderador, suporte, marcadores ou senha rotativa estiverem ausentes
ou inconsistentes. Depois roda a matriz pública em
paralelo e as jornadas autenticadas com um único worker, porque elas mutam e
restauram as mesmas contas reais:

```powershell
npm run test:e2e:production
```

`npm run test:e2e` aponta para o mesmo gate integral. Use
`npm run test:e2e:public` quando quiser apenas a matriz sem credenciais.
No workflow de Pages, o gate integral valida contra o backend de staging o
bundle candidato antes da promoção. Depois do deploy, um segundo smoke público
roda contra a URL realmente implantada antes de o job ser considerado concluído;
as jornadas autenticadas não são repetidas em produção.

As jornadas autenticadas cobrem, pela UI e contra o Supabase real:

- cadastro real, confirmação por link Supabase, onboarding, reabertura da
  sessão, recovery/reset e remoção administrativa dos usuários temporários;
- amizade A↔B, incluindo aceite e remoção;
- comunidade, publicação, comentário, reação persistida e limpeza;
- solicitação/conversa, texto, imagem, áudio com waveform, recibo e preferência;
- perfil, galeria, privacidade cruzada e restauração;
- bloqueio, denúncia e ação administrativa de moderação;
- chamado persistente, resposta/estado em Realtime e isolamento da função Suporte;
- matriz de rotas de Usuário, Suporte, Moderador e Admin;
- troca reversível de senha, logout, troca de conta sem cache cruzado e deep links.

## Política contra falsos positivos

`scripts/e2e-test-contract.test.ts` rejeita interceptação de requests,
`route.fulfill`, `addInitScript`, escrita manual em storage e qualquer
`test.skip`/`fixme` dentro de `e2e/`.
Assim, uma UI alimentada apenas pelo provider de protótipo não pode simular um
login real para a suíte autenticada.

O link de confirmação/recovery é produzido pelo Admin API oficial apenas no
runner confiável e percorrido pelo browser real, sem injetar sessão. Isso prova
o token e o callback. A entrega da mensagem pertence ao provedor SMTP externo;
por isso o preflight falha sem a confirmação operacional explícita, em vez de
simular uma caixa de entrada. Consulte a
[referência `generateLink`](https://supabase.com/docs/reference/javascript/auth-admin-generatelink),
os [templates de e-mail](https://supabase.com/docs/guides/auth/auth-email-templates)
e a [configuração SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

`npm run audit:production-debt` inventaria `Prototype`, `mock`, `seed`, `TODO`,
`localStorage` e `createObjectURL` no código entregue. A dívida já conhecida
está declarada, arquivo por arquivo e com limite, em
`scripts/production-debt-allowlist.ts`. O baseline é exato: aumentos e reduções
quebram o gate até que a revisão remova ou ajuste conscientemente a exceção.

## Artefatos e diagnóstico

Falhas públicas preservam trace, screenshot e vídeo em `test-results/`.
Nos projetos autenticados, trace e vídeo permanecem desativados para proteger a
sessão; apenas a captura de falha das contas dedicadas é mantida. O relatório
HTML fica em `playwright-report/`. Para abrir o relatório local:

```powershell
npx playwright show-report
```
