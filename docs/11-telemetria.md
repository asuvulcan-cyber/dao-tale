# 11 — Telemetria de custo e qualidade

Passo 5 do plano da Nave Mãe. **Objetivo único: parar de estimar.** Hoje `uso_ia`
(migração 003) só conta requisições por dia — não existe um único token, centavo ou
capítulo gravado. Todas as medições dos Passos 2 e 3 (`scripts/medir-prompt.ts`,
`scripts/medir-pipeline.ts`, apêndices dos docs 08 e 09) são **estimativas locais**; os
quatro provedores recebem o `usage` das APIs e o jogam no lixo. Este passo fecha o **B8**
da auditoria (`docs/auditoria-2026-07.md` §4 e §5.6).

Premissa inegociável (`feedback-lote-financeiro`): **o valor se mede em dinheiro e cota,
nunca em tempo humano.** A revisão humana é integral em qualquer fase, então latência e
"produtividade" **não** entram no schema nem no painel — de propósito. O painel existe
para responder três perguntas financeiras:

| # | Pergunta | Como o painel responde |
|---|---|---|
| a | O prompt caching está acertando? | `cache_leitura ÷ (entrada + cache_leitura + cache_criacao)` por provedor/modelo/papel, + economia em dinheiro, + alerta de "escrita de cache perdida" |
| b | O lote compensou em dinheiro? | custo real por 1.000 frases nos capítulos que passaram por lote vs. os sequenciais |
| c | Quão perto estou do limite gratuito? | requisições de hoje (`uso_ia`) contra `cotas_diarias`, com tokens e custo do dia ao lado |

> ⚠️ Regra de trabalho deste passo (igual ao Passo 4): **nunca** rodar teste/e2e contra
> `~/.local/share/dao-tale`. Toda verificação usa `DAO_TALE_DIR` apontando para pasta
> descartável, com provedor `mock`.

---

## 1. Captura do `usage` real (os 4 provedores + mock)

Novo tipo no contrato de provedor (`server/src/ia/provedor.ts`), irmão do `bruta` que já
existe em todas as respostas:

```ts
/** Consumo real devolvido pela API numa chamada. `null` = a API não expõe o campo
 *  (≠ 0, que significa "medido zero"). */
export interface UsoChamada {
  tokens_entrada: number | null;        // entrada paga a preço cheio (SEM o que veio do cache)
  tokens_saida: number | null;
  tokens_cache_leitura: number | null;  // ~0,1× do preço de entrada
  tokens_cache_criacao: number | null;  // ~1,25× do preço de entrada
}
```

`RespostaTraducaoBloco`, `RespostaRevisaoProvedor`, `RespostaExtrairTermos`,
`RespostaRefinarPrompt` e `RespostaQa` ganham `uso: UsoChamada`. Nenhuma assinatura de
método muda — só o retorno cresce, então os call sites que não se importam seguem iguais.

**Normalização (o detalhe que faz os provedores serem comparáveis):** a Anthropic já
devolve `input_tokens` **excluindo** cache; o Gemini e os compatíveis com OpenAI devolvem o
prompt **incluindo** o que veio do cache. Sem subtrair, o mesmo capítulo pareceria mais
caro no Gemini e a métrica (a) daria ~0% de acerto. A conversão vive em um módulo novo,
`server/src/ia/uso.ts`, com uma função pura por formato — testável sem rede:

| Provedor | `tokens_entrada` | `tokens_saida` | `cache_leitura` | `cache_criacao` |
|---|---|---|---|---|
| **Claude** `message.usage` | `input_tokens` | `output_tokens` | `cache_read_input_tokens` | `cache_creation_input_tokens` |
| **Gemini** `usageMetadata` | `promptTokenCount − cachedContentTokenCount` | `candidatesTokenCount + thoughtsTokenCount` | `cachedContentTokenCount` | `null` (não expõe) |
| **compat** (DeepSeek/OpenRouter/Groq/Mistral) `usage` | `prompt_tokens − cache_lido` | `completion_tokens` | `prompt_tokens_details.cached_tokens` ou `prompt_cache_hit_tokens` (DeepSeek) | `null` |
| **mock** | estimativa determinística do texto do prompt | idem | cache **simulado** (ver abaixo) | idem |

O `thoughtsTokenCount` do Gemini entra em `tokens_saida` porque **é cobrado como saída** —
é exatamente o desperdício que o `thinkingBudget: 0` do doc 05 combate; escondê-lo
tornaria a economia invisível.

**Mock com cache simulado:** para verificar o painel e2e sem gastar um centavo, o mock
estima tokens com o mesmo proxy dos scripts (≈1 tok/char CJK + 1/3,8 nos demais) e simula
o cache por hash do prompt de sistema: primeira chamada = `cache_criacao`, seguintes =
`cache_leitura`. Estado de módulo, com `_zerarCacheMock()` exportado para os testes. O
painel rotula linhas do provedor `mock` como simuladas; sem preço cadastrado, elas não
entram em nenhum total de dinheiro.

---

## 2. Persistência — `eventos_ia` (migração 010)

```sql
CREATE TABLE eventos_ia (
  id                   INTEGER PRIMARY KEY,
  em                   TEXT NOT NULL DEFAULT (datetime('now')),  -- UTC, ordena o histórico
  data                 TEXT NOT NULL,                            -- data LOCAL YYYY-MM-DD (mesma chave de uso_ia)
  obra_id              INTEGER REFERENCES obras(id)     ON DELETE SET NULL,
  capitulo_id          INTEGER REFERENCES capitulos(id) ON DELETE SET NULL,
  papel                TEXT NOT NULL CHECK (papel IN
                         ('traducao','revisao','qa','extracao','refinamento','titulo','comparador')),
  provedor             TEXT NOT NULL,
  modelo               TEXT NOT NULL,
  tokens_entrada       INTEGER,
  tokens_saida         INTEGER,
  tokens_cache_leitura INTEGER,
  tokens_cache_criacao INTEGER,
  custo_estimado       REAL   -- USD, calculado na gravação; NULL = modelo sem preço cadastrado
);
CREATE INDEX idx_eventos_ia_obra     ON eventos_ia(obra_id, em);
CREATE INDEX idx_eventos_ia_capitulo ON eventos_ia(capitulo_id);
CREATE INDEX idx_eventos_ia_dia      ON eventos_ia(data, provedor);
```

Decisões e o porquê:

- **`ON DELETE SET NULL`, não CASCADE.** É um livro-caixa: apagar um capítulo não desfaz o
  dinheiro que ele custou. O total da obra continua honesto; a linha só deixa de ser
  atribuível ao capítulo.
- **Uma linha por chamada que devolveu `usage`** (chamada que falhou não tem nada a
  faturar). Nenhuma coluna de erro: o próprio par com `uso_ia` já conta a história.
- **`uso_ia` continua contando tentativas.** É escrito *antes* da chamada, uma vez por
  **tentativa** (retries inclusive) — é isso que o indicador de cota precisa, porque o
  provedor debita a tentativa. Logo `requisicoes(uso_ia) ≥ chamadas(eventos_ia)`, e
  **a diferença é o desperdício** (retries, 429, truncamento), sem precisar de coluna nova.
  - ⚠️ **Um defeito real apareceu aqui:** o **QA nunca era contado em `uso_ia`**, então o
    indicador de cota subestimava o consumo sempre que o QA rodava — e o painel exibia
    `faturadas > tentativas`, que é impossível. Corrigido em `qa.ts` (uma linha, contada
    antes da chamada como nos outros papéis), com teste do invariante.
  - Como `uso_ia` não tem `obra_id`, a comparação tentativas × faturadas vive no painel
    **do dia** (global), não no cabeçalho da obra — correção ao desenho original.
- **Sem latência, sem contagem de frases por evento.** Latência é tempo, não dinheiro
  (premissa). Frases por capítulo já vêm de `frases`, que é o denominador certo.
- **`custo_estimado` é gravado na hora** (o que se acreditava pagar naquele momento) e uma
  mudança de preço **não** reescreve o histórico. Como o usuário vai cadastrar preços
  depois de já ter rodado, existe `POST /telemetria/recalcular`, explícito, que recomputa
  todas as linhas com a tabela vigente.

Módulo novo `server/src/telemetria/registrar.ts` com um único ponto de entrada:

```ts
registrarEvento(db, { obra_id, capitulo_id, papel, provedor, modelo, uso });
```

Ele resolve o preço, calcula o custo e grava — **sempre dentro de try/catch com
`console.warn`**. Telemetria nunca derruba um job (lição do C2 da auditoria): perder uma
linha de contabilidade é aceitável, perder um capítulo pago não.

---

## 3. Tabela de preços (Configurações)

Config nova `precos_modelos`: mapa `"<provedor>:<modelo>"` → preço em **USD por 1M
tokens**, com curinga `"<provedor>:*"` como fallback do provedor.

```ts
export interface PrecoModelo {
  entrada: number;          // USD / 1M de entrada não-cacheada
  saida: number;            // USD / 1M de saída
  cache_leitura?: number;   // padrão: entrada × 0,1
  cache_criacao?: number;   // padrão: entrada × 1,25
}
export type PrecosModelos = Record<string, PrecoModelo>;
```

Busca: chave exata → `provedor:*` → **nenhuma** (`custo_estimado = NULL`).

**O que vem de fábrica:** só a família Claude, cujos preços públicos eu tenho como
verificados (Opus 5 5/25, Sonnet 5 3/15, Haiku 4.5 1/5, Fable 5 10/50 — leitura 0,1× e
escrita 1,25×). **Nada é inventado para os outros provedores.** Modelo sem preço aparece no
painel com contador "N chamadas sem preço" e etiqueta de aviso — nunca como US$ 0,00
disfarçado de grátis. Faixa gratuita é cadastrada explicitamente com preços 0, e aí o
painel mostra "custa cota, não dinheiro". Três estados distintos: **com preço**,
**gratuito explícito**, **desconhecido**.

Config auxiliar `taxa_usd_brl` (0 = desligado): coluna secundária em reais, porque a
pergunta do usuário é em reais. Validação em `configSchema` como as demais.

---

## 4. Onde o `usage` é gravado (todos os pontos de chamada)

| Papel | Arquivo · momento | obra_id | capitulo_id |
|---|---|---|---|
| `traducao` | `traducao/job.ts` — após cada bloco bem-sucedido | ✅ | ✅ |
| `titulo` | `rotas/obras.ts` — contracapa: título/sinopse (`traduzirContracapa`, doc 08 §11) | ✅ | — |
| `revisao` | `rotas/frases.ts` — `POST /frases/:id/revisar` | ✅ | ✅ |
| `extracao` | `rotas/frases.ts` — `POST /frases/:id/sugerir-termos` | ✅ | ✅ |
| `refinamento` | `rotas/obras.ts` — `POST /obras/:id/prompts/refinar` | ✅ | — |
| `qa` | `traducao/qa.ts` — a cada bloco de pares | ✅ | ✅ |
| `comparador` | `rotas/comparador.ts` — uma linha por alvo | ✅ | — |

O lote não precisa de gancho próprio: ele chama `iniciarTraducao` e `analisarCapitulo`, que
já gravam. É a razão de a pergunta (b) sair de graça.

---

## 5. Painel — custo ao lado de qualidade

Aba nova na obra: **Custos** (`/obras/:id/custos`, `web/src/paginas/Telemetria.tsx`).
A qualidade **não é recalculada**: vem de onde já é computada — edição humana e termos
novos de `checkpoint.ts` (`agregadosCheckpoint`), violações de `consistencia.ts`
(`capitulos.consistencia_violacoes`), apontamentos de `qa.ts` (`qa_pendentes`).

**Rota `GET /obras/:id/telemetria`** — um payload, três blocos:

1. **Cabeçalho da obra**: custo total (USD e R$), tokens por tipo, chamadas por papel,
   chamadas sem preço.
2. **Tabela por capítulo** — uma linha por capítulo, custo e qualidade na mesma linha:

   | Cap. | Status | Chamadas | Entrada | Saída | Cache lido | Custo | US$/1k frases | Edição humana | Termos novos | Violações | QA pend. | Lote |
   |---|---|---|---|---|---|---|---|---|---|---|---|---|

   `US$/1k frases` é a coluna que torna capítulos de tamanhos diferentes comparáveis — e é
   o insumo da pergunta (b).
3. **Os três veredictos**, cada um com número real e vocabulário de amostra igual ao do
   checkpoint (`amostra-insuficiente` quando não há dados dos dois lados):
   - **(a) cache**: % de entrada servida do cache, economia em dinheiro, e alerta quando
     `cache_criacao > 0` e `cache_leitura = 0` (patologia A4 — paga-se a escrita e nunca
     se lê). ⚠️ **A detecção é por `(provedor, modelo, papel)`, não por modelo** — o e2e
     mostrou que agregar por modelo **esconderia justamente o A4**, onde era a *revisão*
     que perdia a escrita enquanto a *tradução* no mesmo modelo lia normalmente. Exige
     ≥ 2 chamadas do papel: a estreia de um prefixo sempre escreve sem ler.
   - **(b) lote**: US$/1k frases médio em lote vs. sequencial (grupo definido por
     `EXISTS` em `lote_capitulos`, sem coluna nova), com n de cada grupo.
   - **(c) cota**: por provedor, requisições de hoje / `cotas_diarias`, tokens e custo do
     dia — reaproveitando o cálculo do `IndicadorCota`.

**Rota `GET /telemetria/dia`** (global, não por obra): alimenta (c) na tela de
Configurações, ao lado da tabela de preços, para o usuário ver o efeito de cadastrar preço.

Legenda fixa no painel: **tudo aqui é MEDIDO** (`eventos_ia`). Projeções (2ª passagem,
Etapa 5) continuam só nos scripts e nos docs, rotuladas como projeção.

---

## 6. Reconciliação com os scripts de estimativa

Os dois scripts ganham a flag `--real`, que lê `eventos_ia` (respeitando `DAO_TALE_DIR`) e
imprime uma seção **CONFERÊNCIA CONTRA O MEDIDO** ao lado da estimativa:

- `medir-pipeline.ts --real [capítulo]`: tradução e QA estimados vs. medidos, e o overhead
  do QA medido vs. o **+140% projetado** (doc 09 §15). A projeção da 2ª passagem
  (+80–95%) segue como projeção — não há o que medir até a Etapa 5 existir.
- `medir-prompt.ts --real`: as reduções de revisão (−68%) e extração (−82%) do doc 08
  passam a ser conferíveis contra o cache real observado nos papéis `revisao`/`extracao`.

Os apêndices dos docs 08 e 09 recebem uma nota curta apontando para cá: **aqueles números
são estimativa; a partir do Passo 5 o medido manda.**

---

## 7. Testes (os 134 seguem verdes)

| Arquivo | O quê |
|---|---|
| `ia/uso.test.ts` | conversão por formato: subtração do cache no Gemini/compat, `thoughtsTokenCount` na saída, campo ausente → `null`, payload lixo → tudo `null` |
| `telemetria/precos.test.ts` | busca exata → curinga → nenhuma; padrões 0,1× / 1,25×; modelo sem preço → `custo NULL`; preço 0 explícito → custo 0 |
| `telemetria/repo.test.ts` | agregação por obra/capítulo, % de cache, lote vs. sequencial com amostra insuficiente, contagem de "sem preço", `recalcular` |
| `app.test.ts` (+) | e2e com `mock`: traduzir capítulo → linhas em `eventos_ia` com tokens > 0; `GET /obras/:id/telemetria` e `/telemetria/dia`; `uso_ia` intacto |

Nenhum teste novo escreve fora de `:memory:` — o override `DAO_TALE_DIR` continua sendo a
única porta para arquivo.

---

## 8. ⚠️ `DAO_TALE_DIR` não isola credenciais

Achado operacional deste passo, aprendido do jeito caro: uma instância descartável
(`DAO_TALE_DIR=/tmp/...`) tem banco próprio, **mas as chaves de API vêm do keyring do
sistema operacional**, que é do usuário, não da pasta de dados. Ao importar um export da
obra real numa instância de teste, ela chega com `provedor_padrao: gemini` — e um lote ali
faz **chamadas reais, pagas, contra a cota real**.

Antes de rodar qualquer coisa que chame IA numa instância de teste:

1. `PUT /obras/:id` com `provedor_padrao: "mock"` e `modelo_padrao: "mock-v1"`;
2. `PUT /configuracoes` com `provedor_padrao: mock`, `failover: []`, `provedor_qa: mock`;
3. passar `provedor` e `modelo` **explícitos** em toda chamada de rota.

O provedor `mock` reporta consumo simulado (§1), então o painel dá para ser verificado
inteiro sem tocar em provedor pago.

## 9. Ordem de implementação (incremental, 1 Passo = 1 commit)

1. `UsoChamada` + `ia/uso.ts` + os 4 provedores + mock devolvendo `uso` (ninguém lê ainda).
2. Migração 010 + `reposEventos` + `telemetria/precos.ts` + `registrarEvento`.
3. Ligar os 7 pontos de chamada (`uso_ia` intocado).
4. Config `precos_modelos` / `taxa_usd_brl` + UI em Configurações + `recalcular`.
5. Agregação + rotas + página **Custos** com os três veredictos.
6. `--real` nos dois scripts + notas nos apêndices dos docs 08/09.
7. e2e em servidor real com `DAO_TALE_DIR` descartável; commit; memória atualizada.

**Estado: tudo feito.** 177 testes verdes (eram 134; +43 novos), typecheck e build limpos.

## 10. Estado da implementação (2026-07-29)

Verificado num servidor real na porta 8421 com `DAO_TALE_DIR=/tmp/dao-tale-e2e-tele`
(export da obra real importado, tradução sequencial + lote + QA + revisão + extração pelo
provedor simulado):

| O que | Medido no e2e |
|---|---|
| Chamadas gravadas | 12, todas com papel, obra e capítulo corretos |
| Papéis exercitados | `traducao` (7), `qa` (2), `revisao` (2), `extracao` (1) |
| (a) cache | 23,6% de acerto, economia US$ 0,03 — nenhuma escrita perdida |
| (b) lote | 2 cap. em lote vs. 1 sequencial, comparação por US$/1k frases funcionando |
| (c) cota/desperdício | Gemini com **5 tentativas × 3 faturadas** — 2 tentativas que consumiram cota sem devolver consumo, exatamente o desperdício que o painel existe para mostrar |
| Reconciliação | QA projetado +140% (doc 09 §15) vs. **medido +126%**; revisão com 35% de acerto de cache confirmando o mecanismo do doc 08 |

Ressalva honesta sobre esses números: o −76% de "lote mais barato" do e2e é **artefato do
cenário de teste** (o capítulo em lote foi cobrado a preço zero), não um achado sobre lote.
O que o e2e prova é o mecanismo; os números que valem virão do uso real.

Defeitos pré-existentes corrigidos de passagem, os dois achados pelo próprio painel:
o **QA fora da contagem de cota** (§2) e a **detecção de cache por modelo em vez de por
papel** (§5). Além disso, o teste `POST /sistema/backup` afirmava que o total de backups
sempre sobe — impossível a partir do 10º por causa da rotação; passou a afirmar que o
backup novo existe e é o mais recente.
