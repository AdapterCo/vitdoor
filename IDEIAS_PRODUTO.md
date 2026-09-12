# Funcionalidades comerciais para o VitDoor

Propostas para avaliação; não representam recursos implementados nesta entrega.

## Direção recomendada

Transformar a tela em um canal que leva o público a uma ação e permite ao anunciante acompanhar o resultado. QR Code, NFC e cartão digital devem compartilhar o mesmo destino gerenciável e a mesma campanha, preservando a origem da interação.

Métricas de QR já estão disponíveis em concorrentes como [ScreenCloud](https://screencloud.com/learn/generate-qr-codes-for-your-links-directly-within-canvas). Por isso, a hipótese de diferenciação aqui é combinar operação local, atendimento e resgate confirmado em uma experiência simples — não reivindicar exclusividade sobre QR ou NFC.

| Funcionalidade | Experiência | Valor comercial | Dependências |
| --- | --- | --- | --- |
| Cartão digital com catálogo e ações | QR ou NFC abre perfil do anunciante, produtos, preços, mapa, contato para salvar e formulário de orçamento. Destino alterável sem reimprimir a etiqueta. | O anunciante ganha uma página comercial gerenciável junto com a veiculação. | Evoluir o cartão existente; disponibilidade de produto e contato configuradas pelo anunciante. |
| Cupom com resgate confirmado | Visitante recebe código único; estabelecimento valida uma vez no painel, com validade e regras claras. | Liga campanha, tela e mídia a um resgate concreto. | Registro de resgate, prevenção de duplicidade e operação do estabelecimento. |
| Relatório do percurso até o resultado | Exibições reportadas → acessos QR/NFC → cliques → orçamento enviado → cupom resgatado. | Facilita demonstrar o valor do anúncio e comparar pontos/horários. | Instrumentação por evento e definições claras de cada métrica. |
| Fila virtual pelo celular | QR/NFC permite retirar senha, acompanhar posição e receber aviso no navegador quando disponível. | Dá utilidade diária à plataforma em clínicas, lojas e atendimento público. | Estender filas existentes; limites de emissão e operação da recepção. WhatsApp exige integração separada. |
| Portal do anunciante | Cliente envia anúncio, escolhe período/pontos disponíveis e acompanha aprovação e resultados. | Reduz atendimento manual e facilita renovação de campanhas. | Inventário de espaços, papéis/permissões e aprovação antes da publicação. |
| Ofertas ligadas à operação | Retirar produto esgotado e trocar oferta conforme estoque, horário ou disponibilidade do serviço. | Evita anunciar indisponibilidade e torna a programação mais relevante. | Integração com estoque/PDV ou atualização manual estruturada; fallback em falhas. |
| Comparação de anúncios | Alternar duas peças em condições semelhantes e comparar taxas de interação e resgate. | Ajuda o anunciante a melhorar o resultado continuamente. | Volume mínimo, distribuição comparável e indicação de incerteza; não declarar vencedor com poucas interações. |

## Primeira entrega sugerida

1. Evoluir cartão digital existente com catálogo, formulário de orçamento e contato para salvar.
2. Lançar cupom único com validação pelo estabelecimento.
3. Exibir relatório por anunciante, campanha e ponto, com origem QR/NFC e resgates.

Piloto sugerido: poucos estabelecimentos que aceitem validar cupons na operação real. Medir adesão dos operadores, taxa de acesso para emissão e de emissão para resgate, tempo de atendimento e interesse do anunciante em renovar. Só depois expandir para portal de compra de anúncios ou integrações com PDV.

## Regras para métricas confiáveis

- Proof-of-play é reprodução informada pelo dispositivo; não significa pessoa que viu o anúncio.
- Abrir WhatsApp não comprova mensagem enviada nem venda.
- Diferenciar acesso, clique, formulário enviado, resgate e venda confirmada.
- NFC físico da tela e QR da mídia são origens diferentes. Em multizona, oferecer escolha quando a origem não identifica a peça com segurança.
- Não exigir identificação pessoal para consultar catálogo; pedir apenas dados necessários quando o visitante solicita contato.
- Uma etiqueta NFC estática pode manter o mesmo endereço e receber novos destinos; não presumir que todo aparelho permita regravar etiquetas ou interagir com NFC pelo navegador.
