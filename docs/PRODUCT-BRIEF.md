# ORHA — definição permanente do produto

## Propósito

ORHA é uma rede social cristã para maiores de 18 anos. Seu propósito é aproximar pessoas por meio de contato direto, comunidades, gostos semelhantes e conversas reais. O produto terá muitas funções, mas todas devem reforçar pertencimento, expressão pessoal e segurança.

## Direção da experiência

- **Native-first, nunca mobile-first:** o produto nasce como app PWA, não como site responsivo.
- iPhone é uma superfície prioritária: respeitar `safe-area-inset-*`, orientação retrato, toque, home indicator e modo standalone.
- Em desktop, apresentar o app em um palco de dispositivo; não esticar a interface como página web.
- As bibliotecas instaladas são a base estrutural e visual. Aplicar sempre a regra **search before build**.
- Serviços externos futuros permanecem atrás de adapters.

## Navegação principal

1. **Início:** hub inicial e direcionamento para participar da comunidade.
2. **Comunidade:** afinidades, conversas comunitárias e encontro real de pessoas com interesses semelhantes.
3. **Explorar:** catálogo amplo de tudo que existe no app, incluindo loja, cinema, pets, avatar, comunidades e pessoas.
4. **Conversas:** mensagens privadas entre amigos, desconhecidos com solicitação aceita e grupos.
5. **Perfil:** expressão e personalização extensas do usuário.

## Regras sociais

- Não existe sistema de follow.
- Solicitação de conversa aceita apenas libera a conversa.
- Amizade exige uma solicitação separada, iniciada no perfil e aceita pela outra pessoa.
- Postagens são públicas por padrão.
- Modo namoro é exclusivo para maiores de 18 anos, privado e desativado por padrão; seu desenho ainda será definido.
- Moderação segue a base esperada de uma rede social.

## Cadastro e onboarding

- Supabase é o backend, banco de dados e Auth oficial.
- Primeira versão: e-mail e senha. Google entra depois.
- Roles permanentes: **SuperAdmin**, **Admin**, **Moderador**, **Suporte** e **Usuário**. Todo cadastro público começa como Usuário; permissões detalhadas serão criadas futuramente.
- O cliente nunca pode atribuir ou alterar roles.
- A sessão é persistente e renovada pelo Supabase Auth; cadastro exige confirmação de e-mail e senha mínima de oito caracteres.
- Etapas obrigatórias iniciais: nome completo, `@username`, aniversário com seletor no padrão iOS, estado, cidade dependente do estado e bio.
- Idade mínima: 18 anos.
- Depois da base, o usuário pode concluir ou pular enriquecimentos: personalidade, estação preferida, energia social, fim de semana, viagens realizadas e desejadas, interesses, filmes, séries, músicas, artistas, livros, jogos e hobbies.
- Igreja e hobbies são opcionais.

## Perfil

O perfil deve permitir galeria, bio, hobbies, igreja opcional, gostos e coleções pessoais. APIs públicas permitirão pesquisar e selecionar até cinco itens por categoria — por exemplo filmes, músicas, artistas, séries e livros. Cada exposição respeitará as configurações de privacidade do usuário.
