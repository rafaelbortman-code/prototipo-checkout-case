# Allmart · Checkout Personalizado

Protótipo de um checkout que se adapta ao comprador: métodos de pagamento, oferta de parcelas, upsell/cross-sell e opções de entrega mudam conforme o perfil, o histórico e sinais em tempo real, sempre dentro das regras que o lojista configurou.

Construído para o case de **Staff Product Manager, Checkout** da VTEX.

## A ideia central

> O lojista define as regras. O motor personaliza dentro delas. Toda decisão tem uma hipótese e uma métrica.

O painel escuro no topo simula as três camadas:

| Camada | O que representa | Exemplos |
|---|---|---|
| **1 · Sinais do comprador** | Quem está comprando e em que contexto | Histórico de pedidos → segmento (`clientProfileData`), dispositivo, valor do carrinho |
| **2 · Regras do lojista** | O que a loja aceita e quais apps estão instalados | Métodos aceitos (Pix, Cartão, Koin), módulos de pagamento, apps extras |
| **3 · Decisões do motor** | O que o checkout fez, por quê e como medimos | `segment = card_affinity → inject(pix_nudge)` · hipótese · KPI · guardrail |

O motor (`runEngine`) é uma função pura: recebe sinais + regras e devolve o que renderizar, junto com a justificativa de cada decisão. Em produção seria um serviço (começando por regras e evoluindo para modelo), mas o contrato é o mesmo.

## Decisões de personalização

O segmento não é um rótulo manual: é inferido do histórico de pedidos.

| Histórico | Segmento |
|---|---|
| Nenhum pedido anterior | `new_user` |
| 4 pedidos · 3 no Pix · último há 12 dias | `pix_affinity` |
| 6 pedidos · 5 no cartão · média de 6x | `card_affinity` |

| Sinal | Decisão | Hipótese | KPI | Guardrail |
|---|---|---|---|---|
| Histórico: maioria dos pedidos no cartão, média de 6x | Cartão expandido, parcela máxima sem juros pré-selecionada | Quem já parcela decide pelo valor da parcela | Conversão em cartão | Custo de parcelamento (MDR) |
| Afinidade por cartão + loja aceita Pix | Nudge "economize R$ X fechando no Pix" | Migrar volume para Pix reduz MDR | Share de Pix | Conversão total |
| Histórico: maioria dos pedidos no Pix | Pix expandido + garantia estendida em 1 clique | Pix custa menos ao lojista, então sobra margem para um attach | Attach rate · AOV | Conversão |
| Histórico: nenhum pedido | Cadastro enxuto + frete expresso grátis travado | Tirar fricção e risco percebido da 1ª compra | Conversão de 1ª compra | Custo de frete por pedido |
| Dispositivo mobile | Pix via copia e cola (sem QR) e Pix primeiro para quem não tem preferência | QR Code não é escaneável na mesma tela | Pix gerado → Pix pago | — |
| Valor do carrinho | Parcelas sem juros por faixa (até 3x / 6x / 10x), com parcela mínima de R$ 50 | Não subsidiar juros em pedido pequeno | Conversão em cartão | Custo de parcelamento / GMV |
| Carrinho perto da próxima faixa | "Faltam R$ X para parcelar em 10x" | Uma meta próxima estimula adicionar item | Ticket médio | Abandono |
| Endereço perto de loja física | Retirada na loja oferecida; recomendada quando o frete é pago | Retirada zera o frete e entrega no mesmo dia | Share de retirada · custo logístico | NPS de entrega |

### O motor respeita as regras do lojista

- Se o lojista **desliga o Pix**, o nudge de Pix some e o comprador com afinidade por Pix cai no próximo método disponível, sem quebrar a experiência.
- Se só **um método** está habilitado, ele já vem selecionado.
- O **mix de pagamentos** só aparece se houver pelo menos dois métodos aceitos.
- O lojista não consegue desligar o último método de pagamento.

## Módulos do lojista

**payment.methods**: Pix · Cartão de Crédito · Koin (BNPL)

**payment.modules**
- **Mix de Pagamentos**: combina até 2 métodos, com slider para dividir o valor.
- **Cupons**: desconto percentual (`BEMVINDO10`) ou frete grátis (`FRETEGRATIS`), exibidos separados do desconto Pix.
- **Social Share**: opt-in do comprador para pagar metade e enviar o link para um amigo pagar o resto via WhatsApp. Parcelas, mix e descontos passam a valer sobre a metade do comprador.

**extra.apps**
- **VTEX Ads**: anúncio patrocinado de marca, variando por segmento, e cross-sell que libera frete grátis.
- **Save for Later**: tira um item do carrinho sem perder a venda do resto.
- **Retirada na loja**: pickup em loja próxima, personalizado pelo endereço do comprador.

## Roteiro de demo sugerido

1. **Cliente cartão, desktop** (estado inicial): cartão expandido em 6x, nudge de Pix e "faltam R$ 50 para 10x". Ligue VTEX Ads e adicione dois acessórios: o frete zera e a oferta sobe para 10x.
2. **Regras do lojista**: desligue o Pix e veja o nudge sumir e a decisão de fallback aparecer no log. Ligue a Retirada na loja: ela aparece primeiro, como recomendada.
3. **Novo usuário, mobile**: Pix primeiro, copia e cola em vez de QR, frete expresso grátis. Confirme o pedido para ver a tela de sucesso adaptada.
4. **Social Share**: marque o opt-in e veja o total, as parcelas (limitadas pela parcela mínima) e o mix recalcularem sobre a metade.

## Como foi construído

- **v0 (Vercel)** para o esqueleto inicial em Next.js, React e Tailwind a partir de um briefing de produto.
- **Claude** para iterar sobre regras de negócio, revisar edge cases e refinar o motor de decisão, com os prompts guardados como parte do processo.
- Todo o estado é local (sem backend): o foco é a experiência e a lógica de decisão, não a integração.

## O que mudaria em produção

- **Sinais reais**: `orderForm.clientProfileData` e o histórico de pedidos vindo de OMS / Master Data / CDP, em vez de históricos simulados por persona.
- **Motor como serviço**: regras versionadas por lojista, com evolução para modelo (propensão por método de pagamento, elasticidade de parcela).
- **Experimentação**: cada decisão do log vira um experimento com holdout, medindo o KPI e respeitando o guardrail.
- **Custo real de parcelamento**: faixas de parcelas derivadas do MDR e da margem de cada lojista, não fixas.

## Rodando localmente

```bash
pnpm install
pnpm dev
```

Abra [http://localhost:3000](http://localhost:3000). O componente principal está em `components/modular-checkout.tsx`.

Este repositório está conectado a um [projeto v0](https://v0.app/chat/projects/prj_7MRLwwLujP8wmfHulOHlppDlj6Px); cada merge na `main` gera um novo deploy.
