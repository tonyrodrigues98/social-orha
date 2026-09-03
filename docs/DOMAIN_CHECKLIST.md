# ORHA — Checklist de domínio e host

Última verificação operacional: 2026-08-16.

## Estado atual

- URL: <https://tonyrodrigues98.github.io/social-orha/>.
- GitHub Pages público, workflow ativo e HTTPS forçado.
- `cname: null`; nenhum arquivo `CNAME` no `main`.
- Nenhum domínio definitivo foi informado.
- Nenhuma credencial DNS foi encontrada.
- `/social-orha/auth/login` retorna `404` quando aberto diretamente.
- Pages não possui `custom_404` configurado.
- Manifest atual usa `/social-orha/` em `id`, `start_url` e `scope`.
- Supabase Auth permite o URL do Pages e URLs locais na configuração local, mas o domínio definitivo ainda não pode estar validado.

## 1. Informações externas necessárias

- [ ] Domínio definitivo.
- [ ] Escolha canônica: apex (`orha.tld`) ou `www`.
- [ ] Provedor DNS.
- [ ] Acesso DNS com menor privilégio possível.
- [ ] E-mail administrativo para certificado e recuperação.
- [ ] Decisão de host após o teste de deep links.

Não criar domínio fictício nem presumir provedor.

## 2. Gate de host

O host precisa oferecer:

- [ ] fallback SPA para rotas desconhecidas;
- [ ] reload direto de rotas privadas e públicas;
- [ ] HTTPS;
- [ ] domínio customizado;
- [ ] headers necessários;
- [ ] PWA e service worker no escopo correto;
- [ ] preview separado de produção;
- [ ] rollback por commit;
- [ ] cache control previsível.

GitHub Pages reprova hoje o fallback SPA. A verificação de 2026-08-16 confirmou
`200` na raiz e `404` em rotas diretas de Auth e conversas. O script
`npm run audit:host`, com `ORHA_HOST_URL`, transforma essa capacidade em gate
executável e não aceita o redirecionamento client-side de `404.html` como `200`.
Sem controle de rewrite no Pages, deve-se usar um host que reescreva rotas para
`index.html`; acesso ao novo host e ao DNS é o bloqueador externo restante.

## 3. Configuração DNS

- [ ] Reduzir TTL antes do cutover.
- [ ] Configurar os registros recomendados pelo host atual.
- [ ] Para subdomínio no GitHub Pages, apontar `CNAME` para `tonyrodrigues98.github.io`.
- [ ] Para apex, obter os registros atuais na documentação oficial do host; não copiar IPs antigos de runbooks.
- [ ] Remover registros conflitantes.
- [ ] Avaliar CAA para a autoridade certificadora do host.
- [ ] Verificar DNS autoritativo em múltiplos resolvedores.
- [ ] Registrar owner e data do cutover.

Comandos de verificação:

```powershell
Resolve-DnsName <dominio>
Resolve-DnsName -Type CNAME <subdominio>
```

## 4. GitHub Pages, se mantido

- [ ] Configurar domínio no Pages.
- [ ] Versionar `CNAME` com o domínio exato.
- [ ] Confirmar `https_enforced` após emissão do certificado.
- [ ] Garantir que o workflow publique o `CNAME` dentro do artifact.
- [ ] Confirmar `200` em `/`, `/auth/login`, `/reset-password`, `/perfil/<username>` e `/conversas/<id>`.
- [ ] Confirmar que uma rota inexistente mostra 404 interno, não o 404 do GitHub.

## 5. Aplicação e PWA

Ao sair do subcaminho `/social-orha/` para domínio raiz:

- [ ] alterar `base` para a raiz do host;
- [ ] alterar manifest `id`, `start_url` e `scope` para `/`;
- [ ] revisar paths de ícones e assets;
- [ ] revisar canonical e Open Graph;
- [ ] reservar Apple Touch icon e favicons;
- [ ] validar installability;
- [ ] impedir que o service worker antigo mantenha shell de `/social-orha/`;
- [ ] testar atualização sem perder formulários;
- [ ] testar standalone e offline honesto.

A base e os metadados já são parametrizados por `VITE_ORHA_BASE_PATH` e
`VITE_ORHA_PUBLIC_ORIGIN`. O modo Pages usa `/social-orha/`; o domínio definitivo
usa `/` sem alteração de fonte. O fluxo de update já preserva rascunhos
autenticados em armazenamento de sessão, isolados por usuário/rota e sem
senhas/arquivos. O PWA não promete dados sociais offline: o shell explica a
limitação e reidrata a identidade automaticamente quando a conexão volta.

## 6. Supabase Auth

- [ ] Definir Site URL como `https://<dominio>/`.
- [ ] Adicionar redirects exatos de produção.
- [ ] Adicionar apenas previews autorizados.
- [ ] Manter localhost necessário ao desenvolvimento.
- [ ] Validar callback de confirmação de e-mail.
- [ ] Validar recuperação de senha em `/reset-password`.
- [ ] Validar retorno após OAuth.
- [ ] Remover redirects antigos somente após o cutover estável.

Para Google OAuth, o redirect autorizado no Google deve apontar para:

```text
https://iuaczhkfmwpyhtpdmuyt.supabase.co/auth/v1/callback
```

O app continua responsável por fornecer `redirectTo` permitido no domínio final.

## 7. HTTPS e headers

- [ ] Certificado válido para todas as variantes usadas.
- [ ] HTTP redireciona para HTTPS.
- [ ] HSTS somente depois de confirmar o domínio.
- [ ] `Content-Security-Policy` compatível com Supabase, mídia e PWA.
- [ ] `X-Content-Type-Options: nosniff`.
- [ ] `Referrer-Policy`.
- [ ] `Permissions-Policy` para câmera/microfone conforme uso real.
- [ ] Proteção contra framing conforme os fluxos aprovados.

O GitHub Pages observado não forneceu CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` ou `X-Frame-Options` na raiz.

## 8. Smoke de cutover

- [ ] Raiz responde `200`.
- [ ] Deep links respondem `200` e hidratam a tela correta.
- [ ] Auth confirmation e password reset chegam e retornam.
- [ ] Sessão persiste após reload.
- [ ] Google OAuth retorna ao domínio correto, quando ativado.
- [ ] API, Storage e WebSocket funcionam sem mixed content.
- [ ] Manifest, ícones e `sw.js` respondem corretamente.
- [ ] PWA instalada abre no domínio final.
- [ ] Canonical e Open Graph usam o domínio final.
- [ ] Nenhum request crítico usa `/social-orha/` indevidamente.

## 9. Rollback de domínio

- [ ] Preservar redirects do host anterior durante a janela de cutover.
- [ ] Registrar TTL anterior e registros anteriores.
- [ ] Confirmar que Auth aceita temporariamente o host de rollback.
- [ ] Não retirar o domínio antigo antes de validar sessões e recuperação de senha.
- [ ] Seguir `docs/ROLLBACK_RUNBOOK.md` em caso de falha.
