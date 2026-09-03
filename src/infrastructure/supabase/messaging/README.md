# Mensageria Supabase do ORHA

Esta camada consome o schema de lançamento definido em
`supabase/migrations/20260816170000_social_launch_schema.sql`. Não há dados
simulados nem fallback local em produção.

## Autoridade e contratos

- `request_conversation` e `respond_to_conversation_request` controlam pedidos
  de conversa 1:1.
- `create_group_conversation`, `respond_to_group_invitation`,
  `invite_group_members`, `remove_group_member` e `set_group_member_role`
  controlam grupos e administradores.
- `send_message` recebe `p_client_message_id`; a restrição parcial por conversa,
  remetente e id do cliente torna retries idempotentes.
- `forward_message` cria uma cópia lógica autorizada e preserva anexos privados
  por referência imutável.
- `delete_message` aplica a regra sender-only e faz exclusão lógica.
- `mark_message_delivered` e `mark_message_read` são os únicos caminhos de
  escrita para receipts.
- Reações usam o enum fechado `like`, `love`, `amen`, `pray` e `support`.

O bucket privado canônico é `chat-media`. A UI recebe somente URLs assinadas de
15 minutos. A allowlist é JPG, PNG, WebP, AVIF, WebM/MP4/MPEG/OGG de áudio e PDF,
com limite de 25 MB.

## Realtime privado

Cada conversa usa exatamente o tópico privado `conversation:<uuid>`. Postgres
Changes atualiza mensagens, anexos, reações, receipts e preferências. Presence e
typing usam o mesmo canal privado; o teardown envia `typing=false`, executa
`untrack()` e remove o canal. Eventos repetidos são deduplicados e typing possui
TTL local para não permanecer visível após perda de conexão.

## Ponto de integração

`AppRuntimeProviders` monta o `QueryClientProvider` compartilhado e o
`SupabaseMessagingProvider`. Para testes, ambos os pontos continuam injetáveis:

```tsx
<SupabaseMessagingProvider services={fakeServices}>
  <FeatureUnderTest />
</SupabaseMessagingProvider>
```

O factory `createSupabaseMessagingServices(client)` aceita um `SupabaseClient`
injetado; assim, repository, Storage e Realtime podem ser testados sem rede.
