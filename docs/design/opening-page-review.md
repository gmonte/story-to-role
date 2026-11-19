# Revisão de UX — a tela da vaga (opening)

> **Owner's revision (after seeing O1).** This review's proposal was adjusted; where it differs, these decisions win:
>
> - **No opening agent.** ADR 0010 is withdrawn. One agent per document; the resume's and the cover letter's agents each receive what the user answered and chose for the opening (gap answers with their links, the letter's story, motivation, approved company facts, application instructions) and work independently.
> - **The opening page is one screen with three columns, no Opening/Fit tabs:** Application on the left (the full tracker summary), the opening's description in the center (warning signs marked), Fit on the right (band, Check again, preference conflicts, requirement cards with the gap question inside each card). The “Context” block is gone; the application instructions show in the resume and cover letter pages.
> - **Header:** title and company, chips, `⋯` menu, one primary action per state and a compact switch **Opening · Resume · Cover letter** (replacing the five journey tabs).
> - **Resume and Cover letter are full-screen pages** (document workspace: index, findings and instructions left, document center, agent, preview and versions right) without the application controls, with a slim header (“← Company · Title” and the switch); their empty states are full screen too.
> - **Narrow screens:** below about 1280 px the Application column is a sheet behind a header button and Fit goes below the description; below `lg` everything stacks.
> - **Later:** an Applications page with list and kanban views (plan, O2).

Revisão de design da tela de uma vaga no StoryToRole: como ela está hoje, por que confunde, e uma proposta de estrutura única para todos os estados e abas. Baseada no código (`apps/web/src/domains/{openings,applications,documents,workspace}`), nas specs (`docs/specs/workspace.md`, `resume-and-cover-letter.md`, `tracker.md`) e em capturas do app rodando em `localhost:3000` com a usuária de teste Ana Souza (capturas em `/Users/monte/.claude/jobs/fde2d46e/tmp/ux-*.png`).

A queixa do dono, resumida: *“à esquerda vejo o questionário antes da descrição; à direita o que bate ou não com o perfil e, lá embaixo, gerar currículo e pesquisar empresa; gerando o currículo, abre um formulário do tracker no alto à direita e o currículo/carta aparecem à esquerda em abas; vaga e carta mantêm a coluna direita, o currículo troca as duas colunas”*. Confirmei cada ponto no código e nas capturas. Ela está certa, e o problema é estrutural, não de polimento.

---

## 1. Como a tela está hoje (arquitetura de informação)

A tela usa o `WorkspaceBody` (centro + painel direito redimensionável, sem coluna esquerda própria). O que vai em cada coluna depende de **duas variáveis combinadas**: o estado da vaga/candidatura e o parâmetro `?view=` (opening | resume | letter). Mapa real, por estado:

| Estado | `view` | Centro (`OpeningView`) | Painel direito (`OpeningPanel`) |
|---|---|---|---|
| **Analisando** (`processing`) | — | `AiAtWork` com 4 passos, centralizado | vazio (`FitCheckPanel` retorna null; tracker não existe) |
| **Analisada**, sem documentos | opening | Título, empresa, badge de tom, **Fechar**; abas `Vaga · Carta de apresentação` (sem `Currículo`, pois não existe); **perguntas de lacuna** (“Antes de escrever para esta vaga”); link “Texto da vaga”; **Descrição** por último | **Análise** (faixa de aderência, conflitos de preferências, aviso “publicado de novo” + Verificar de novo, N cards de requisito, “Nunca recomendar X”), **Documentos** (Gerar currículo), **Documentos semelhantes** (Usar como está / Ajustar / Gerar uma nova versão), **Contexto**, **Pesquisa da empresa** |
| Analisada | letter (sem carta) | Barra no topo com as abas + título em cinza; centro = `CoverLetterPrep` (escolha da história + Iniciar entrevista / Pular → entrevista → pontos → Gerar carta) | **o mesmo painel de Análise** de cima (o documento não existe, então não há `DocumentSidePanel`) |
| Analisada | resume (sem currículo) | cai no layout `opening`, **mas nenhuma aba fica selecionada** (bug: `Tabs value="resume"` sem trigger) | Análise… |
| **Em preparação** (há documento) | opening | igual ao analisado, mas abas `Vaga · Currículo · Carta de apresentação` | **Candidatura primeiro** (select de status, Marcar como enviada, Fonte, Tipo, Currículo enviado, Próximo passo, Observações, Por que desistiu, Salvar, Adicionar como regra de descarte, Excluir a empresa, formulário de evento, linha do tempo) e **só depois** Análise, Documentos (+ ATS, cobertura, destaques), Semelhantes, Contexto, Pesquisa |
| Em preparação | resume | Barra no topo com as abas + título em cinza; **três colunas internas**: índice + apontamentos (esq.), editor (centro) | Abas `Agente · Pré-visualização · Versões` e, **abaixo delas, o formulário inteiro do tracker** de novo |
| Em preparação | letter (com carta) | idem ao currículo, com índice de parágrafos | idem |
| Em preparação | resume, **gerando** | progresso (`GenerationProgress`) no lugar do documento | painel de Análise (o `OpeningPanel` só mostra o painel do documento quando `!resumeGenerating`) |
| Analisada, **gerando o primeiro** currículo | opening | sem aba `Currículo` ainda (só aparece com versão salva); o progresso fica no bloco Documentos **do painel direito, abaixo da dobra** | Análise + progresso |
| **Enviada / em processo / encerrada** | opening | igual | Candidatura (status, enviados, eventos) e o resto |
| **Externa** | opening | caixa “você se candidatou fora…” + Analisar | só Candidatura |

### A jornada vista pela pessoa

1. Cola a vaga → progresso bonito e claro (`ux-*` não capturado em processamento; o componente `AiAtWork` está certo).
2. Chega na vaga analisada: o olho pousa num **questionário** (“Você já precisou projetar…?”) antes de ter lido a descrição. À direita, uma faixa “Aderência alta/baixa” e uma lista longa de cards. Não há nenhum botão de “e agora?” no centro: o único botão perto do título é **Fechar**.
3. Para gerar o currículo tem que descobrir que o botão está no painel direito, **depois** de 3 a 8 cards de requisito (captura `ux-o3-panel-bottom.png`). Ali há três caminhos concorrentes: “Gerar currículo”, três cards de “Documentos semelhantes” (Usar como está / Ajustar / Adaptar e usar) e “Gerar uma nova versão”.
4. Gera → a tela não muda de aba sozinha enquanto gera; o progresso fica abaixo da dobra à direita. Quando termina, nasce a aba **Currículo** e, no topo do painel direito, **brota um formulário do tracker** com 8 campos e dois botões destrutivos (“Excluir a empresa”, “Adicionar como regra de descarte”) — sem que a pessoa tenha pedido nada de tracker (`ux-prep-Aurora-opening.png`).
5. Clica em Currículo → **tudo muda**: o título vira texto cinza numa barra, as abas sobem para o canto superior esquerdo, surge uma coluna de índice à esquerda, o painel direito vira `Agente · Pré-visualização · Versões` com o tracker pendurado embaixo (`ux-prep-Aurora-resume.png`).
6. Clica em Carta → se a carta existe, mesma coisa do currículo; se não existe, o centro vira a preparação (história + entrevista), mas o painel direito volta a ser a **Análise** (`ux-o3-letter.png`). Dois “Carta” diferentes com duas colunas direitas diferentes.
7. Para marcar como enviada: botão no painel direito, só na aba Vaga e nas de documento… mas na preparação da carta, não (o painel é o da Análise).
8. Pesquisa da empresa — insumo da carta — mora no fim do painel da aba **Vaga**, invisível de dentro da aba Carta.

---

## 2. Pontos concretos de confusão

Em ordem de dano:

1. **Não há um lugar fixo para “o próximo passo”.** A ação principal muda de lugar por estado: Gerar currículo (painel direito, no fundo), Iniciar entrevista (centro, aba Carta), Marcar como enviada (painel direito, no topo), Verificar de novo (painel direito, meio). O centro da aba Vaga não tem nenhuma ação primária; o botão mais visível é **Fechar**, que encerra a vaga.
2. **O layout salta entre abas.** Aba Vaga: 2 colunas, título grande, abas abaixo do título. Aba Currículo: 3 colunas, título em cinza, abas no topo, painel direito trocado. Aba Carta: ora como Vaga, ora como Currículo. Nada ancora a pessoa; ela precisa reaprender a tela a cada clique.
3. **O painel direito é um saco de blocos cuja ordem muda com o estado.** Análise→Documentos→Semelhantes→Contexto→Pesquisa; com candidatura, Candidatura entra na frente de tudo; em documento, vira Agente/Pré-visualização/Versões + tracker. Blocos com peso muito diferente (uma faixa de aderência vs. um formulário de 8 campos) competem no mesmo scroll. A spec de workspace pede “quatro blocos sempre mostrados” (Análise, Documentos, Contexto, Uso) — hoje há sete, nenhum fixo.
4. **Questionário antes da descrição.** As perguntas de lacuna (“Antes de escrever para esta vaga”) vêm acima da Descrição, e a Descrição é a última coisa da página. O texto da pergunta refere-se a requisitos que a pessoa ainda não leu. Além disso a pergunta está no centro e o requisito (card “Lacuna · sistemas de baixa latência”) está no painel direito: a mesma lacuna aparece em dois lugares, sem ligação visual.
5. **O formulário do tracker aparece sem ser pedido e sempre aberto.** Em “Em preparação” não há nada a registrar além de “Marcar como enviada”; mesmo assim Fonte, Tipo, Próximo passo, Observações, “Por que você desistiu”, “Excluir a empresa” e o formulário de evento ficam expandidos, no topo do painel, em todas as abas. “Por que você desistiu” aparecendo antes de a pessoa sequer enviar a candidatura é um sinal de que a seção não tem estado.
6. **Três caminhos concorrentes para o mesmo currículo**, em três lugares: bloco Documentos (“Gerar currículo”), bloco Semelhantes (“Usar como está / Ajustar / Adaptar e usar” + “Gerar uma nova versão”) e, depois, na aba Versões (“Nova versão”, “Gerar de novo”, “Duplicar”). A spec descreve três formas *de um fluxo só*; a interface as espalha.
7. **As abas mudam de quantidade** (Currículo só existe depois da primeira versão) e **podem ficar sem seleção** (`?view=resume` sem currículo). Enquanto o primeiro currículo é gerado não há aba para onde ir; o progresso fica abaixo da dobra à direita (viola “IA trabalhando é visível e mágica”).
8. **Insumos da carta longe da carta.** Pesquisa da empresa e Contexto (instruções) moram no painel da aba Vaga; a entrevista de motivação e a escolha da história moram no centro da aba Carta. A pessoa não enxerga o conjunto “o que a carta vai usar”.
9. **Duplicações e títulos iguais para coisas diferentes.** “Documentos” é um bloco do painel da Vaga e também o título da aba Versões; o tracker aparece inteiro em três abas; o aviso “Uma dica com base no seu perfil publicado…” e o “publicado de novo… Verificar de novo” repetem-se em toda vaga, empurrando o conteúdo.
10. **Terminologia desalinhada.** O bloco chama-se **Análise**, mas a faixa diz **Aderência** e o glossário diz *fit check*; o item da sidebar é **Acompanhamento**, o bloco é **Candidatura**; “Fechar” (encerrar a vaga) parece botão de fechar painel; “Nova versão / Gerar de novo / Gerar uma nova versão / Ajustar / Adaptar e usar / Duplicar / Recriar” são sete verbos para três conceitos da spec (usar como está, ajustar, gerar).
11. **Mobile não funciona.** O painel direito é `hidden lg:block`: em telas estreitas não há aderência, não há Gerar currículo, não há tracker — a vaga é só título e descrição (`ux-mobile-prep-opening.png`). O editor exige `min-w-[40rem]`.
12. **Destrutivo junto do primário.** “Salvar” ao lado de “Adicionar como regra de descarte” e “Excluir a empresa”; “Nunca recomendar X de novo” no fim da Análise. Nenhum pede confirmação visível.

---

## 3. Proposta: uma estrutura só, em todos os estados e abas

### Princípio

Copiar o que funciona em **Minha carreira** (`ux-career.png`): três regiões com papéis fixos — **esquerda = orientação** (índice + apontamentos), **centro = o trabalho**, **direita = assistente e contexto** (Agente / Fontes em abas). A tela da vaga ganha o mesmo esqueleto, e o que muda ao trocar de aba é **só o conteúdo do centro e da coluna esquerda**, nunca a posição das abas, do título, do botão principal nem a natureza da coluna direita.

A vaga passa a ser lida como uma **jornada de quatro etapas**, que também é a navegação:

```
Vaga  →  Aderência  →  Documentos (Currículo | Carta)  →  Candidatura
```

Elas correspondem às seções já existentes no produto (descrição; fit check + perguntas de lacuna; workspace de documentos; tracker) e aos grupos da sidebar (Analisadas → Em preparação → Enviada…). A etapa “Documentos” tem duas sub-abas porque currículo e carta são independentes (spec).

### O esqueleto (igual em todos os estados)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Pessoa Desenvolvedora Backend Pleno · Aurora Pagamentos      [Aderência média] [Em preparação]  ⋯  │  ← cabeçalho FIXO
│ ( Vaga ) ( Aderência · 2 perguntas ) ( Currículo · 1 ) ( Carta · — ) ( Candidatura )   [ ▶ Próxima ação ] │  ← etapas FIXAS + CTA FIXO
├──────────────┬────────────────────────────────────────────────┬──────────────────────┤
│ ESQUERDA     │ CENTRO                                         │ DIREITA              │
│ índice da    │ conteúdo da etapa ativa                        │ ( Agente ) ( Aderência ) ( Candidatura ) │
│ etapa ativa  │                                                │ sempre as mesmas 3   │
│ + apontam.   │                                                │ abas, em toda etapa  │
└──────────────┴────────────────────────────────────────────────┴──────────────────────┘
```

- **Cabeçalho fixo** (`sticky`): título + empresa (sempre `h1`, nunca vira texto cinza), chips de estado (faixa de aderência, status da candidatura, tom sugerido, “Sem vaga aberta”, avisos de golpe como chip amarelo com popover), o menu `⋯` com as ações raras (Encerrar/Reabrir vaga, Nunca recomendar a empresa, Excluir a empresa das preferências, Abrir o texto da vaga) e **um botão primário** que é sempre “o próximo passo” (tabela abaixo).
- **Etapas** (`Tabs` do shadcn, sempre as cinco, mesmo vazias): cada uma mostra um mini-estado (“2 perguntas”, “1 versão”, “—”, “Em preparação”). Uma aba vazia leva a um estado vazio com o CTA, nunca some. O `?view=` continua na URL (`vaga|aderencia|curriculo|carta|candidatura`).
- **Coluna direita, três abas fixas**: **Agente** (o agente da vaga na etapa Vaga/Aderência/Candidatura, o agente do documento nas etapas Currículo/Carta — mesma caixa, contexto trocado), **Aderência** (versão compacta do fit check: faixa, conflitos, lista de requisitos com verredito; clicar num requisito abre a etapa Aderência rolada até ele) e **Candidatura** (resumo: status, próximo passo, último evento, “Marcar como enviada”; “Editar detalhes” leva à etapa Candidatura). Mesma largura, mesma posição, em toda etapa. A **pré-visualização do PDF** deixa de ser aba do painel e vira a **quarta coluna** que o `WorkspaceBody` já suporta (`preview`/`previewOpen`, como a prévia de fontes em Minha carreira), aberta por um botão “Pré-visualizar PDF” na barra do editor. As **versões** já têm abas na barra do editor (`DocumentToolbar`); as ações de versão (Renomear, Duplicar, Gerar de novo, Histórico, ZIP, Excluir) vão para um `DropdownMenu` ao lado delas.
- **Coluna esquerda**: nas etapas de documento, o que já existe (índice + apontamentos). Nas outras etapas, o **índice da jornada**: um checklist vertical das etapas com o estado de cada uma (✓ Vaga lida · ● Aderência média, 2 perguntas sem resposta · ○ Currículo · ○ Carta · ○ Enviar), mais o bloco **Contexto** (instruções e substituições desta candidatura) — é “o que a IA usa”, pertence à orientação, não ao assistente.

### Ação primária por estado (o botão do cabeçalho)

| Estado | Botão primário | Secundário visível |
|---|---|---|
| Analisando | (nenhum; o centro é o progresso) | — |
| Sem perfil publicado | **Ir para Minha carreira** | Executar a análise (desabilitado com motivo) |
| Analisada, perguntas de lacuna pendentes | **Responder 2 perguntas** (abre Aderência) | Gerar currículo |
| Analisada, sem pendências | **Gerar currículo** | Usar um semelhante |
| Currículo gerando | (progresso no centro da etapa Currículo, que abre sozinha) | — |
| Currículo pronto, sem carta | **Escrever a carta** (abre Carta) | Marcar como enviada |
| Currículo e carta prontos | **Marcar como enviada** | Baixar tudo (ZIP) |
| Enviada / em processo | **Registrar o que aconteceu** (abre Candidatura no formulário de evento) | Mudar status |
| Encerrada (contratada, recusada, desistiu, sem resposta) | **Reabrir** (no menu) | — |
| Externa (sem análise) | **Analisar esta vaga** | — |
| Sem vaga aberta (unsolicited) | **Escrever a carta** | Gerar currículo |
| Rejeitada (não parece vaga) | **Adicionar de novo** | — |

A regra é uma só: o botão diz o que a pessoa faria a seguir se seguisse o método; nunca bloqueia (avisos, não gates), e o custo em créditos continua ao lado dele (`CreditCost`).

### O que mora em cada etapa (centro)

**Vaga.** Descrição primeiro (é o que a pessoa colou), com os requisitos extraídos destacados em linha (sublinhado leve + chip de verredito ao passar o mouse — a trace que o editor já faz, aplicada ao texto da vaga). Abaixo: notas, link do texto original, tom sugerido (editável), idioma detectado. Nada de questionário aqui.

**Aderência.** A faixa e sua explicação uma vez só; conflitos de preferência; depois a lista de requisitos ordenada (Lacuna → Parcial → Atendido). **A pergunta de lacuna fica dentro do card do requisito** a que pertence (“Lacuna · sistemas de baixa latência — *Você já precisou…?* [Eu tenho] [Não tenho]”), em vez de um questionário separado. O botão “Verificar de novo” fica no cabeçalho desta etapa, com o aviso “perfil publicado de novo” só quando for verdade. Aqui também o atalho “Nunca recomendar esta empresa”.

**Currículo.** Sem versão: estado vazio com as **três formas da spec como três cartões** — *Gerar do perfil* (primário), *Ajustar um existente* (lista dos semelhantes, com “Usar como está” dentro de cada um), *Adaptar de outro idioma*. Com versão: o workspace de documento como hoje (índice + apontamentos à esquerda, editor no centro), com a **revisão de cobertura, ATS e “o que esta versão destaca” na coluna esquerda**, abaixo dos apontamentos (são apontamentos, não assistente). Gerando: o progresso (`GenerationProgress`) ocupa o centro e a etapa abre sozinha ao clicar em Gerar.

**Carta.** Sub-etapas em linha no topo do centro: *História → Motivação → Fatos da empresa → Carta*. A escolha da história, a entrevista e a **pesquisa da empresa** (com a seleção de fatos) vivem aqui, uma abaixo da outra num só scroll, cada uma com estado (“Pulada”, “3 fatos selecionados”), e o botão “Gerar carta” no fim e no cabeçalho. Com a carta escrita, o mesmo workspace do currículo; os insumos ficam acessíveis num `Collapsible` “O que a carta usou” acima do documento.

**Candidatura.** O tracker inteiro, com estado: um cabeçalho com o `Select` de status + “Marcar como enviada”; **Detalhes** (Fonte, Tipo, Currículo enviado) num `Card` compacto; **Linha do tempo** com o formulário de evento no topo; **Próximo passo e Observações** (com a nota de criptografia); e, num `Collapsible` fechado por padrão “Desistir desta vaga”, o motivo + “Adicionar como regra de descarte” + “Excluir a empresa”. Fica igual à página Acompanhamento aberta na candidatura, o que dá coerência entre os dois.

### Estados vazios e de carregamento

- **Analisando**: como hoje, mas dentro do esqueleto (cabeçalho com título “Lendo a vaga…”, etapas presentes e desabilitadas, Vaga mostrando a descrição colada enquanto a IA trabalha). A pessoa já pode ler o que colou.
- **Gerando documento**: a etapa abre sozinha; a aba mostra um ponto pulsante (“Currículo · gerando”); o centro mostra os passos; o painel direito continua lá (Aderência e Candidatura seguem úteis enquanto espera).
- **Pesquisando empresa / entrevista pensando**: `AiAtWork` no lugar da sub-etapa, não um spinner no botão.
- **Aba vazia**: um parágrafo + o CTA + o custo, nunca uma aba que some.

### Mobile (< `lg`)

- Cabeçalho fixo com título e CTA; etapas como `Tabs` roláveis horizontalmente.
- Coluna direita vira um botão “Aderência · média” e “Candidatura · em preparação” no cabeçalho que abrem um `Sheet` (ou `Drawer`) pela direita; o Agente vira um FAB que abre o chat em tela cheia.
- Coluna esquerda (índice/apontamentos) vira o primeiro item de um `Accordion` acima do conteúdo (“Índice e apontamentos (2)”).
- Editor em leitura por padrão com toque para editar; pré-visualização do PDF em tela cheia. `min-w-[40rem]` passa a valer só para `lg+`.

---

## 4. Wireframes

### 4.1 Analisada, com perguntas de lacuna (etapa Aderência aberta pelo CTA)

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ Desenvolvedor(a) Backend · BetMais        [● Aderência baixa] [Tom: Direto] [⚠ 1 aviso] ⋯ │
│ ( Vaga ) (● Aderência · 1 pergunta ) ( Currículo · — ) ( Carta · — ) ( Candidatura · — ) │
│                                                                  [ Responder 1 pergunta ] │
├───────────────┬────────────────────────────────────────────────┬──────────────────────────┤
│ JORNADA       │ Aderência baixa                                │ (Agente)(Aderência)(Cand.)│
│ ✓ Vaga        │ Uma dica do seu perfil publicado; você decide. │                          │
│ ● Aderência   │ [Verificar de novo · até 3 créditos]           │  Agente da vaga          │
│   1 pergunta  │                                                │  “Pergunte sobre esta    │
│ ○ Currículo   │ ▣ Contraria suas preferências (3)              │   vaga, ou peça uma      │
│ ○ Carta       │   remoto · R$ 12.000 · setor apostas           │   comparação com outra”  │
│ ○ Enviar      │                                                │                          │
│               │ LACUNA · Habilidade · Desejável                │  [ sugestões ]           │
│ CONTEXTO      │ sistemas de baixa latência                     │                          │
│ Só o seu      │ Nenhum trecho do perfil comprova…              │                          │
│ perfil.       │ ┌ Você já precisou fazer um sistema responder…┐│                          │
│               │ │ [Eu tenho] [Não tenho]                      ││                          │
│               │ │ (Conte o que você fez…)   Onde? ☐ Beta ☐ …  ││                          │
│               │ └──────────────────────── [Salvar resposta] ─┘│                          │
│               │ LACUNA · Modelo de trabalho · Obrigatório      │                          │
│               │ Trabalho presencial, 5 dias/semana             │                          │
│               │ (preferência: só remoto)                       │ ┌──────────────────────┐ │
│               │ PARCIAL · APIs REST …                          │ │ Conte o que você fez │ │
│               │ ATENDIDO · SQL …  ATENDIDO · Python …          │ └────────────────── ➤ ┘ │
└───────────────┴────────────────────────────────────────────────┴──────────────────────────┘
```

### 4.2 Analisada, etapa Currículo vazia (o CTA do cabeçalho é “Gerar currículo”)

```
│ ( Vaga ) ( Aderência ✓ ) (● Currículo · — ) ( Carta · — ) ( Candidatura · — )  [ Gerar currículo · até 45 ] │
├───────────────┬────────────────────────────────────────────────┬──────────────────────────┤
│ JORNADA       │ Ainda não há currículo para esta vaga.         │ (Agente)(Aderência)(Cand.)│
│ ✓ Vaga        │ Escrito só do seu perfil publicado; depois     │                          │
│ ✓ Aderência   │ você revisa cada linha. Seja qual for a        │  Aderência alta          │
│ ● Currículo   │ aderência.                                     │  ▣ 0 conflitos           │
│ ○ Carta       │                                                │  ● Python        Atendido│
│ ○ Enviar      │ ┌ Gerar do perfil ──────────┐                  │  ● Remoto        Atendido│
│               │ │ [ Gerar currículo ]        │                  │  ● Python básico Atendido│
│ CONTEXTO      │ └────────────────────────────┘                  │                          │
│ Só o seu      │ ┌ Partir de um documento parecido ──────────┐  │  (abre a etapa ao clicar)│
│ perfil.       │ │ Banco Sigma · Português  [Usar como está] │  │                          │
│               │ │                          [Ajustar]        │  │                          │
│               │ │ Biblioteca · Backend Python · Inglês      │  │                          │
│               │ │                 [Adaptar e usar] [Ajustar]│  │                          │
│               │ └───────────────────────────────────────────┘  │                          │
```

### 4.3 Em preparação, currículo aberto (a única coisa que muda é o centro e a esquerda)

```
│ Pessoa Desenvolvedora Backend Pleno · Aurora Pagamentos   [● Aderência média] [Em preparação] ⋯ │
│ ( Vaga ) ( Aderência ✓ ) (● Currículo · 1 ) ( Carta · 1 ) ( Candidatura )  [ Marcar como enviada ] │
├───────────────┬────────────────────────────────────────────────┬──────────────────────────┤
│ ÍNDICE        │ [Português] [+]  ▌Seu perfil ▌Editado …   Salvo ↶ Desfazer  [Prévia PDF] [⬇] ⋯ │(Agente)(Aderência)(Cand.)│
│ Competências  │ ⚠ A versão 5 do perfil é mais nova  [Usar a versão 5]        │                  │
│ Experiência   │ ┌──────────────────────────────────────────────┐             │ Agente do        │
│  Empresa Beta │ │ Ana Souza                                    │             │ currículo        │
│  Empresa Gama │ │ Pessoa Desenvolvedora Backend Pleno | …      │             │                  │
│ Formação      │ │ COMPETÊNCIAS                                 │             │ Selecione uma    │
│ Idiomas       │ │ Linguagens e APIs: Python, FastAPI, SQL      │             │ linha ou um      │
│               │ │ EXPERIÊNCIA PROFISSIONAL                     │             │ apontamento…     │
│ APONTAM. (2)  │ │ Empresa Beta …                               │             │                  │
│ Trazer p/ topo│ │                                              │             │                  │
│ [💬][Ignorar] │ │                                              │             │                  │
│               │ └──────────────────────────────────────────────┘             │ ┌──────────────┐ │
│ REVISÃO DE    │                                                               │ │ Pergunte…  ➤ │ │
│ COBERTURA ✓   │                                                               │ └──────────────┘ │
│ ATS 7 de 8    │                                                               │                  │
│ Destaques (4) │                                                               │                  │
```
A quarta coluna (pré-visualização do PDF) abre à direita do painel ao clicar em **Prévia PDF**, como a prévia de fontes em Minha carreira.

### 4.4 Etapa Carta, antes de escrever

```
│ ( Vaga ) ( Aderência ✓ ) ( Currículo · 1 ) (● Carta · — ) ( Candidatura )      [ Gerar carta · até N ] │
├───────────────┬────────────────────────────────────────────────┬──────────────────────────┤
│ JORNADA       │  ● História   ○ Motivação   ○ Fatos da empresa  ○ Carta                   │
│ …             │                                                │ (Agente)(Aderência)(Cand.)│
│ ● Carta       │ HISTÓRIA — a que a carta vai contar            │                          │
│   história ✓  │ (•) Reduzi o tempo de resposta… · Empresa Beta │  Candidatura             │
│   motivação – │ ( ) Automatizei o deploy… · Atende: CI/CD      │  Em preparação           │
│   empresa  –  │                                                │  Próximo passo: —        │
│               │ MOTIVAÇÃO — 3 a 5 perguntas, voz ou texto      │  [Marcar como enviada]   │
│ CONTEXTO      │ [ Iniciar a entrevista ]  Pular                │  Editar detalhes →       │
│ 2 instruções  │                                                │                          │
│               │ FATOS DA EMPRESA — até 20 créditos             │                          │
│               │ [ Pesquisar a Aurora Pagamentos ]              │                          │
│               │                                                │                          │
│               │ CARTA — a partir do currículo [Português ▾]    │                          │
│               │ [ Gerar carta ]                                │                          │
```

### 4.5 Etapa Candidatura

```
│ ( Vaga ) ( Aderência ✓ ) ( Currículo · 1 ) ( Carta · 1 ) (● Candidatura · Enviada )  [ Registrar o que aconteceu ] │
├───────────────┬────────────────────────────────────────────────┬──────────────────────────┤
│ JORNADA       │ Status  [Enviada ▾]        Enviada em 17 nov   │ (Agente)(Aderência)(Cand.)│
│ ✓ ✓ ✓ ✓ ● Enviar │ Enviados: Currículo · Português (como estava em 17 nov) · Carta · Português │
│               │                                                │                          │
│               │ DETALHES                 LINHA DO TEMPO         │                          │
│               │ Fonte [LinkedIn ▾]       [O que aconteceu…][quando][Adicionar]            │
│               │ Tipo  [Simplificada ▾]   17 nov  Em preparação → Enviada                  │
│               │ Próximo passo [ … ]      17 nov  Currículo gerado                          │
│               │ Observações  [ … ]  🔒 nunca vão para a IA                                  │
│               │                                                │                          │
│               │ ▸ Desistir desta vaga (motivo, regra de descarte, excluir empresa)          │
```

### 4.6 Mobile (390 px)

```
┌─────────────────────────────┐
│ ☰  Aurora Pagamentos        │
│ Pessoa Desenvolvedora …     │
│ [● média] [Em preparação]   │
│ [ Marcar como enviada ]     │
│ (Vaga)(Aderência)(Currículo)(Carta)(Cand.) ⟶ rola │
├─────────────────────────────┤
│ ▸ Índice e apontamentos (2) │
│ ─────────────────────────── │
│ conteúdo da etapa           │
│ …                           │
│                             │
│                     (💬)    │  ← agente
└─────────────────────────────┘
```

---

## 5. Lista priorizada de mudanças

### Ganhos rápidos (sem mudar a estrutura; 1–3 dias no total)

1. **Corrigir a aba sem seleção** quando `?view=resume` sem currículo: redirecionar para `opening` (`opening-view.tsx`, cálculo de `view`).
2. **Descrição antes das perguntas de lacuna** no centro; a seção de perguntas ganha um link “ver o requisito” para o card correspondente.
3. **Cabeçalho fixo com as abas e o CTA**: tirar as abas de dentro do scroll do centro e da barra cinza dos documentos; um só lugar, acima de tudo, com o título sempre em `h1`. Ação primária por estado (tabela acima) ao lado das abas. “Fechar” vai para um menu `⋯` e vira “Encerrar vaga”.
4. **Sempre as mesmas abas** (Vaga · Currículo · Carta), com estado vazio + CTA na aba sem documento; ao clicar em Gerar, abrir a aba e mostrar o progresso no centro.
5. **Painel direito em ordem fixa**: Análise sempre primeiro; **Candidatura vira um resumo** (status + “Marcar como enviada” + próximo passo) com “Editar detalhes” num `Collapsible`; o restante do formulário fechado por padrão; “Desistir” em `Collapsible` separado com os botões destrutivos.
6. **Mostrar o aviso da faixa só uma vez** (tooltip na faixa) e o “publicado de novo → Verificar de novo” apenas quando `outdated`.
7. **Renomear**: bloco “Análise” → “Aderência”; “Candidatura” (bloco) e “Acompanhamento” (sidebar) → um só termo (sugestão: **Candidatura** na vaga, **Candidaturas** na sidebar); unificar os verbos de versão para os três da spec: **Gerar** (do perfil), **Ajustar** (de uma versão), **Usar como está**; “Adaptar” só para idioma.
8. **Mobile mínimo**: deixar o painel direito renderizar abaixo do centro em `< lg` (ou num `Sheet`), em vez de `hidden`.

### Reestruturação média (1–2 semanas)

9. **Etapa Aderência** com as perguntas de lacuna dentro do card do requisito; o bloco Análise do painel vira a versão compacta (clicável).
10. **Etapa Currículo vazia** com os três cartões (Gerar / Partir de um parecido / Adaptar), absorvendo “Documentos semelhantes”.
11. **Etapa Carta** com as sub-etapas História → Motivação → Fatos da empresa → Carta, absorvendo Pesquisa da empresa e Contexto.
12. **Etapa Candidatura** no centro (o tracker completo), compartilhando componentes com a página Acompanhamento.
13. **Revisão de cobertura, ATS e destaques** para a coluna esquerda do workspace (abaixo dos apontamentos); ações de versão num `DropdownMenu` na barra do editor.

### Reestruturação maior (depende de decisões)

14. **Coluna direita unificada** `Agente · Aderência · Candidatura` em toda etapa, com o agente da vaga nas etapas sem documento (depende da decisão `chat.agent`/ADR pendente) e a pré-visualização do PDF como quarta coluna via `WorkspaceBody.preview`.
15. **Coluna esquerda “Jornada”** (checklist das etapas + Contexto) nas etapas sem documento, dando ao centro a mesma anatomia de Minha carreira.
16. **Mobile completo**: `Sheet` para o painel, `Accordion` para índice, editor em leitura com toque para editar.

Tudo acima usa apenas componentes shadcn já no `packages/web` (`Tabs`, `Collapsible`, `DropdownMenu`, `Sheet`, `Accordion`, `Badge`, `Card`, `Tooltip`); nada novo de Radix em `apps/`.

---

## 6. Perguntas em aberto para o dono (máx. 3)

1. **O agente da vaga existe?** A spec de workspace diz que o centro de uma vaga “é o seu chat”, e a memória registra a decisão `chat.agent` (um chat de carreira único). A proposta assume uma aba **Agente** fixa na coluna direita, que troca de contexto (vaga ↔ documento). Se não houver agente de vaga no MVP, a coluna direita nas etapas Vaga/Aderência/Candidatura fica com duas abas (Aderência · Candidatura) — ainda estável, só menos “mágica”.
2. **Aderência é uma etapa própria ou parte de Vaga?** A separação deixa o CTA “Responder N perguntas” natural e tira o questionário de cima da descrição; o custo é uma aba a mais. Alternativa: Vaga com a descrição anotada e, abaixo, a aderência com as perguntas (uma aba a menos, página mais longa).
3. **O tracker completo deve viver na vaga (etapa Candidatura) ou só em Acompanhamento?** A proposta coloca o tracker inteiro na etapa Candidatura e um resumo no painel direito; se o dono preferir manter Acompanhamento como o único lugar dos detalhes, a etapa Candidatura vira só status + enviados + linha do tempo, e Fonte/Tipo/Observações ficam na página de Acompanhamento.

---

