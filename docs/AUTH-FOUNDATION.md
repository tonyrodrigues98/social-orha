# Fundação de Auth da ORHA

## Jornada implementada

1. Splash restaura a sessão persistida.
2. Sem sessão: boas-vindas, entrar, criar conta ou recuperar senha.
3. Cadastro exige e-mail, senha mínima de oito caracteres, confirmação 18+ e aceite legal.
4. E-mail confirmado retorna ao app e inicia o onboarding.
5. Dados obrigatórios: nome, username único, nascimento 18+, estado, cidade e bio.
6. Depois da bio, a pessoa pode concluir ou enriquecer personalidade, interesses, hobbies, viagens e favoritos.
7. Perfil concluído libera o shell principal; sair remove a sessão local.

## Autorização

Os valores persistidos em `public.app_role` são `super_admin`, `admin`, `moderator`, `support` e `user`. A interface apresenta os nomes SuperAdmin, Admin, Moderador, Suporte e Usuário.

Todo usuário de Auth recebe automaticamente `profiles`, `profile_details`, `profile_privacy` e `user_roles` por trigger. O role inicial é sempre `user`. As policies permitem ler o próprio role, mas não inserir nem atualizar roles pelo cliente. Promoções futuras deverão acontecer apenas por backend confiável ou operação administrativa auditada.

## Segurança e operação

- RLS está habilitado em todas as tabelas públicas de identidade.
- Usuários atualizam apenas o próprio perfil, detalhes e privacidade.
- As tabelas brutas de perfil são legíveis apenas pelo próprio titular; descoberta social usa a RPC mascarada, que aplica privacidade por campo e amizade.
- Idade, username e campos obrigatórios são validados também no banco.
- A publishable key é a única chave disponível no frontend.
- Confirmação de e-mail está ativa, TOTP preexistente foi preservado e o OTP permanece com oito dígitos.
- Redirects de confirmação, reenvio e recuperação preservam `import.meta.env.BASE_URL`, incluindo `/social-orha/`. A URL do GitHub Pages está versionada em `supabase/config.toml`; a configuração remota deve ser conferida após o push.

Migrations versionadas:

- `20260811040000_auth_and_onboarding_foundation.sql`: fundação inicial de Auth e onboarding.
- `20260816130000_security_privacy_hardening.sql`: leitura bruta owner-only, privacidade mascarada, amizades sem follow, solicitações de conversa separadas e endurecimento de grants/payloads.

A presença do arquivo no repositório não prova aplicação no banco remoto. Use um push controlado, audite registros legados e valide as constraints marcadas inicialmente como `NOT VALID` antes de declarar o ambiente de produção atualizado.
