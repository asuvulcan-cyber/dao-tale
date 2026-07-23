# 09 — Pipeline de tradução em fases com QA por segunda IA

Passo 3 do plano da Nave Mãe. **Proposta em aprovação** (2026-07-22). Pressupõe o
Passo 2 implementado (`docs/08-prompt-universal.md`) e absorve os achados da
auditoria listados no §8 — em especial C1/C2, que a auditoria classifica como
"bombas com lote".

## 1. Objetivo e princípios

Hoje a tradução é um job por capítulo, disparado à mão, sempre com o mesmo
provedor, sem verificação posterior. Este passo transforma isso num pipeline por
obra com fases explícitas — calibração → checkpoint → cruzeiro → QA — regido por
cinco princípios:

1. **Estado durável no banco.** O que já vale para frases (`status_traducao`
   sobrevive a queda do processo) passa a valer para o lote e para o QA: nenhuma
   fila ou apontamento vive só em memória. Reiniciar o servidor nunca perde
   progresso, só interrompe execução.
2. **Humano no comando.** O checkpoint informa com números; quem muda de fase é
   o usuário. O QA aponta; quem aceita ou descarta é o usuário. Nenhuma escrita
   de tradução acontece sem decisão humana fora do fluxo normal de tradução.
   **A revisão humana integral continua em todas as fases** — o lote não existe
   para reduzi-la, e sim para dar vazão; ele só é útil se **compensar
   financeiramente** (premissa do usuário, 2ª rodada de design). O QA é apoio
   opcional à revisão, com custo próprio e opt-in — nunca parte do preço do lote.
3. **Critérios objetivos, não arbitrários.** A liberação do lote é guiada por
   taxas medidas sobre os dados reais (termos novos, edição humana), com
   limiares configuráveis — nunca "depois de N capítulos".
4. **Segunda IA com pontos cegos diferentes.** O QA usa par provedor/modelo
   **diferente** do que traduziu o capítulo (princípio já plantado no doc 08 §5,
   modelos por papel).
5. **Um único desenho de custo.** As camadas do doc 08 valem para o QA e para a
   análise prévia: sistema estável e cacheável, conteúdo volátil na mensagem do
   usuário, glossário filtrado por trecho.

## 2. Visão geral

```
 FASE DE CALIBRAÇÃO (capítulos iniciais)
 ┌──────────────────────────────────────────────────────────┐
 │ traduzir capítulo (sequencial, fluxo atual)              │
 │   → varredura local de consistência (grátis, automática) │
 │   → revisão humana intensa → glossário/termos/testes     │
 └──────────────┬───────────────────────────────────────────┘
                ▼
 CHECKPOINT DE ESTABILIDADE (painel na obra, sempre visível)
   termos novos /100 frases ≤ X   ·   edição humana ≤ Y%
   (janela móvel dos últimos K capítulos; sem nº fixo)
                │  usuário clica "Liberar cruzeiro"
                ▼
 FASE DE CRUZEIRO (lote)
 ┌──────────────────────────────────────────────────────────┐
 │ fila durável de capítulos → N jobs em paralelo           │
 │ failover entre pares (provedor, modelo) por capítulo     │
 │ retomada do ponto exato após qualquer falha              │
 │   → QA por segunda IA ao concluir cada capítulo          │
 │   → apontamentos por frase → triagem humana              │
 └──────────────────────────────────────────────────────────┘

 (futuro, já desenhado: análise prévia de referentes/gênero
  antes da tradução — §7, flag `duas_passagens`)
```

A fase é **por obra** (`obras.fase_traducao`: `calibracao` | `cruzeiro`),
mudada explicitamente pelo usuário e reversível a qualquer momento. Obra nova
nasce em calibração. Em calibração, o botão de lote fica desabilitado (a API
responde 409); capítulo avulso continua funcionando igual em qualquer fase.

## 3. Fase de calibração

Mecanicamente é o fluxo atual — tradução sequencial por capítulo, um de cada
vez — com duas adições:

- **Varredura local de consistência automática** ao fim de cada job (resolve
  D5): o endpoint `GET /capitulos/:id/consistencia` já existe e é local e
  gratuito; passa a rodar ao concluir o capítulo e o resultado aparece como
  badge na lista ("3 violações de glossário"). Nada de IA aqui.
- **Painel do checkpoint** sempre visível na tela da obra (§4), para o usuário
  acompanhar a maturação do glossário desde o primeiro capítulo.

O objetivo da fase é alimentar glossário, termos sugeridos e banco de testes até
as taxas estabilizarem. O QA sob demanda (§6) também está disponível aqui — útil
para ensinar o glossário mais rápido.

## 4. Checkpoint de estabilidade

### Métricas (objetivas, calculadas dos dados existentes)

Janela móvel: os últimos `checkpoint_janela` capítulos (padrão **3**), ordenados
por `numero` decrescente. Não é "número fixo de capítulos para calibrar" — é o
tamanho da amostra sobre a qual as taxas são medidas; a liberação acontece
quando as **taxas** convergem, seja no capítulo 4 ou no 40.

| # | Métrica | Fórmula | Janela sobre | Limiar padrão | Bloqueia? |
|---|---------|---------|--------------|---------------|-----------|
| 1 | **Termos novos /100 frases** | Σ `termos_sugeridos` do capítulo ÷ Σ frases × 100 | capítulos com status ≥ `traduzido` | ≤ `checkpoint_termos_max` (2,0) | sim |
| 2 | **Edição humana %** | Σ frases `editado_manualmente` ÷ Σ frases traduzidas × 100 | capítulos `revisado`/`finalizado` | ≤ `checkpoint_edicao_max` (10) | sim |
| 3 | **Violações de consistência /100 frases** | resultado da varredura local (§3) | mesma janela da 1 | `checkpoint_violacoes_max` (0 = só informativa) | não (padrão) |

Notas de desenho:

- O pedido original falava em "taxa de edição por bloco"; blocos não são
  entidades duráveis (são fatias recomputadas a cada job), então a granularidade
  é **por frase** — mais fina e já registrada (`frases.editado_manualmente`).
- A métrica 2 só é honesta em capítulos que o humano de fato revisou — por isso
  a janela dela é `revisado`/`finalizado`. Efeito colateral desejável: marcar
  capítulo como "revisado" (hábito que o fluxo já tem) vira o gatilho da métrica.
- A métrica 1 conta termos **registrados** (pendentes + aceitos + rejeitados):
  mede a taxa de descoberta de nomes novos, não a qualidade da triagem.
- Janela incompleta (menos capítulos que `checkpoint_janela` no status exigido)
  ⇒ métrica em estado "amostra insuficiente", mostrando o que falta ("revise
  mais 1 capítulo"). Checkpoint não aprova com amostra insuficiente.
- O checkpoint é, no fundo, uma **trava financeira**: liberar o lote com
  glossário imaturo significa pagar por 20 capítulos que sairão com nomes
  inconsistentes — e pagar de novo pela retradução (ou pagar em horas de
  correção manual). As taxas medem exatamente o risco de retrabalho pago.
- A correção M3 da auditoria entra aqui como pré-requisito de honestidade:
  `aplicarCorrecao` passa a marcar `editado_manualmente = 1` (é uma decisão
  humana) — senão a métrica 2 subestima a edição via Protocolo de Revisão.

### Comportamento

- `GET /obras/:id/checkpoint` devolve fase, janela usada (ids dos capítulos),
  cada métrica com valor/limiar/estado (`ok` | `acima` | `amostra-insuficiente`)
  e o veredito agregado `aprovado: boolean`.
- UI: painel-semáforo na tela de capítulos. Com tudo verde, o botão **"Liberar
  cruzeiro"** ativa (`PUT /obras/:id/fase`). Vermelho, o botão vira "Liberar
  mesmo assim" com confirmação explícita — o humano manda, mas consciente.
- Voltar para calibração é um clique, sem confirmação. O sistema nunca muda de
  fase sozinho: se as taxas piorarem durante o cruzeiro (arco novo da história
  despeja nomes novos), o painel alerta e sugere voltar, mas não trava lote em
  andamento — no máximo pede confirmação para **iniciar** lote novo com
  checkpoint vermelho.

## 5. Fase de cruzeiro — lote com failover

### Modelo de execução

- **Fila durável por obra**: um lote é um conjunto ordenado de capítulos
  selecionados (padrão: todos com frases pendentes, em ordem de `numero`).
  Um lote ativo por obra (índice parcial único).
- **`lote_paralelo` capítulos simultâneos** (padrão **2**). Dentro de cada
  capítulo os blocos continuam **sequenciais** — a cauda de contexto e os
  termos adotados dependem disso. Isso decide D3 da auditoria: paralelismo
  existe, mas é controlado e explícito; capítulo avulso fora de lote segue
  permitido (o Map de jobs por capítulo já isola).
- Capítulos paralelos **não compartilham** `termosAdotados` entre si (cada job
  tem o seu; a consistência entre capítulos vem do glossário curado). É por
  isso que o cruzeiro só faz sentido depois do checkpoint: taxa de termos
  novos baixa = quase tudo que importa já está no glossário. O design e a
  trava de fase se reforçam mutuamente.
- O orquestrador do lote usa o job atual por baixo: `iniciarTraducao` ganha um
  callback interno `aoTerminar(resultado)` com o desfecho classificado
  (`concluido` | `parcial` | `cancelado` | `fatal` | `limite`), em vez de o
  orquestrador raspar eventos SSE. O evento `job_erro` ganha o campo `tipo`
  para a UI distinguir pausa de cota de erro real.

### Failover entre provedores

Cadeia configurável de **pares** `{ provedor, modelo }` (config `failover`,
lista ordenada — modelo nunca é misturado entre provedores). O primeiro par de
cada capítulo é o da cadeia normal (pedido → capítulo → obra → global); a
cadeia entra quando ele falha.

| Desfecho do job do capítulo | Sem failover (hoje/avulso) | No lote com cadeia |
|---|---|---|
| `fatal` (401/400) | job para | próximo par assume o capítulo |
| `limite` com `parar_no_limite` | pausa e espera o usuário | próximo par assume |
| `limite` sem `parar_no_limite` | backoff longo (M1); esgotado → blocos em erro | idem; ao fim, próximo par retenta os erros |
| `parcial` (blocos em erro após retries) | frases ficam em `erro` | próximo par retenta só os erros |

- **Retomada é de graça por desenho**: `reabrirParaTraducao` já devolve frases
  `erro` para a fila, e o job só processa pendentes — o par seguinte continua
  do ponto exato, sem retraduzir o que deu certo.
- Cada par é tentado **no máximo uma vez por capítulo**
  (`lote_capitulos.provedores_tentados`). Cadeia esgotada ⇒ item do lote em
  `erro` com a mensagem acumulada; o lote **continua** nos demais capítulos e
  o relatório final lista o que sobrou.
- A cadeia é também o instrumento **financeiro** do lote (modelo Glossarion:
  vazão barata): ordenada por custo real — faixas gratuitas primeiro (Gemini,
  Groq, OpenRouter `:free`), pagos por último — ela "surfa" as cotas grátis do
  dia antes de gastar um centavo. Com `parar_no_limite` ligado, esgotar o
  último par gratuito **pausa** o item em vez de cair num pago sem querer.
  (Rotação de múltiplas chaves por provedor, item 5 do backlog Glossarion,
  fica fora deste passo — a cadeia entre provedores já cobre o caso comum.)
- Truncamento (A1) **não** aciona failover: o job divide o bloco ao meio e
  tenta de novo no mesmo par — trocar de modelo por bloco grande demais seria
  esconder a causa.

### Durabilidade e retomada do lote

- Tabelas `lotes` + `lote_capitulos` (§9). Todo avanço de estado é gravado.
- No boot, lotes `executando` viram `interrompido` (nenhum job sobrevive ao
  processo). A UI oferece "Retomar lote": re-enfileira os itens não concluídos
  do mesmo lote. Frases já traduzidas nunca se perdem.
- Cancelar lote cancela os jobs em voo (mecanismo atual de `cancelarJob`) e
  marca os itens na fila como `cancelado`.

### Progresso na interface

`GET /obras/:id/lote/eventos` (SSE agregado): estado da fila + progresso dos
capítulos em voo (reaproveita os emissores por capítulo, com um emissor por
obra por cima). A tela de capítulos ganha a visão de fila: posição, status por
item, par em uso, tentativas, erros.

### Status `parcial` de capítulo

Resolve M6: job que termina com frases em erro (ou cancelado no meio) deixa o
capítulo em `parcial` — hoje ele fica preso em `traduzindo` sem job nenhum.
`parcial` entra no enum de `StatusCapitulo` (rebuild da tabela, como na
migração 002) e aparece na UI com a contagem de frases em erro.

## 6. Passada de QA por segunda IA

### Regras de ouro

1. **O QA nunca reescreve.** Ele produz apontamentos; a única escrita em frase
   acontece quando o humano clica "Aplicar sugestão" — que marca
   `editado_manualmente = 1`, coerente com M3.
2. **Par diferente do tradutor.** O par de QA (`provedor_qa`/`modelo_qa`;
   vazio → cai no par da revisão do doc 08 §5) é comparado com o
   `provedor`/`modelo` gravados no capítulo. Igual ⇒ 409 com mensagem clara,
   superável com `?forcar=1` (consciente, para quem só tem uma chave).

### Contrato (5º contrato estruturado — depois de M7)

A auditoria condiciona o 5º contrato à fonte única de schemas (M7): o Zod passa
a gerar o JSON Schema (tool use do Claude), o formato `Type.*` do Gemini e a
instrução textual do compat. Os 4 contratos existentes migram primeiro, sem
mudança de comportamento; o QA nasce no formato novo.

```ts
// respostas.ts (fonte única)
respostaQaSchema = z.object({
  apontamentos: z.array(z.object({
    ordem: z.coerce.number().int(),          // frase apontada
    tipo: z.enum(['glossario', 'pronome-genero', 'repeticao', 'omissao', 'outro']),
    severidade: z.enum(['alta', 'media', 'baixa']).default('media'),
    trecho_zh: z.string().default(''),       // evidência no original
    observacao: z.string(),                  // o problema, em uma frase
    sugestao: z.string().nullable().default(null), // correção completa opcional
  })).default([]),
});
```

Novo método `analisarQa(chave, req)` na interface `ProvedorIA` (4 provedores +
mock; o mock devolve apontamentos determinísticos para os testes de
integração). Requisição: `{ modelo, promptMae, glossario, glossarioNoUsuario,
caudaAnterior, pares: { ordem, texto_zh, texto_pt }[] }`.

### Os quatro eixos da instrução

O sistema (núcleo + delta + instruções de QA — mesmo desenho de camadas do doc
08, cacheável entre blocos do mesmo capítulo e capítulos da mesma obra) instrui
o modelo a comparar cada par zh↔pt e apontar **apenas onde houver problema**:

1. **Aderência ao glossário** — termo do glossário presente no zh cuja tradução
   fugiu do cânone (inclusive flexões que a varredura local não pega).
2. **Pronomes e gênero** — 他/她/它 e referentes traduzidos com gênero errado ou
   trocado no meio do trecho; concordância de adjetivos (crítico em zh→pt).
3. **Repetição anômala** — eco de tradução (mesma frase PT para zh diferentes),
   tique de modelo ("então", "naquele momento" em série).
4. **Omissão** — parte da frase zh sem correspondência no pt (o alinhamento por
   frase torna isso verificável par a par).

### Execução e persistência

- **Granularidade: blocos de pares** (mesmo `tamanho_bloco`; entrada dobra por
  levar zh+pt, mas a saída é pequena — apontamentos —, e a checagem de
  truncamento A1 protege). Cauda de `cauda_contexto` pares anteriores para
  repetição/omissão de fronteira.
- **Quando roda:** sob demanda por `POST /capitulos/:id/qa` em qualquer fase
  (exige que exista frase traduzida; audita só as traduzidas). No lote, só se
  o usuário ligar `qa_automatica` (padrão **desligado**): como a revisão humana
  integral permanece, o QA é uma compra separada — apoio à revisão nos eixos
  que a leitura fluente não pega (omissão, gênero) — e não pode inflar o custo
  do lote por padrão.
- **Persistência:** tabela `qa_apontamentos` (§9), `ordem` resolvida para
  `frase_id` na gravação. `capitulos.qa_em` marca a última execução (distingue
  "QA limpo" de "QA nunca rodou"). Rodar de novo apaga os `pendente` do
  capítulo e regrava; `aceito`/`descartado` (já triados) ficam como histórico.
- **Triagem na UI:** gaveta "QA" no EditorCapitulo — lista por severidade,
  clique navega até a frase, ações por item: **Aplicar sugestão** (grava
  `texto_pt`, marca `editado_manualmente`, item → `aceito`), **Aceitar sem
  aplicar** (item → `aceito`; o usuário edita à mão) e **Descartar**. Badge de
  pendências na lista de capítulos ("QA: 12 · 3 altas").
- Um apontamento `glossario` aceito é sinal de regra faltando — a gaveta
  oferece atalho para criar caso de teste/termo, alimentando o refinamento
  semiautomático do doc 08 §7.

## 7. Duas passagens — análise prévia de referentes (design; implementação adiada)

A passada barata antes da tradução (pesquisa de mercado, ideia #2) resolve o
problema estrutural de zh→pt: chinês não flexiona gênero; português flexiona
até adjetivo. Hoje o modelo decide gênero bloco a bloco e pode trocar no meio.

- **Contrato (6º, já no formato M7):** `analisarReferentes` — entrada: texto zh
  do capítulo em blocos + nomes canônicos do glossário; saída:
  `{ referentes: [{ termo_zh, tipo: 'personagem'|'criatura'|'outro', genero:
  'masculino'|'feminino'|'neutro'|'indefinido', evidencia }] }`.
- **Modelo barato** (o par da tradução serve; uma chamada por capítulo, saída
  minúscula).
- **Armazenamento:** tabela `analises_referentes` por capítulo (JSON + par +
  data).
- **Injeção:** camada 3 do doc 08 — seção "REFERENTES" na mensagem do usuário
  da tradução, **filtrada pelos termos presentes no bloco** (mesmo mecanismo do
  glossário relevante). O sistema não muda ⇒ cache preservado.
- **Config:** `duas_passagens` (padrão desligado). Implementação fica para a
  Etapa 5 (§13) — o design entra agora para que M7 já reserve o contrato e a
  medição (§12) já projete o custo.

Gênero estável de personagem recorrente tende a migrar para o glossário/delta
com o tempo; a análise prévia cobre personagens novos e figurantes — por isso
ela complementa (e não substitui) o glossário.

## 8. Achados da auditoria absorvidos

**Etapa 0 — obrigatórios antes do lote** (as "bombas" do §8 da auditoria):

- **C1** — corrida na largada: registrar o job no Map **antes** do primeiro
  `await` (liberando nos caminhos de erro). Com orquestrador disparando jobs
  próximos, a corrida deixaria de ser rara.
- **C2** — `catch` no `executarJob` (+ `process.on('unhandledRejection')` como
  cinto em `index.ts`). Sem isso, um erro imprevisto num lote de madrugada
  derruba o servidor inteiro.
- **A1** — checar truncamento nos 3 caminhos (`stop_reason`, `finishReason`,
  `finish_reason`); resposta truncada divide o bloco ao meio em vez de repetir
  a chamada fadada; teto de `tamanho_bloco` alinhado à capacidade real.
- **M1** — backoff próprio para 429 (30/60/120 s; `Retry-After` quando vier).
  Com N capítulos paralelos no mesmo provedor, 429 vira rotina.
- **M4** — `DELETE /obras/:id` bloqueia com job/lote ativo (mesma checagem do
  delete de capítulo).
- **M5** — `inicio >= 0` no saneador do compat (uma linha; failover usa muito
  os provedores compat).
- **M6** — status `parcial` (§5).
- **M7** — fonte única de schemas a partir do Zod (§6).
- **M8** — bateria dedicada do job com provedor-espião programável; extração da
  montagem de contexto de bloco de `executarJob` para função pura (recomendação
  do §8 da auditoria — é ela que o QA e as duas passagens reutilizam).
- **B1** — limpar `emissores` ao fim do job (com lote, o vazamento cresce).

**Na etapa do checkpoint:** **M3** (`aplicarCorrecao` marca
`editado_manualmente`) — pré-requisito da métrica de edição (§4).

**Decididos por este design:** **D3** (paralelismo controlado por
`lote_paralelo`; doc 02 será atualizado), **D5** (varredura local automática ao
concluir capítulo, §3).

**Fora deste passo** (ordem da Nave Mãe): C3/backup → Passo 4; B8/telemetria
permanente de tokens → Passo 5 (a medição do §12 é pontual, via script, como no
Passo 2); A2/CSRF → junto do Passo 4 (operação).

## 9. Modelo de dados

Três migrações, alinhadas às etapas do §13 (nada de migração monolítica):

```sql
-- 007 (Etapa 0/1): fase + status parcial
ALTER TABLE obras ADD COLUMN fase_traducao TEXT NOT NULL DEFAULT 'calibracao'
  CHECK (fase_traducao IN ('calibracao', 'cruzeiro'));
-- capitulos.status ganha 'parcial' (rebuild da tabela, padrão da migração 002)

-- 008 (Etapa 2): lote durável
CREATE TABLE lotes (
  id           INTEGER PRIMARY KEY,
  obra_id      INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'executando'
               CHECK (status IN ('executando','concluido','cancelado','interrompido')),
  qa_automatica INTEGER NOT NULL DEFAULT 0,
  criado_em    TEXT NOT NULL DEFAULT (datetime('now')),
  encerrado_em TEXT
);
CREATE UNIQUE INDEX idx_lote_ativo ON lotes(obra_id) WHERE status = 'executando';
CREATE TABLE lote_capitulos (
  lote_id      INTEGER NOT NULL REFERENCES lotes(id) ON DELETE CASCADE,
  capitulo_id  INTEGER NOT NULL REFERENCES capitulos(id) ON DELETE CASCADE,
  posicao      INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'na_fila'
               CHECK (status IN ('na_fila','traduzindo','qa','concluido','erro','cancelado')),
  provedores_tentados TEXT NOT NULL DEFAULT '[]',   -- JSON: pares já usados
  erro         TEXT,
  PRIMARY KEY (lote_id, capitulo_id)
);

-- 009 (Etapa 3): QA
ALTER TABLE capitulos ADD COLUMN qa_em TEXT;
CREATE TABLE qa_apontamentos (
  id          INTEGER PRIMARY KEY,
  capitulo_id INTEGER NOT NULL REFERENCES capitulos(id) ON DELETE CASCADE,
  frase_id    INTEGER REFERENCES frases(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('glossario','pronome-genero','repeticao','omissao','outro')),
  severidade  TEXT NOT NULL DEFAULT 'media' CHECK (severidade IN ('alta','media','baixa')),
  trecho_zh   TEXT,
  observacao  TEXT NOT NULL,
  sugestao    TEXT,
  status      TEXT NOT NULL DEFAULT 'pendente'
              CHECK (status IN ('pendente','aceito','descartado')),
  provedor    TEXT NOT NULL,
  modelo      TEXT NOT NULL,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_qa_capitulo_status ON qa_apontamentos(capitulo_id, status);
```

(`analises_referentes` fica especificada mas só entra com a Etapa 5.)

## 10. Rotas novas

| Rota | Papel |
|------|-------|
| `GET /obras/:id/checkpoint` | métricas + limiares + veredito (§4) |
| `PUT /obras/:id/fase` | muda `calibracao` ⇄ `cruzeiro` |
| `POST /obras/:id/lote` | cria e inicia lote (409 em calibração ou com lote ativo) |
| `GET /obras/:id/lote` | lote ativo/último + itens |
| `POST /obras/:id/lote/cancelar` · `/retomar` | controle do lote |
| `GET /obras/:id/lote/eventos` | SSE agregado da fila |
| `POST /capitulos/:id/qa` | roda QA (202; `?forcar=1` ignora a regra do par igual) |
| `GET /capitulos/:id/qa` | apontamentos + `qa_em` |
| `PUT /qa/:id` | triagem (`aceito`/`descartado`) |
| `POST /qa/:id/aplicar` | aplica `sugestao` na frase (marca `editado_manualmente`) |

## 11. Configurações novas (`Configuracoes` / tela Configurações)

| Config | Padrão | Uso |
|--------|--------|-----|
| `lote_paralelo` | 2 | capítulos simultâneos no cruzeiro |
| `failover` | `[]` | cadeia ordenada de pares `{provedor, modelo}` |
| `provedor_qa` / `modelo_qa` | `''` | par do QA; vazio → cai no par da revisão |
| `qa_automatica` | `false` | QA ao fim de cada capítulo do lote (opt-in; custo separado) |
| `checkpoint_janela` | 3 | tamanho da janela móvel |
| `checkpoint_termos_max` | 2.0 | termos novos /100 frases |
| `checkpoint_edicao_max` | 10 | % de frases editadas |
| `checkpoint_violacoes_max` | 0 | 0 = métrica só informativa |
| `duas_passagens` | `false` | reservada (§7, Etapa 5) |

Limiares são globais com ajuste fino pela obra real; override por obra só se a
prática pedir (mesmo critério do doc 08 §5 para o par de revisão).

## 12. Medição de custo por capítulo (antes/depois)

Mesmo método do Passo 2 (offline, sem tocar no app): script
`server/scripts/medir-pipeline.ts` sobre o export real de 十日终焉:

A pergunta que o relatório responde é a da premissa do §1: **o lote compensa
financeiramente?** (a revisão humana integral permanece nos dois cenários, então
tempo humano não entra na conta — só dinheiro e cota).

1. **Antes** = pipeline atual: tokens de tradução por capítulo (sistema/usuário,
   ponderação de cache como no doc 08 §10), no padrão de uso manual — pausas
   entre capítulos que estouram o TTL de cache (5 min na Anthropic).
2. **Depois** = mesmo capítulo no lote: capítulos emendados (cache quente
   entre capítulos e blocos) + projeção em **dinheiro real** com a cadeia de
   failover ordenada por custo — quantos capítulos/dia saem dentro das faixas
   gratuitas (Gemini 250 req/dia, Groq 1000, OpenRouter 50) antes do primeiro
   centavo pago.
3. **QA como linha separada** (opt-in): ~1 chamada por bloco com entrada
   dobrada (pares zh+pt) e saída pequena — overhead real em % por capítulo,
   para o usuário decidir se e quando liga.
4. **Projeção duas passagens**: +1 chamada barata por capítulo (§7), medida
   como projeção para decidir a Etapa 5 com número, não com fé.
5. **Desperdício evitado** (não entra no "custo por capítulo", entra no
   relatório): A1 elimina até 5 chamadas pagas por bloco truncado; M1 elimina
   retries de 429 que contavam cota — quantificados por simulação dos cenários
   da auditoria.

O relatório entra como apêndice deste doc, como no doc 08. A gravação
**permanente** de tokens (B8) continua sendo Passo 5 — aqui só a medição.

## 13. Plano de implementação incremental (após aprovação)

Cada etapa fecha com `npm test` + `typecheck` verdes e é utilizável sozinha:

1. **Etapa 0 — alicerces**: C1, C2, M1, A1, M4, M5, M6 (`parcial`), B1;
   extração da montagem de bloco para função pura; bateria M8 com
   provedor-espião; M7 (fonte única Zod dos 4 contratos existentes, sem
   mudança de comportamento). *Valor imediato: servidor à prova de queda e de
   dinheiro queimado, mesmo sem lote.*
2. **Etapa 1 — checkpoint**: M3; migração 007; métricas + `GET /checkpoint` +
   `PUT /fase`; configs; painel-semáforo na UI; varredura local automática (D5).
3. **Etapa 2 — cruzeiro**: migração 008; orquestrador de lote (paralelismo,
   failover, retomada, callback `aoTerminar`); rotas + SSE agregado; UI da
   fila.
4. **Etapa 3 — QA**: migração 009; `analisarQa` nos 4 provedores + mock;
   persistência e triagem (gaveta na UI, badge); integração no lote +
   sob demanda.
5. **Etapa 4 — medição e fechamento**: `medir-pipeline.ts`, apêndice com
   números, atualização dos docs 02/05 (D3/D5) e da memória do projeto.
6. **Etapa 5 — duas passagens** (adiada; só com o número do §12 justificando):
   `analisarReferentes`, tabela, injeção na camada 3, flag `duas_passagens`.

## 14. Estado da implementação (2026-07-22)

Etapas 0–4 implementadas e verificadas; Etapa 5 (duas passagens) permanece
adiada, com o custo já projetado (§15). Ao todo **109 testes automatizados
verdes** (eram 62 antes do Passo 3), typecheck limpo nos dois workspaces, build
de produção do front OK, e
verificações de ponta a ponta num servidor real (checkpoint aprovando/reprovando
por métrica, transição de fase, lote com guarda de calibração e conclusão, QA
recusando par igual/sem-par e rodando sob `?forcar=1`).

- **Etapa 0:** C1, C2 (+`unhandledRejection`), A1 (erro `truncado` nos 3
  caminhos → o job divide o bloco; teto de `tamanho_bloco` 400→120), M1
  (backoff 30/60/120 s + `Retry-After`), M4, M5, M6 (status `parcial`), B1;
  montagem de bloco pura (`traducao/bloco.ts`); M7 (fonte única de contratos em
  `ia/contratos.ts` — o Zod gera JSON Schema, formato Gemini e instrução do
  compat); M8 (bateria `job.test.ts`). `ResultadoJob` + callback `aoTerminar`.
- **Etapa 1:** M3; migração 007 (`fase_traducao`, `consistencia_violacoes`,
  rebuild p/ `parcial`); `traducao/checkpoint.ts` puro + `consistencia.ts`;
  rotas `/checkpoint` e `/fase`; configs `checkpoint_*`; painel-semáforo e badge
  na UI; varredura D5 automática ao fim do job.
- **Etapa 2:** migração 008 (`lotes`/`lote_capitulos`); orquestrador
  `traducao/lote.ts` (paralelismo `lote_paralelo`, failover por cadeia de pares
  tentados 1×/capítulo, retomada, boot marca interrompidos); rotas + SSE
  agregado; configs `lote_paralelo`/`failover`; fila na UI com SSE ao vivo.
- **Etapa 3:** migração 009 (`qa_apontamentos`, `capitulos.qa_em`); contrato de
  QA (5º, na fonte única) + `analisarQa` nos 4 provedores e no mock;
  `traducao/qa.ts` (par ≠ tradutor, `?forcar=1`); rotas de QA e triagem;
  gaveta de QA no editor + badge; integração opt-in no lote (`qa_automatica`).
- **Etapa 4:** `scripts/medir-pipeline.ts` + este apêndice (§15).

## 15. Apêndice — custo por capítulo (obra real)

Script: `server/scripts/medir-pipeline.ts` (roda com
`npx tsx scripts/medir-pipeline.ts <export.json> [capítulo]`). Fonte: export real
de 十日终焉 (capítulos 118 e 119; glossário com 125 termos). Contagem por
estimativa local (proxy relativo; com chave da Anthropic no cofre usa
`count_tokens`, exato). "Custo efetivo" pondera o cache da Anthropic (escrita
1,25×, leitura 0,1×, usuário 1×). A revisão humana é integral nos dois cenários,
então **tempo humano não entra** — a pergunta é só financeira (doc §1).

| Fluxo (por capítulo) | Cap. 118 | Cap. 119 |
|---|---:|---:|
| Tradução (linha de base) | 5 446 | 6 699 |
| QA por 2ª IA (opt-in) | 7 622 (+140%) | 9 259 (+138%) |
| 2ª passagem (projeção, Etapa 5) | ~5 180 (+95%) | ~5 364 (+80%) |

Leitura dos números:

- **A tradução em lote não fica mais cara por token** — é a mesma montagem de
  blocos da tradução avulsa. O ganho financeiro do lote não aparece nesta
  métrica: vem de (a) o cache ficar quente entre capítulos emendados (a tradução
  manual, com pausas, estoura o TTL de 5 min e reescreve o cache) e (b) surfar
  as cotas gratuitas via cadeia de failover ordenada por custo — dinheiro e
  cota, não tokens.
- **O QA custa ~+140% por capítulo** porque envia zh **e** pt de cada frase (é o
  cerne da auditoria: comparar original e tradução), enquanto a tradução manda
  só o zh. Por isso o QA nasce **opt-in e por capítulo** — a medição torna o
  preço visível para a decisão, como pedido.
- **A 2ª passagem projeta ~+80–95%** (uma chamada barata de referentes/gênero
  por capítulo, saída minúscula). Fica para a Etapa 5, agora com número.
- **Desperdício que a Etapa 0 eliminou** (fora da conta por capítulo, cenário da
  auditoria): A1 evitava até 5 chamadas pagas de entrada (~4,8K tokens cada) num
  bloco fadado a truncar; M1 evitava retries de 429 que contavam contra a cota.
