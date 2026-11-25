# Plano — assinatura com chave própria

A chave da Anthropic deixa de ser um benefício da assinatura e passa a ser **uma segunda modalidade de assinatura**. Este plano muda a spec, o catálogo da Stripe, as regras de plano e de custeio, as telas de Plano e créditos e o card de preços da landing.

Decisões do dono (2026-11-20), com a pesquisa de SaaS (GitHub, Slack, Notion; proration e subscription schedules da Stripe):

- **Duas assinaturas.**
  - **Assinatura com créditos:** a de hoje, R$ 59/mês ou R$ 590/ano, US$ 12 ou US$ 120, com 600 créditos por mês.
  - **Assinatura com chave própria:** R$ 19,90/mês ou R$ 199/ano, US$ 5 ou US$ 50. Não traz créditos mensais; a IA é paga pela chave do usuário.
- **Só assina o plano com chave quem tem uma chave válida.** A chave é validada antes do Checkout.
- **Se a chave parar de funcionar, a cobrança continua.** O usuário compra pacotes avulsos e termina a tarefa com créditos depois de confirmar, com o "Finish with credits" que já existe.
- **Regras da chave:**
  - **Trocar a chave:** livre, a qualquer momento.
  - **Remover a chave:** só depois de cancelar o plano com chave, ou seja, com `cancelAtPeriodEnd`.
  - **Quando o plano com chave termina** (fim do período cancelado ou troca para a assinatura com créditos), a chave é apagada, salvo se houver uma cortesia ativa, que também usa a chave.
- **Os 10 créditos mensais para análise de vaga** continuam no plano com chave. O plano pago inclui o que o grátis tem.
- **Cancelar:** o usuário mantém o acesso até o fim do período pago, como já é hoje no portal da Stripe.
- **Excluir a conta:** nada é devolvido. Também já é assim: `removeForDeletion` cancela a assinatura sem reembolso.
- **Cortesia:** sem mudança. O dono usa a própria chave numa cortesia.

## Trocas entre planos

| De → para | Quando vale | Dinheiro | Créditos |
|---|---|---|---|
| Créditos (mensal ou anual) → chave | Na hora, por um Checkout novo | Sem devolução: o período pago vira créditos | O período já pago continua valendo em créditos: o mês corrente até o fim e, no anual, os 600 de cada mês que falta até a data em que o anual terminaria |
| Chave → créditos | Na hora (`subscriptions.update`, `billing_cycle_anchor: { type: "now" }`, `proration_behavior: "always_invoice"`, `payment_behavior: "pending_if_incomplete"`) | A Stripe desconta o tempo não usado da chave na primeira fatura | 600 do novo mês quando a fatura é paga; a chave é apagada |
| Mensal → anual, mesmo plano | Na hora, com proration | Paga a diferença | No plano com créditos, o ano começa e gera os créditos do mês |
| Anual → mensal, mesmo plano | No fim do ano pago (`schedule_at_period_end`) | Nada | Nada muda até lá |

**Por que a troca de chave para créditos não usa só proration.** Mantendo a data de renovação, quem está no dia 29 pagaria cerca de R$ 3 de diferença e receberia os 600 créditos do mês. Com o período recomeçando agora, ele paga R$ 59 menos o que sobrou da chave e recebe um mês inteiro.

**Por que créditos → chave usa um Checkout novo.** A troca já é para um plano mais barato, então não há diferença a cobrar. Cancelar a assinatura antiga e assinar a nova separa os dois períodos pagos:
- a linha da assinatura antiga guarda o seu período pago, e os créditos restantes continuam saindo dela;
- o Checkout cuida do cartão e do 3DS, e é o mesmo caminho de quem assina do zero;
- a assinatura antiga só é cancelada depois que a nova é paga. Se o Checkout for abandonado, nada muda.

**Portal da Stripe.** Uma configuração só não consegue limitar as trocas por produto. Listando os dois produtos, o portal deixaria trocar de créditos para chave sem validar a chave. Por isso:
- **Configuração padrão:** cartão, faturas e cancelamento. Sem troca de preço.
- **Configuração "changes":** usada só pelos links que o app abre (`flow_data: subscription_update_confirm`) para trocar mensal ↔ anual dentro do mesmo plano. Usa `proration_behavior: "always_invoice"` e `schedule_at_period_end` para quando o intervalo fica mais curto.
- `schedule_at_period_end` recebe `conditions: [{ type: "shortening_interval" }, { type: "decreasing_item_amount" }]` (conferido nos tipos do SDK da Stripe).

## Etapas

Cada etapa tem um commit, ou alguns, na branch `feat/key-plan`. Os testes ficam onde os de cobrança já estão: `billing-service.test.ts`, `credit-funding.test.ts` e `credit-ledger.test.ts`, com PGlite e a Stripe simulada no `StripeGateway`.

### K0 — docs

- **`docs/specs/billing.md`:**
  - "Credits": a oferta passa a ser Free, pacotes, assinatura com créditos e assinatura com chave própria.
  - "Plans and AI funding": a chave é um plano. O parágrafo "Bring your own key is a funding mode, not a separate plan" e o de quem adiciona uma chave no meio do mês dão lugar a uma seção nova, "Switching plans", com a tabela acima.
  - "Funding order": a ordem passa a depender do plano.
    - **Assinatura com créditos:** créditos do plano, depois créditos guardados com confirmação. A chave não entra.
    - **Assinatura com chave:** créditos herdados do plano anterior, depois a chave, depois créditos guardados com confirmação.
    - **Cortesia:** sem mudança.
  - "Subscription", "Credit packs" (Claude Max e Team ficam com o plano com chave), "Payments" (portal e configuração "changes") e "Prices" (preços da chave definidos).
- **`docs/specs/ai-platform.md`:** em "Bring your own key", a chave pertence ao plano com chave ou à cortesia. O modo "AI included" continua igual.
- **`docs/specs/resume-and-cover-letter.md`:** "the user's own key on a paid plan" passa a ser "on the own-key or courtesy plan".
- **`GLOSSARY.md`:**
  - "Plan" passa a listar Free, assinatura com créditos, assinatura com chave própria e cortesia.
  - Novos termos: **Credit subscription** (pt-BR "Assinatura com créditos") e **Own-key subscription** (pt-BR "Assinatura com chave própria"). Termo a evitar: "BYOK plan".
  - "AI funding" continua: quem paga cada chamada.

### K1 — catálogo e dados

- **`billing-catalog.ts`:**
  - produto `storytorole_own_key` e preços `own_key_monthly_v1` (500 / 1990) e `own_key_annual_v1` (5000 / 19900);
  - `checkoutProductSchema` ganha `own_key_monthly` e `own_key_annual`;
  - um `planOfProduct` mapeia o produto da Stripe para `"credits" | "own_key"`.
- **`stripe-setup.ts`:** cria o produto e os preços novos. Passa a **atualizar** a configuração padrão do portal (hoje só cria quando não existe) e cria a configuração "changes".
- **Schema (`billing-tables.ts`) e migration gerada (`add_subscription_plan`):**
  - `subscriptions.plan` (`"credits" | "own_key"`, padrão `credits`);
  - `subscriptions.replacedAt` (timestamp, nulo), que marca a assinatura com créditos trocada pela com chave e cujo período pago continua gerando créditos.
- **`syncSubscription`:** grava `plan` a partir do produto do item.
- **Teste:** um evento de assinatura com chave grava `plan = own_key`.

### K2 — plano, custeio e chave (TDD)

- **`currentPlan`:** `kind` passa a ser `free | subscription | own_key | courtesy`, e o retorno ganha `carryover`, a assinatura com créditos substituída cujo `paidPeriodEnd` ainda não passou.
- **`ensureMonthlyCredits`:**
  - **Assinatura com créditos:** como hoje.
  - **Plano com chave:** os meses do `carryover`, com a mesma origem `invoice:<id>:<mês>`, o que deixa a concessão idempotente com a do mês já concedido; mais os 10 de `monthly_free`.
  - **Cortesia e Free:** como hoje.
- **`decideFunding`:**
  - **Assinatura com créditos:** sempre `credits`, ignorando a chave.
  - **Plano com chave:** créditos do carryover primeiro, depois a chave ativa, senão `credits`, o que mantém a confirmação de hoje.
  - **`cap <= 0`:** a chave no plano com chave e na cortesia; senão a StoryToRole paga.
- **`AiKeysService`:**
  - `save` aceita a chave no plano com chave, na cortesia ou durante o Checkout do plano com chave (ver K3), e recusa nos demais casos;
  - `remove` recusa (`PRECONDITION_FAILED`) enquanto houver um plano com chave vivo sem `cancelAtPeriodEnd`;
  - o `syncSubscription` apaga a chave quando um plano com chave que estava ativo termina (fica inativo ou muda para o produto de créditos), salvo com cortesia ativa. Um primeiro pagamento ainda pendente não apaga a chave recém-validada.
  - um `planUsesKey(kind)` em `credit-plan.ts` diz quais planos usam chave.
- **Testes:**
  - Os casos de `credit-funding.test.ts` em "own keys and funding" são reescritos para os dois planos. O caso "spends a subscriber's plan credits before their key" vira o do carryover.
  - Casos novos:
    - quem tem a assinatura com créditos e uma chave salva continua pagando com créditos;
    - o plano com chave sem chave ativa pede confirmação;
    - o anual substituído gera os 600 de cada mês até a data antiga;
    - remover a chave é recusado sem cancelamento e aceito com ele;
    - a chave é apagada quando o plano termina e mantida com cortesia.

### K3 — checkout e trocas

- **`billing.startCheckout`:**
  - Para `own_key_*`, recebe `apiKey`, valida e salva a chave antes de criar a sessão. Uma chave `refused` não abre o Checkout.
  - Aceita um usuário com uma assinatura com créditos viva: é a migração. A sessão leva `metadata.replaces = <stripeSubscriptionId>`.
  - Qualquer outra assinatura viva continua dando `CONFLICT`.
- **`applyCheckout`:** quando a sessão paga tem `replaces`, cancela a assinatura antiga na hora (`subscriptions.cancel` com `prorate: false` e `invoice_now: false`) e grava `replacedAt`. Isso é idempotente: retorno do Checkout, webhook e reconciliação podem repetir o passo.
- **`billing.switchToCredits`:** quem está no plano com chave troca o preço (`subscriptions.update`, parâmetros da tabela). Com o pagamento pendente, a troca não se aplica e o app pede para atualizar o cartão no portal.
- **`billing.changeInterval`:** abre o portal com a configuração "changes" e `flow_data.subscription_update_confirm` para o preço do outro intervalo do mesmo plano.
- **`billing.status`:** passa a devolver `plan`, `carryoverEndsAt` (até quando valem os créditos herdados) e `scheduledInterval` (o intervalo agendado para o fim do período, gravado no sync a partir do subscription schedule).
- **Checkout expirado:** o evento `checkout.session.expired` (e a reconciliação, para os Checkouts expirados dos últimos 3 dias) apaga a chave guardada para um Checkout do plano com chave que ninguém pagou, salvo se o plano do usuário usar chave.
- **Volta para créditos:** os créditos herdados de uma assinatura com créditos substituída continuam chegando também depois de voltar para a assinatura com créditos.
- **Testes em `billing-service.test.ts`:**
  - Checkout do plano com chave recusa uma chave inválida e salva uma válida.
  - A migração cancela a assinatura antiga só depois do pagamento, sem duplicar nada numa segunda chamada.
  - A troca para créditos chama `subscriptions.update` com os parâmetros certos.
  - Os 600 da nova fatura são concedidos.

### K4 — telas do app

- **`billing-view.tsx`:**
  - O card "Seu plano" nomeia a assinatura (com créditos ou com chave própria), a renovação ou o fim e, depois de uma migração, os créditos herdados até a data.
  - As ofertas são três blocos:
    - assinatura com créditos (mensal e anual);
    - assinatura com chave própria (mensal e anual, com o campo da chave antes do botão);
    - pacote.
  - Botões de troca, cada um explicando o que acontece com dinheiro e créditos:
    - "Trocar para chave própria" para quem assina com créditos;
    - "Trocar para créditos" para quem assina com chave;
    - "Mudar para anual/mensal".
  - "Gerenciar pagamentos" continua levando ao portal (cartão, faturas, cancelar).
- **`own-key-section.tsx`:**
  - Aparece só no plano com chave ou na cortesia.
  - Trocar e verificar de novo continuam como estão.
  - "Remover" fica desabilitado, com uma dica, até o plano estar cancelado.
- **Medidor de créditos:** usa o texto de custeio por chave no plano com chave e não sugere mais "adicione sua chave" à assinatura com créditos.
- **Mensagens:** em en e pt-BR, rodando `intl:extract` e completando `translations/pt-BR.json`.
- **Verificação:** Playwright em `/app/billing` nos quatro estados (Free, créditos, chave, cortesia), claro e escuro, mais uma migração completa no sandbox com `stripe listen`.

### K5 — landing

O card de preços está na `feat/landing-page`, que ainda não foi para a `staging`. A branch que entrar por último faz o ajuste.

- **Cards:** Free, Assinatura com créditos (destaque), Assinatura com chave própria e Pacote, lidos do `billingCatalog`. Saem a nota sobre usar a própria chave e a pergunta do FAQ que diz que a chave é da assinatura.
- **FAQ "Posso usar minha chave de IA?":** responde com o plano de R$ 19,90 e a observação sobre Claude Max e Team.

## Fora do escopo

- **Assinantes com créditos que já têm chave salva:** hoje só há usuários de teste nesse estado. A chave fica guardada e não é usada. A spec registra que ela é apagada quando a pessoa sai de um plano que a usa.
- **Preço final:** os valores seguem como hipótese até o beta, como diz a seção "Prices" da spec.
