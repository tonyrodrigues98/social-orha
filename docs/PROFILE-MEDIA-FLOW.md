# Fluxo de mídia do perfil

Decisão atualizada em 2026-08-16 para o ORHA nativo-first.

## Fluxo persistente

1. A tela valida quantidade, MIME, limite de 10 MB e até 12.000 pixels por lado antes de iniciar qualquer processamento.
2. `react-easy-crop` fornece o enquadramento de avatar e capa; a galeria preserva a imagem inteira.
3. O processor decodifica a imagem, respeita orientação quando o navegador oferece `createImageBitmap`, reduz sem ampliar e gera WebP por Canvas.
4. `reserve_profile_media` cria um registro `pending` e devolve bucket/caminho autorizados pelo servidor.
5. O adapter envia o arquivo processado ao bucket privado `profile-media` usando a sessão Supabase.
6. A Edge Function `media-verify` baixa o objeto com `service_role`, compara tamanho, assinatura real, MIME e dimensões e somente então chama `finalize_validated_profile_media`, que não é executável pelo navegador.
7. A leitura usa URLs assinadas; TanStack Query renova a consulta antes da expiração, tenta novamente em 30 segundos quando somente uma assinatura falha e atualiza o estado autoritativo após upload/remoção.

Falhas de upload ou verificação pedem `remove_profile_media`, que muda o registro para `deleting`. O navegador não apaga o objeto referenciado; `media-cleanup-worker`, autenticado como worker, remove o Storage e somente depois chama `complete_profile_media_cleanup`. Se nem o agendamento puder ser concluído, reservas `pending` com mais de uma hora continuam descobertas pela mesma fila. Depois que `finalize_validated_profile_media` confirma o commit, uma falha transitória ao emitir a URL assinada não transforma o upload concluído em falha nem induz o usuário a duplicá-lo. URLs criadas com `URL.createObjectURL` existem somente durante validação/crop e são revogadas; nunca são armazenadas como estado final do perfil.

Ao substituir avatar/capa, a promoção server-side muda a mídia anterior para `deleting`. O worker privilegiado repete `list_profile_media_cleanup`/`complete_profile_media_cleanup` até convergir; o navegador não recebe permissão para executar esse contrato operacional.

## Bibliotecas escolhidas

- **Yet Another React Lightbox** continua sendo o visualizador fullscreen da galeria, com portal, foco, teclado e gestos. Referência: <https://yet-another-react-lightbox.com/documentation>.
- **react-easy-crop** fornece a área de recorte, enquanto o processor local transforma o resultado em um arquivo persistível. Referência: <https://github.com/ValentinH/react-easy-crop>.
- **TanStack Query** mantém identidade, preferências e mídia sincronizadas após cada mutação. Referência: <https://tanstack.com/query/latest/docs/framework/react/overview>.
- **Supabase Storage** permanece privado e entrega mídia por URLs assinadas. Referência: <https://supabase.com/docs/guides/storage/serving/downloads>.

## Por que Uppy XHR não foi conectado

`@uppy/core`, `@uppy/react` e `@uppy/xhr-upload` continuam instalados. O fluxo atual, porém, trabalha com no máximo nove imagens já processadas e arquivos de até 10 MB, além de depender de uma reserva/finalização transacional própria. O SDK oficial do Supabase Storage cobre esse transporte diretamente e preserva a sessão e o contrato de bucket sem um endpoint XHR paralelo.

Uppy pode ser adotado quando houver upload retomável, lotes maiores, providers externos ou uma UX de fila que justifique seu estado adicional. Conectar `XHRUpload` agora duplicaria autenticação e tratamento de erros sem melhorar o contrato existente.

## Provisionamento

O frontend contém os adapters e testes com cliente/Storage injetáveis. A migration que cria tabela, RPCs, bucket e políticas precisa ser aplicada e validada no projeto Supabase antes de considerar o upload disponível em produção. A presença do código não comprova que o ambiente remoto já recebeu esse provisionamento.

As validações no navegador protegem a experiência, mas não são a fronteira de segurança. `media-verify` agora confere os bytes, formato, tamanho e dimensões antes da promoção. Decodificação integral, antivírus e moderação visual continuam sendo camadas adicionais a provisionar quando a política de produção exigir; a inspeção atual não deve ser descrita como substituta dessas camadas.
