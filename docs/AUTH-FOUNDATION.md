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
- Perfis incompletos não são visíveis para outras contas autenticadas.
- Idade, username e campos obrigatórios são validados também no banco.
- A publishable key é a única chave disponível no frontend.
- Confirmação de e-mail está ativa, TOTP preexistente foi preservado e o OTP permanece com oito dígitos.
- Enquanto não houver domínio, os redirects permitidos são os previews locais na porta 5173. Ao publicar, o domínio deverá ser adicionado a `site_url` e `additional_redirect_urls` antes do primeiro lançamento.

A migration aplicada é `20260811040000_auth_and_onboarding_foundation.sql`.
