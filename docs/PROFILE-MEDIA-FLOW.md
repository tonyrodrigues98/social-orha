# Fluxo de mídia do perfil

Decisão registrada em 2026-08-16 para o protótipo nativo-first do ORHA.

## Implementado agora

- **Yet Another React Lightbox** é o visualizador da galeria. Ele já fazia parte do catálogo instalado e fornece portal, foco, teclado, gestos, navegação, rótulos e estados de carregamento sem recriar um lightbox manual. Referência oficial: <https://yet-another-react-lightbox.com/documentation>.
- A seleção local aceita JPEG, PNG, WebP e AVIF, com limite de 10 MB por arquivo e nove fotos na galeria.
- Arquivos são decodificados antes de `setCoverImage` ou `addGalleryImages`; MIME, tamanho ou extensão declarada não são tratados como prova suficiente de uma imagem utilizável.
- Imagens visíveis reservam dimensões, registram as dimensões naturais para o lightbox e exibem um estado de erro textual quando o carregamento falha.

## Decisões de integração

### Uppy

`@uppy/core`, `@uppy/react` e `@uppy/xhr-upload` permanecem instalados, mas o transporte XHR **não foi ativado**. Ainda não há bucket do Supabase Storage, política RLS de objetos, endpoint autorizado, limite de quota ou contrato de persistência de mídia provisionados. Apontar o XHR para um destino improvisado criaria um upload aparentemente funcional sem isolamento por usuário.

Quando o Storage for provisionado, o Uppy deve entrar atrás de um adapter de mídia com autenticação da sessão, caminho por `user_id`, políticas de leitura/escrita, validação no servidor e limpeza de uploads órfãos.

### react-easy-crop

O crop não foi exposto nesta etapa. `react-easy-crop` entrega a área de recorte, mas um resultado durável exige também pipeline de canvas/blob, correção de orientação, redução de imagens grandes no iPhone, escolha de formato/qualidade, modal com foco contido e persistência no Storage. Sem esses contratos, o usuário editaria uma imagem que desapareceria ao recarregar. A biblioteca continua como candidata para o editor completo depois do adapter de Storage. Referência oficial: <https://github.com/ValentinH/react-easy-crop>.
