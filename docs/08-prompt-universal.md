# 08 — Prompt universal em camadas

Passo 2 do plano da Nave Mãe. **Aprovado e implementado em 2026-07-22** — a medição
antes/depois está no apêndice (§10). Respeita os achados de `auditoria-2026-07.md`
(absorve A4, M2, B5, D10; ver §6).

## 1. Objetivo e princípio único

Hoje cada obra carrega uma **cópia inteira** do prompt padrão (`reposPrompts.adotarPadrao`
copia o conteúdo completo como v1.0 da obra). Melhorias no padrão global não chegam às
obras existentes, e o que é regra universal zh→pt-BR fica misturado com o que é
particularidade da obra.

A arquitetura em camadas separa isso, guiada pelo princípio que governa custo em todos
os provedores:

> **Prompt caching é casamento de prefixo.** Qualquer byte alterado invalida tudo
> depois dele. Conteúdo estável primeiro, conteúdo volátil por último — e o que muda a
> cada chamada nunca entra no bloco de sistema.

Isso já é verdade no pipeline de tradução (auditoria §5 confirma: "o desenho de custo
da tradução está bem feito"). As camadas estendem o mesmo desenho para gestão,
versionamento e para os fluxos que hoje violam a regra (revisão e extração).

## 2. As quatro camadas

| # | Camada | Conteúdo | Onde vive | Quando muda |
|---|--------|----------|-----------|-------------|
| 1 | **Núcleo universal** | Identidade do tradutor, regras zh→pt-BR (Seções 1–5 e 7 do prompt atual), sem nada de obra | tabela `prompt_padrao` (renomeada em conceito para "núcleo"; mesma tabela, versões imutáveis, uma ativa) | Raramente — nova versão global com diff e data |
| 2 | **Delta por obra** | Só o que difere do núcleo: tom, época, vícios de fala, exceções (a atual Seção 6) | tabela `prompts` (por obra, versões imutáveis, uma ativa) — passa a guardar **só o delta**, nunca cópia do núcleo | Quando a obra pede — nova versão por obra |
| 3 | **Contexto dinâmico por bloco** | Glossário **filtrado** (só termos cujo `termo_zh` aparece literalmente no trecho), termos adotados no job, cauda anterior, contexto futuro | Mensagem do **usuário**, montada por chamada | Toda chamada |
| 4 | **Versionamento** | Toda mudança em núcleo ou delta gera versão com diff, data e notas; cada capítulo registra qual par (núcleo, delta) usou | `prompt_padrao` + `prompts` + novo `capitulos.nucleo_id` | A cada nova versão / job |

As instruções operacionais do aplicativo (formato numerado, `termos_novos`, protocolo
de revisão) continuam sendo anexadas pelo servidor em `prompts.ts` — são parte do
prefixo estável, mas variam por tarefa (tradução / revisão / extração / QA),
então ficam **depois** do delta na renderização.

Uma tarefa **não** usa o prompt mãe: a contracapa (título e sinopse), que tem base
própria — ver §11.

## 3. Composição e ordem de renderização

O contrato com os 4 provedores **não muda**: eles continuam recebendo `promptMae`
como string. A composição sobe para o repositório:

```
reposPrompts.composto(db, obraId) →
  { texto: nucleo.conteudo + "\n\n## 6. DIRETRIZES ESPECÍFICAS DA OBRA\n\n" + delta.conteudo,
    nucleo_id, prompt_id }
```

Ordem do bloco de sistema (estável entre blocos de um capítulo, entre capítulos da
obra e — no prefixo do núcleo — entre obras):

```
┌─ SISTEMA ─────────────────────────────────────────────┐
│ 1. Núcleo universal (idêntico para todas as obras)    │  ← breakpoint de cache 1*
│ 2. Delta da obra (Seção 6)                            │
│ 3. Nota "glossário virá na mensagem do usuário"       │
│ 4. Instruções operacionais da tarefa                  │  ← breakpoint de cache 2
└───────────────────────────────────────────────────────┘
┌─ USUÁRIO (volátil, nunca cacheado) ───────────────────┐
│ Glossário filtrado do trecho · termos adotados        │
│ Cauda anterior · frases do bloco · contexto futuro    │
└───────────────────────────────────────────────────────┘
```

\* O breakpoint 1 (fim do núcleo + delta) permite que **revisão, extração e tradução
da mesma obra compartilhem o mesmo prefixo de cache**, já que só a parte 4 difere
entre tarefas. O breakpoint 2 cobre o sistema inteiro (o que já existe hoje).
Anthropic aceita até 4 breakpoints; usamos 2. Atenção ao mínimo cacheável por modelo
(1024–4096 tokens conforme o modelo): o núcleo sozinho (~3–4K tokens estimados) fica
na fronteira — se o prefixo do breakpoint 1 for curto demais ele simplesmente não
cacheia naquele ponto, sem erro, e o breakpoint 2 segue valendo. Nada quebra.

**Regra de ouro da composição:** determinística. Mesma obra + mesmas versões ativas
⇒ mesmos bytes. Nada de datas, contadores ou glossário no sistema.

## 4. Modelo de dados e migração

### Schema (migração 006)

```sql
-- prompts passa a distinguir cópia legada de delta
ALTER TABLE prompts ADD COLUMN tipo TEXT NOT NULL DEFAULT 'completo'
  CHECK (tipo IN ('completo','delta'));
ALTER TABLE prompts ADD COLUMN nucleo_id INTEGER REFERENCES prompt_padrao(id);

-- capítulo registra o núcleo usado no job (prompt_id já existe)
ALTER TABLE capitulos ADD COLUMN nucleo_id INTEGER REFERENCES prompt_padrao(id);
```

- `tipo='completo'` (legado): renderiza como hoje — o conteúdo é o prompt inteiro,
  `nucleo_id` nulo. **Nada do que existe quebra**, inclusive o prompt real de 十日终焉.
- `tipo='delta'`: conteúdo é só a Seção 6; composição usa o **núcleo ativo no momento
  do job** (melhorias do núcleo fluem para todas as obras sem tocar em cada delta), e
  o capítulo grava `nucleo_id` + `prompt_id` para proveniência exata.
- Semente do núcleo: nova versão do `prompt_padrao` (v2.0) = conteúdo atual **menos**
  a Seção 6 placeholder. `adotarPadrao` passa a criar um delta vazio (`tipo='delta'`,
  conteúdo = comentário-modelo da Seção 6) em vez de copiar tudo.

### Conversão da obra real (assistida, não automática)

A obra 十日终焉 tem prompt `completo` que divergiu do genérico (edições fora da
Seção 6). Conversão automática arriscaria perder regra. Fluxo na tela Prompt mãe:

1. Botão "Converter para camadas" na versão ativa `completo`.
2. O app extrai a Seção 6 como rascunho de delta e mostra o **diff do restante contra
   o núcleo ativo** (componente `diffLinhas` já existe).
3. O usuário decide linha a linha: o que é universal vira proposta de nova versão do
   núcleo; o que é da obra vai para o delta.
4. Confirmar cria delta v-seguinte (`tipo='delta'`) e ativa. A versão `completo`
   permanece no histórico, imutável.

## 5. Caching por provedor

O que cada um oferece e o que o desenho exige (verificado na doc da Anthropic; demais
conforme documentação pública dos provedores — conferir na implementação):

| Provedor | Mecanismo | Ação no código |
|----------|-----------|----------------|
| Claude (Anthropic) | Explícito: `cache_control {type: ephemeral}`, TTL 5 min (escrita 1.25×, leitura ~0.1×) | Já usado na tradução; adicionar os 2 breakpoints do §3 e **incluir na extração de termos** (hoje sem cache — M2) |
| Gemini | Caching implícito automático (2.5+), baseado em prefixo | Nenhuma — basta manter a ordem estável do §3 |
| DeepSeek (compat) | Context caching automático em disco, prefixo, sem config | Nenhuma — idem |
| Groq (compat) | Caching automático de prefixo em modelos suportados | Nenhuma — idem |
| OpenRouter (compat) | Repassa o caching do provedor subjacente | Nenhuma — idem |
| Mistral (compat) | Sem prompt caching público | Ganho vem só do prompt menor (glossário filtrado) |

Conclusão: **um único desenho (prefixo estável + volátil no usuário) serve aos seis**;
apenas o Claude precisa de marcação explícita, que já existe no lugar certo para
tradução. Verificação de acerto: `usage.cache_read_input_tokens` nas respostas — hoje
não gravamos `usage` (B8 da auditoria); a medição do §8 cobre este passo pontualmente
e a gravação permanente fica para o Passo 5 (telemetria).

### Modelos por papel: revisão pensa fundo, tradução roda barato

Decisão da 2ª rodada de design (pedido do usuário): tradução e revisão têm perfis de
custo opostos — tradução é **volume** (milhares de frases, blocos em série), revisão é
**pontual e de alto valor** (uma frase por vez, disparada pelo usuário, alimenta o
banco de testes que refina o prompt). Faz sentido cada papel ter seu modelo:

| Papel | Perfil | Modelo |
|-------|--------|--------|
| Tradução | Alto volume, barato, rápido | O padrão atual (capítulo → obra → global) |
| Extração de termos | Alto volume potencial (frase a frase) | O mesmo padrão barato |
| Revisão | Raro, precisa raciocinar | **Config própria: `provedor_revisao` / `modelo_revisao`** — um modelo de raciocínio (thinking) |
| Contracapa (título + sinopse) | **1 chamada por obra**, máxima interpretação | **Config própria: `provedor_detalhes` / `modelo_detalhes`** — o melhor modelo disponível (§11) |
| Sugestão de refinamento do prompt (§7) | Raríssimo, máximo valor | Usa o mesmo par da revisão |

Comportamento: se `provedor_revisao`/`modelo_revisao` estiverem configurados
(Configurações; um override por obra pode vir depois, se fizer falta), a rota de
revisão usa esse par; senão, cai na cadeia atual (capítulo → obra → global) — nada
quebra para quem não configurar. Um pedido explícito de provedor na chamada vence
tudo, e modelo de um provedor nunca é misturado com outro. O app não força economia de pensamento na revisão (o
`pensamentoEconomico` do Gemini só se aplica à tradução, `gemini.ts:177`), então
basta escolher um modelo de raciocínio que ele pensa à vontade.

Dois efeitos colaterais, um bom e um a registrar:

- **Bom:** revisor com modelo diferente do tradutor tem pontos cegos diferentes —
  é o mesmo princípio do QA do Passo 3 (segunda IA que só aponta). Este passo já
  deixa a fundação pronta.
- **A registrar:** cache é por modelo. Com modelos distintos, a revisão não
  compartilha o prefixo núcleo+delta com a tradução (o breakpoint 1 do §3 segue
  valendo entre tarefas que usam o mesmo modelo — tradução↔extração — e entre
  revisões seguidas da mesma obra). Como revisão é baixo volume, o custo disso é
  pequeno perto do ganho de qualidade.

## 6. Achados da auditoria absorvidos (e os que não são deste passo)

**Entram neste passo** — são exatamente a camada 3 aplicada aos fluxos que a violam:

- **A4 / D10 — cache da revisão nunca acerta.** `sistemaRevisao` embute o glossário
  (filtrado por frase!) no sistema → prefixo diferente a cada frase + sobretaxa de
  escrita perdida. Correção: mesma flag `glossarioNoUsuario` da tradução; glossário
  filtrado vai para `usuarioRevisao`; sistema vira núcleo+delta+protocolo, estável.
- **M2 — extração de termos reenvia prompt mãe + glossário INTEIRO por frase, sem
  cache.** Correção: enviar só os termos presentes na frase (a rota já re-filtra o
  resultado no servidor, `frases.ts:232-237`) na mensagem do usuário + `cache_control`
  no sistema do `extrairTermos`.
- **B5 — comparador** usa `filtrarGlossarioRelevante` sem `incluirPrincipais`.
  Correção de uma linha ao passar por esses arquivos.

**Não são deste passo** (ordem do plano da Nave Mãe): C1/C2 (corrida e catch do job)
e M1/A1 → Passo 3 (pipeline); C3 (backup) → Passo 4; B8 (tokens em `uso_ia`) →
Passo 5. Este design não mexe na orquestração do `executarJob` além de trocar a
origem do `promptMae` — de propósito, para não pisar no terreno do Passo 3 com C1/C2
ainda abertos.

## 7. Versionamento

**Manual (já existe, só ganha as camadas):** núcleo e delta mantêm o modelo atual —
versões imutáveis, uma ativa, notas de versão, diff na UI (`diffLinhas`), data em
`criado_em`. A tela Prompt mãe passa a ter dois painéis: "Núcleo universal" (global,
mexer raramente) e "Delta da obra" (frequente). Versões `completo` legadas aparecem
no histórico com selo "formato antigo".

**Semiautomático (retoma o plano #1 pendente):** ao pedir sugestão, o app:

1. Busca `reposTestes.recorrencias(obraId)` — casos do banco de testes agrupados por
   `secao_regra` com COUNT ≥ 2 (lacuna sistemática do prompt).
2. Chama a IA com núcleo + delta atual + casos recorrentes, pedindo **um refinamento
   concreto de delta** (tipicamente linha nova na Seção 6) em formato estruturado:
   `{ secao_regra, regra_proposta, justificativa }[]`.
3. UI mostra como rascunho de nova versão do delta com diff; o usuário edita/aprova/
   rejeita. Aprovar cria a versão pelo fluxo normal.

Inspiração LexiconForge (feedback do leitor vira regra), com a curadoria humana no
meio. É o 4º contrato de saída estruturada — a auditoria (M7) recomenda fonte única
de schemas antes de multiplicar contratos; como este é chamado sob demanda (não no
pipeline), implementamos no padrão atual e M7 fica para o Passo 3, que criará o 5º
contrato (QA).

Referências de mercado no restante do design: Glossarion (rolling history window) ≈
cauda + termos adotados que já temos; darkautism (templates, duas passagens) → duas
passagens é Passo 3; a separação template/delta aparece aqui na camada 2.

## 8. Medição de tokens (antes/depois)

Script `server/scripts/medir-prompt.ts` (roda com `tsx`, sem tocar no app):

1. Escolhe um capítulo real de 十日终焉 e reproduz a montagem de blocos do job
   (mesmo `tamanho_bloco`/`cauda_contexto` das configurações).
2. Para cada bloco, monta sistema+usuário **no formato atual** e **no formato em
   camadas**, e conta tokens via `count_tokens` da Anthropic (medida exata para o
   Claude; para os demais, contagem aproximada serve de proxy relativo).
3. Reporta por bloco: tokens de sistema, de usuário, e a projeção de custo com cache
   (sistema pago 1× + leituras ~0.1×) vs sem.
4. Mesma medição para 10 revisões e 10 extrações simuladas — é onde o ganho real
   está (hoje: sistema recacheado a cada frase na revisão; glossário inteiro por
   frase na extração).

Números esperados: tradução ≈ neutra (já era ótima); revisão e extração com corte
grande de tokens efetivos por chamada. O relatório entra como apêndice deste doc.

## 9. Plano de implementação (após aprovação)

1. Migração 006 + `reposPrompts.composto` + semente do núcleo v2.0 + `adotarPadrao`
   criando delta. Testes de repo.
2. `prompts.ts`: sistema em 2 blocos (núcleo+delta / instruções), flag
   `glossarioNoUsuario` na revisão e extração; `claude.ts`: breakpoints e cache na
   extração; rotas `frases.ts` (glossário no usuário) e `comparador.ts` (B5).
   Testes de prompts e de integração.
3. UI: painéis núcleo/delta, selo legado, fluxo "Converter para camadas" com diff.
4. `capitulos.nucleo_id` gravado no job; exibição na lista de capítulos (proveniência).
5. Modelos por papel: configs `provedor_revisao`/`modelo_revisao` + seção em
   Configurações + rota de revisão usando o par quando definido.
6. Sugestão semiautomática de refinamento (endpoint + método nos 4 provedores + UI),
   usando o modelo da revisão.
7. Script de medição + apêndice com números; `npm test` + `typecheck` verdes.

Todos os itens foram implementados (2026-07-22): 62 testes automatizados verdes,
typecheck limpo nos dois workspaces e 30 verificações de ponta a ponta num servidor
real com o export da obra 十日终焉 — incluindo a conversão assistida do prompt
completo real dela para camadas, a proveniência gravada no capítulo, o modelo por
papel na revisão e o refinamento semiautomático.

## 10. Apêndice — medição de tokens antes/depois (obra real)

> ⚠️ **Estes números são ESTIMATIVA.** Desde o Passo 5 (doc 11) o consumo real de cada
> chamada é gravado, e a redução passou a ser **conferível**: rode
> `npx tsx scripts/medir-prompt.ts <export.json> [capítulo] --real` para ver, ao lado da
> estimativa, o acerto de cache medido em `revisao` e `extracao` — que é o mecanismo do
> qual estas reduções dependem. Cache medido perto de 0% nesses papéis significa que a
> economia abaixo **não está se realizando**.

Script: `server/scripts/medir-prompt.ts` (roda com
`npx tsx scripts/medir-prompt.ts <export.json> [capítulo]`). Fonte: export real de
十日终焉 (capítulos 118 e 119; glossário com 125 termos). Contagem por estimativa
local (≈1 token/caractere CJK + 1/3,8 nos demais) — proxy relativo; com chave da
Anthropic no cofre, o script usa `count_tokens` (exato) automaticamente. "Custo
efetivo" pondera o cache da Anthropic: escrita 1,25×, leitura 0,1×, usuário sempre 1×.

| Fluxo (sequência típica) | Antes | Depois | Redução |
|---|---:|---:|---:|
| Tradução cap. 118 (1 bloco) | 5 441 | 5 446 | ~0% (já era ótima) |
| Tradução cap. 119 (2 blocos) | 6 693 | 6 699 | ~0% (já era ótima) |
| Revisão — 10 frases seguidas (cap. 118) | 40 462 | 13 063 | **−67,7%** |
| Revisão — 10 frases seguidas (cap. 119) | 38 755 | 11 386 | **−70,6%** |
| Extração de termos — 10 frases (cap. 118) | 39 174 | 7 193 | **−81,6%** |
| Extração de termos — 10 frases (cap. 119) | 38 915 | 6 800 | **−82,5%** |

Leitura dos números, na direção prevista pelo §8:

- **Tradução ficou neutra por desenho** — o sistema já era estável e cacheável; a
  composição núcleo+delta tem o mesmo tamanho do prompt completo (+4 tokens do
  cabeçalho da Seção 6). O ganho da tradução veio antes (glossário filtrado) e
  continua valendo.
- **Revisão**: o custo antigo era o A4 em ação — cada frase reescrevia um cache que
  nunca era lido (sistema de ~2,7K tokens × 1,25 por chamada). Com o sistema
  estável, 10 revisões pagam 1 escrita + 9 leituras.
- **Extração**: somava os dois desperdícios (glossário inteiro de 125 termos no
  sistema + zero cache). Só termos presentes na frase + sistema cacheado derrubam
  >80% — e a curadoria é o fluxo com mais chamadas por minuto do app (M2).

Nos provedores sem cache explícito o prefixo estável aproveita o cache implícito
(Gemini/DeepSeek/Groq/OpenRouter) com fatores próprios; na Mistral vale só a
redução bruta do prompt (extração: sistema médio caiu de ~3,8K para ~2,7K tokens).

## 11. Contracapa: instrumento próprio (2026-08-02)

O título e a sinopse da ficha da obra saíam literais e calcados — pior que um chat
cru: `无道` virava "sem caminho" (é "Profano"/"iníquo"), `仙草级` virava "de primeira
linha" (é um **grau** numa escala de qualidade), e um `丝丝入扣` chegava achatado.

**A causa não era o modelo, era o instrumento.** A rota `POST /ia/traduzir-detalhes`
montava o **núcleo de capítulo inteiro** como `promptMae`. O núcleo é literalidade
controlada de propósito — proíbe invenção, embelezamento e nota do tradutor, porque
o texto do capítulo é ficção corrida que o revisor confere frase a frase. A
contracapa é o oposto: paratexto, aparece uma vez, precisa funcionar sozinha em
português e vive exatamente de chengyu, termo de gênero e clichê de resenha — tudo
o que o núcleo manda decalcar. Somavam-se dois agravantes: a sinopse era **picotada
em parágrafos numerados** (`dividirParagrafos`), então os versos paralelos da
abertura eram traduzidos isolados e viravam prosa; e a chamada usava o **modelo
barato** da obra, escolhido para volume.

**O conserto, em três peças:**

1. **Prompt próprio** (`server/src/ia/promptContracapa.ts`, fixo no código): registro
   de contracapa, padrão declarado como **fiel-mas-natural** (nem decalque, nem
   adaptação livre) e autorização explícita para localizar chengyu, termo cultural,
   escala/grau e clichê de resenha. Mantém o que importa: glossário é lei para nomes
   e termos, quebras de linha e de parágrafo preservadas, nada acrescentado nem
   omitido, saída limpa (sem nota, colchete, pinyin entre parênteses ou alternativa
   "X ou Y"). Os exemplos do prompt são deliberadamente diferentes dos casos usados
   para verificar a qualidade — ensinar a classe sem entregar a resposta.
   Da obra entra **só o glossário**; o delta (house-style de capítulo) fica fora.
2. **Contrato próprio** (`CONTRATO_CONTRACAPA`, método `traduzirContracapa` nos 4
   provedores): dois campos anuláveis, `titulo_pt` e `sinopse_pt`. Sem itens
   numerados e sem `termos_novos` — a sinopse é **um campo**, lida e traduzida
   inteira, que é o que devolve intenção aos versos. A saída segue estruturada (o
   valor é entregar campo pronto para a ficha), só deixou de ser uma lista numerada.
   No Gemini, esta tarefa **não** desliga o *thinking*: aqui o raciocínio é o produto.
3. **Modelo por papel** (`provedor_detalhes` / `modelo_detalhes`, em Configurações):
   vazio = comportamento de hoje. É a aplicação mais barata do §5 — 1 chamada por
   obra, então o melhor modelo disponível custa frações de centavo e a premissa
   financeira do lote (doc 09) não é arranhada.
