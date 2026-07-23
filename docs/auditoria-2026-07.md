# Auditoria técnica — julho/2026

Auditoria completa do código (Passo 1 do plano da Nave Mãe), do zero até o estado atual.
**Nada foi corrigido nesta sessão** — este documento é o produto. Cada achado traz
arquivo:linha, impacto e correção proposta. Severidades: **crítico** (perda de dados,
queda do processo ou gasto duplicado em uso normal), **alto** (dano real em fluxo comum),
**médio** (dano em fluxo menos comum ou custo evitável recorrente), **baixo** (higiene).

## 0. Estado real de testes e typecheck

Rodados em 2026-07-22, na branch `claude/dao-tale-translation-app-ernik3`:

- `npm test`: **47/47 testes passando** em 5 arquivos (`segmentar` 13, `prompts` 10,
  `repos` 1, `job` 1, `app` 22). Duração ~1 s.
- `npm run typecheck`: **limpo** nos dois workspaces (server e web), `tsc --noEmit` sem erros.

A bateria de integração (`app.test.ts`) é boa e cobre os fluxos principais de ponta a
ponta com o provedor mock. O ponto fraco de cobertura é o pipeline em si (ver M8).

---

## 1. Críticos

### C1 — Corrida na largada do job: dois jobs simultâneos no mesmo capítulo
**Arquivo:** `server/src/traducao/job.ts:80` (checagem), `:97` (await), `:138` (registro)

`iniciarTraducao` checa `jobs.has(capituloId)` no início, mas só registra o job no Map
na linha 138 — e entre as duas coisas há um `await obterChave(...)` (linha 97). Duas
requisições próximas (duplo clique em "Traduzir", retry do front, duas abas) passam
ambas pela checagem e iniciam **dois loops `executarJob` concorrentes no mesmo
capítulo**: cada bloco é traduzido e pago duas vezes, os dois jobs escrevem nas mesmas
frases, o contador de progresso soma errado e `cancelarJob` só alcança o job que ficou
por último no Map.

**Impacto:** gasto de API em dobro no capítulo inteiro + estado de progresso corrompido.
**Correção:** registrar o job no Map (ou um lock síncrono) **antes** do primeiro `await`,
liberando-o nos caminhos de erro; ou re-checar `jobs.has` depois de cada `await` antes do `set`.

### C2 — `executarJob` sem `catch`: exceção inesperada derruba o servidor inteiro
**Arquivo:** `server/src/traducao/job.ts:144-333`

O corpo do job é `try { … } finally { … }` — sem `catch`. Os erros de provedor são
tratados dentro de `traduzirBlocoComRetry`, mas qualquer exceção fora desse funil
(erro do SQLite em `reposFrases`/`reposTermosSugeridos`, bug futuro num repo, exceção
de listener) escapa do `finally` e, como a chamada é `void executarJob(...)`
(linha 140), vira **unhandled rejection — que encerra o processo Node** (comportamento
padrão desde o Node 15). No meio de um lote longo, o app cai inteiro e a UI congela sem
explicação. Detalhe agravante: o `finally` ainda emite `job_concluido` (linha 329-331)
antes de o processo morrer, porque `erro_fatal` nunca foi preenchido.

**Impacto:** queda total do servidor por qualquer erro não previsto durante tradução.
**Correção:** adicionar `catch (e)` que preenche `job.progresso.erro_fatal`, emite
`job_erro` e loga; opcionalmente um `process.on('unhandledRejection')` como cinto de
segurança global em `server/src/index.ts`.

### C3 — Nenhum backup automático; cópia manual do `.db` sozinho perde dias de trabalho
**Arquivos:** `server/src/db/index.ts` (nenhuma rotina), `server/src/db/portabilidade.ts`
(export é 100% manual), `server/src/index.ts` (nenhum shutdown/checkpoint)

A obra real (十日终焉) vive num único arquivo SQLite e **já houve susto com instância
temporária**. Hoje: (1) não existe backup automático — o export JSON depende de o
usuário lembrar de clicar; (2) não há handler de shutdown, então o WAL não é
checkpointado ao fechar — **no ambiente auditado, `dao-tale.db` está com mtime de
14/jul e o `dao-tale.db-wal` tem 4,8 MB com mtime de 18/jul**, ou seja, dias de
trabalho vivem só no WAL; quem copiar apenas o `.db` como "backup" perde tudo isso;
(3) o único backup existente é `dez-dias-ate-o-fim-backup.json` solto na raiz do repo.

**Impacto:** um disco que falha, um `rm` errado ou uma cópia ingênua do `.db` = perda
de trabalho real e insubstituível.
**Correção (quick win):** no boot, `db.backup(caminho-datado)` do better-sqlite3 (API
online-safe, inclui o WAL) para `<dados>/backups/`, com retenção de N cópias; handler
de `SIGINT`/`SIGTERM` fazendo `wal_checkpoint(TRUNCATE)` + `db.close()`. Opcional:
export JSON automático por obra junto do backup.

---

## 2. Altos

### A1 — Nenhum provedor checa truncamento (`stop_reason`/`finish_reason`)
**Arquivos:** `server/src/ia/claude.ts:83-107` (`max_tokens: 8192` fixo),
`server/src/ia/gemini.ts:170-198`, `server/src/ia/compat.ts:112-131`;
agravado por `server/src/rotas/sistema.ts:14` (`tamanho_bloco` aceita até **400**)

Um bloco de 60 frases longas pode estourar 8192 tokens de saída no Claude (e os limites
padrão dos demais); com `tamanho_bloco` configurado alto, o estouro é garantido. Quando
a resposta trunca, o tool use/JSON vem incompleto, o Zod rejeita, o erro é classificado
como *transitório* e o retry **repete a mesma chamada fadada a truncar até 5×, pagando
entrada cheia cada vez**, para no final marcar o bloco como erro sem dizer o motivo real.

**Impacto:** dinheiro queimado em série + capítulos longos "falhando" sem causa visível.
**Correção:** checar `stop_reason === 'max_tokens'` (Claude), `finishReason` (Gemini) e
`finish_reason` (compat); nesse caso, **não** repetir igual — dividir o bloco ao meio e
tentar de novo, ou subir `max_tokens`. Alinhar o teto de `tamanho_bloco` à capacidade real.

### A2 — Sem proteção contra CSRF/DNS rebinding: qualquer site aberto no navegador pode operar a API
**Arquivos:** `server/src/app.ts:26-58` (nenhuma validação de Origin/Host),
`server/src/config.ts:28` (bind em 127.0.0.1 — correto, mas insuficiente)

O servidor escuta só em 127.0.0.1 (bom), mas **não tem autenticação nem validação de
`Origin`/`Host`**. Qualquer página web aberta no navegador do usuário pode disparar
`fetch` cross-origin para `http://127.0.0.1:8317/api/...` — a resposta não é legível,
mas o efeito colateral acontece: `DELETE /obras/:id` (apaga a obra inteira),
`PUT /credenciais/:provedor` (troca a chave), `POST /capitulos/:id/traduzir` (queima
cota/crédito). O Hono parseia o JSON sem exigir Content-Type, então nem o "simple
request" de `text/plain` é barrado. Com DNS rebinding, até leitura completa é possível.

**Impacto:** destruição de dados ou gasto de API disparado por um site malicioso qualquer.
**Correção (barata):** middleware antes das rotas `/api` que rejeita requisição cujo
`Host` não seja `127.0.0.1:<porta>`/`localhost:<porta>` e cujo `Origin`, quando
presente, não seja o próprio app (cobre o proxy do Vite em dev). ~15 linhas.

### A3 — Correção rápida em lote substitui *substring*, sem fronteira de palavra
**Arquivos:** `server/src/db/repos.ts:379-392` (`substituirTermo` usa `replace()` do
SQL), rota `server/src/rotas/frases.ts:46-67`; contraste com `repos.ts:23-26`
(`trocaPorPalavra`, que existe e não é usada aqui) e `repos.ts:398-423`
(`substituirTermoGlossario`, que faz certo)

Das duas rotas de substituição em lote, a do glossário (`/glossario/:id/substituir`)
aplica `trocaPorPalavra` com fronteira Unicode; mas a correção rápida
(`/obras/:obraId/substituir`, usada pelo EditorCapitulo) chama `substituirTermo`, que
faz `replace(texto_pt, de, para)` cru no SQL — troca **dentro de palavras** ("Rio"
dentro de "Riordan"). O front até extrai o termo com fronteiras (`web/src/util/troca.ts`),
mas o servidor aplica sem elas. E a prévia (`contarTermo`) conta *frases*, enquanto a
aplicação troca *todas as ocorrências* de cada frase — a prévia subestima o efeito.

**Impacto:** corrupção silenciosa, em lote, de traduções já revisadas — marcadas como
`editado_manualmente`, ou seja, protegidas contra retradução que consertaria.
**Correção:** trazer a substituição para o JS com `trocaPorPalavra` (mesmo desenho de
`substituirTermoGlossario`) e fazer a prévia contar ocorrências reais.

### A4 — Prompt caching da revisão paga a sobretaxa de escrita e nunca acerta o cache
**Arquivos:** `server/src/ia/claude.ts:152-157` (`cache_control` no sistema da revisão),
`server/src/ia/prompts.ts:117-134` (`sistemaRevisao` embute o glossário **no sistema**),
`server/src/rotas/frases.ts:144-154` (glossário **filtrado por frase**)

Na tradução, o desenho está certo: com `glossario_relevante` ligado (padrão), o
glossário variável vai na mensagem do usuário e o sistema fica idêntico entre blocos —
pré-requisito do cache. Na revisão, não: `sistemaRevisao` sempre embute o glossário no
bloco de sistema, e a rota passa o glossário filtrado pela frase questionada. Resultado:
**cada revisão escreve um cache novo (+25% sobre os tokens do sistema) que nunca será
reutilizado** — frase diferente → glossário diferente → prefixo diferente (e TTL de 5 min).

**Impacto:** toda revisão custa mais caro do que custaria sem `cache_control`.
**Correção:** replicar o padrão da tradução — flag `glossarioNoUsuario` também em
`sistemaRevisao`/`usuarioRevisao`; aí o sistema (prompt mãe + protocolo) vira estável e
o cache passa a acertar de verdade entre revisões seguidas da mesma obra.

---

## 3. Médios

### M1 — 429 com `parar_no_limite=false` insiste com backoff curto demais, contando cota
**Arquivo:** `server/src/traducao/job.ts:22` (`BACKOFF_MS` 2/4/8/16 s), `:341-364`

Limites de RPM renovam por minuto; 2–16 s de espera quase nunca bastam. O job faz até
5 tentativas (cada uma registrada em `uso_ia` via `aoTentar`, linha 240) e desiste
marcando o bloco como erro. **Correção:** para `erro.tipo === 'limite'`, backoff
próprio (ex.: 30/60/120 s) e, nos provedores, respeitar `Retry-After` quando vier.

### M2 — Extração de termos reenvia prompt mãe + glossário inteiro a cada frase, sem cache
**Arquivos:** `server/src/ia/claude.ts:117-136` (sem `cache_control`),
`server/src/ia/prompts.ts:162-178` (glossário completo no sistema),
`server/src/rotas/frases.ts:224-238`

A curadoria é usada frase a frase, em sequência; cada clique paga o prompt mãe + o
glossário **completo** de novo, sem cache. A rota já re-filtra o resultado no servidor
(linhas 232-237), então mandar o glossário inteiro "para não repetir" é redundante.
**Correção:** `cache_control` no sistema (que é estável por obra) e/ou enviar só os
termos presentes na frase.

### M3 — Correção aceita do Protocolo de Revisão é perdida na retradução "preservar editadas"
**Arquivo:** `server/src/db/repos.ts:873-882` (`aplicarCorrecao` não marca
`editado_manualmente`), `repos.ts:554-572` (`reabrirParaTraducao` só olha essa flag)

Doc 03 §3 diz que a distinção fica no caso de teste `corrigido` — mas
`reabrirParaTraducao` decide **só** por `editado_manualmente`. Retraduzir com
"sobrescrever, preservando editadas" reabre as frases corrigidas via QA e a IA
sobrescreve a correção aceita. **Correção:** `aplicarCorrecao` marcar
`editado_manualmente = 1` (semanticamente é uma decisão humana), ou a reabertura
excluir frases com caso `corrigido`.

### M4 — `DELETE /obras/:id` não bloqueia jobs de tradução ativos
**Arquivo:** `server/src/rotas/obras.ts:120-128`; contraste com
`server/src/rotas/capitulos.ts:91-93` (delete de capítulo bloqueia)

Excluir a obra com um capítulo traduzindo deixa o job em voo pagar a chamada corrente
(e possivelmente a próxima) contra frases que já não existem; os writes viram no-op.
**Correção:** a mesma checagem `jobEmExecucao` varrendo os capítulos da obra.

### M5 — Saneador de JSON do compat falha quando o objeto começa na posição 0
**Arquivo:** `server/src/ia/compat.ts:83-85`

`if (inicio > 0 && fim > inicio)` — se a resposta começa com `{` e tem lixo **depois**
do `}` final (caso comum em modelos pequenos), o recorte não é aplicado, o
`JSON.parse` falha e a chamada inteira é repetida (paga) até 5×.
**Correção:** `inicio >= 0`.

### M6 — Capítulo pode ficar preso no status `traduzindo` sem job nenhum rodando
**Arquivo:** `server/src/traducao/job.ts:320-325`

Se o job termina com frases em erro (ou cancelado), o status não sai de `traduzindo`.
`progressoAtual` reporta `em_execucao: false`, mas a lista de capítulos exibe um estado
que não corresponde a nada em execução. **Correção:** ao encerrar sem completude,
regredir para um estado coerente (ex.: `rascunho`) ou introduzir `parcial`.

### M7 — Contrato de saída estruturada mantido à mão em três formatos paralelos
**Arquivos:** `server/src/ia/prompts.ts:184-284` (JSON Schema + instruções textuais),
`server/src/ia/gemini.ts:26-93` (espelhos em `Type.*`), `server/src/ia/respostas.ts` (Zod)

Cada mudança de contrato (e as evoluções planejadas — duas passagens, QA por segunda
IA — mudarão) exige sincronizar: schema JSON, schema Gemini, instrução textual do
compat e o Zod. Hoje já são 3 contratos × 4 representações. **Correção:** gerar tudo a
partir do Zod (`z.toJSONSchema` no Zod 4 ou `zod-to-json-schema`); o formato Gemini e o
texto de instrução podem ser derivados do JSON Schema.

### M8 — Pipeline quase sem testes diretos
**Arquivo:** `server/src/traducao/job.test.ts` (1 teste — termos adotados)

Retry/backoff, classificação limite/fatal, cancelamento, job só de título, a corrida C1
e o caminho de erro por bloco não têm teste. O `app.test.ts` cobre indiretamente os
caminhos felizes. Para as evoluções planejadas (lote, duas passagens), o pipeline é
justamente onde mexer sem rede de proteção custa caro. **Correção:** bateria dedicada
com provedor-espião programável (o padrão do teste atual já serve de base).

---

## 4. Baixos

- **B1** `server/src/traducao/job.ts:20` — Map `emissores` nunca é limpo; cresce um
  EventEmitter por capítulo já visitado. Inofensivo em escala atual.
- **B2** `server/src/rotas/sistema.ts:75-80` — `PUT /credenciais/:provedor` aceita
  qualquer string como provedor (grava entrada órfã no keyring). Validar contra
  `PROVEDORES_IDS`.
- **B3** `server/src/rotas/curadoria.ts:151-178` — import CSV do glossário insere linha
  a linha sem transação: import parcial em caso de erro e mais lento. Envolver em
  `db.transaction`.
- **B4** `server/src/db/portabilidade.ts:215` — JSON importado com dois prompts
  `ativo: true` viola o índice parcial e vira 500 genérico em vez de 400 amigável.
- **B5** `server/src/rotas/comparador.ts:64-66` — usa `filtrarGlossarioRelevante` sem
  `incluirPrincipais`, diferente do job e da revisão: variantes chegam sem a canônica.
- **B6** `dez-dias-ate-o-fim-backup.json` na raiz do repo, não ignorado (o `.gitignore`
  cobre `*.db`, não backups JSON) — risco de commitar o conteúdo da obra. Mover para o
  diretório de dados e/ou ignorar o padrão.
- **B7** `server/src/index.ts:9` — sem tratamento de `EADDRINUSE`; `scripts/start.mjs`
  mitiga no uso diário, mas `npm run dev` com porta ocupada morre com stack bruta.
- **B8** `server/src/db/repos.ts:955-968` — `uso_ia` conta requisições, não tokens.
  Todas as respostas dos 4 provedores trazem `usage`; sem registrar, o indicador de
  custo é cego para o que realmente é cobrado (ver quick wins).
- **B9** `server/src/db/repos.ts:908-910` — `Number()` sem guarda de NaN nas configs;
  só alcançável editando o banco à mão (a API valida).
- **B10** `server/src/db/repos.ts:666-692` — `aparicoes` é O(termos × frases) em JS;
  numa obra grande (centenas de capítulos) a tela do glossário vai sentir. Aceitável
  por ora; cache ou SQL `instr` se doer.

---

## 5. Quick wins de custo

Em ordem de retorno por esforço:

1. **Corrigir o cache da revisão (A4)** — hoje toda revisão paga +25% no sistema à toa;
   com o glossário no usuário, revisões seguidas pagam ~10% do prefixo (cache hit).
2. **Checar truncamento (A1)** — elimina o pior desperdício: 5 chamadas pagas por bloco
   fadado a falhar. Uma condição por provedor.
3. **`inicio >= 0` no saneador do compat (M5)** — uma linha; poupa retries pagos nos
   provedores gratuitos/baratos que mais devolvem lixo em volta do JSON.
4. **Backoff decente no 429 (M1)** — cada retry inútil hoje conta na cota diária;
   esperar 60 s em vez de 2 s salva o bloco e a cota.
5. **Cache + glossário relevante na extração de termos (M2)** — a curadoria frase a
   frase é o fluxo com mais chamadas por minuto do app.
6. **Registrar tokens em `uso_ia` (B8)** — não corta custo, mas dá visibilidade: sem
   `input_tokens`/`output_tokens`/`cache_read` gravados, é impossível saber se os itens
   acima funcionaram. Todas as respostas já trazem os números; é adicionar colunas.
7. **Fechar a corrida do duplo job (C1)** — raro, mas quando acontece paga o capítulo
   duas vezes inteiro.

Não é quick win, mas registro: o desenho de custo da **tradução** está bem feito —
sistema estável + glossário filtrado na mensagem do usuário + `cache_control` no Claude
+ `thinkingBudget: 0` no Gemini Flash + termos adotados enxutos. As ideias da pesquisa
de mercado (glossário filtrado por bloco, prompt caching) já estão implementadas aí.

---

## 6. Divergências código × documentação

| # | Doc | Diz | Código faz | Ação sugerida |
|---|-----|-----|-----------|----------------|
| D1 | 05 §2 | Blocos de ~20 frases; cauda de 2 | Padrão 60 e 5 (`shared/src/index.ts:160-162`) | Atualizar doc |
| D2 | 05 §2 | "sem quebrar parágrafo no meio do bloco quando possível" | Corte é por contagem pura (`job.ts:179`) | Implementar ou remover do doc |
| D3 | 02 §6 | Jobs "um capítulo por vez" | Um job **por capítulo**; N capítulos em paralelo é permitido | Decidir: limitar no código (melhor p/ rate limit) ou corrigir doc |
| D4 | 02 §3 | `db/repositorios/` por tabela, `shared/src/api/`+`dominio.ts`, `web/src/api/` gerado | `repos.ts` único (968 linhas), `shared/src/index.ts` único, `web/src/api.ts` à mão | Atualizar doc (estrutura real é razoável) |
| D5 | 05 §4.2 | Varredura de consistência automática "ao concluir capítulo" | Endpoint manual `GET /capitulos/:id/consistencia` | Doc, ou automatizar no fim do job (barato: é local, sem IA) |
| D6 | 05 §2 | Frases faltantes → erro "com motivo registrado em log" | Nenhum log | Adicionar log (ajuda a diagnosticar A1) |
| D7 | 02 §4 / 03 | Diretório `exports/` como destino padrão | Não existe; export é download do navegador | Atualizar doc (ou usar em C3) |
| D8 | 03 (regras) §2 | Reimportar texto de origem re-segmenta o capítulo | Não implementado (número duplicado → 409) | Backlog ou remover do doc |
| D9 | 02 §1 | Saídas de rede: "Anthropic, Google" | 6 provedores (DeepSeek, OpenRouter, Groq, Mistral a mais) | Atualizar diagrama |
| D10 | 05 §3+§5 | Revisão com caching e regra do glossário-no-usuário | Revisão contradiz a regra (ver A4) | Corrigir código (A4) |

Divergência menor de segmentação: doc 05 §1 regra 5 ("reticências como ponte") descreve
uma condição que a implementação não tem — `…` sempre encerra (absorvendo a sequência).
Os casos da tabela de testes do doc passam mesmo assim; alinhar o texto da regra.

---

## 7. O que está sólido (para não mexer sem motivo)

- WAL + `foreign_keys = ON` + migrações SQL versionadas com `foreign_key_check` ao final.
- Transações nos pontos certos: persistência por bloco, mesclar/dividir com renumeração
  em duas fases UNIQUE-safe, import completo atômico.
- Estado durável do job em `frases.status_traducao` — retomada após queda funciona por desenho.
- Glossário relevante + variantes com canônica incluída (tradução e revisão).
- Chaves no keyring do SO com fallback 0600, nunca devolvidas por endpoint (conferido).
- Servidor só em 127.0.0.1; serving estático sem path traversal (normalize + prefixo).
- Saneamento de resposta dos modelos compat (`<think>`, cercas) e Zod na fronteira de
  todos os provedores.
- Segmentador com a melhor bateria de testes do projeto, fiel ao doc.
- SSE com escrita serializada e listener registrado antes do primeiro write (corrige
  corridas clássicas de stream).

## 8. Prontidão para as evoluções planejadas

- **Lote (fila de capítulos):** o Map de jobs por capítulo comporta; falta decidir D3
  (concorrência) e resolver C1/C2 antes — os dois viram bombas com lote.
- **Duas passagens:** `RequisicaoTraducaoBloco` não tem noção de "passe"; `executarJob`
  (190 linhas) concentra montagem de contexto + orquestração + persistência — extrair a
  montagem do bloco para função pura facilitaria o segundo passe e os testes (M8).
- **QA por segunda IA:** vai criar o 4º contrato de saída estruturada — resolver M7
  (fonte única dos schemas) antes de multiplicar por 4 provedores.
