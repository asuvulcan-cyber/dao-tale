# 05 — Segmentação, tradução e Protocolo de Revisão

Este é o coração técnico do app: os quatro fluxos que envolvem texto chinês e IA, mais a abstração de provedores e a guarda de chaves.

## 1. Segmentação de frases chinesas

Função pura `segmentar(textoOrigem: string): { texto_zh: string; paragrafo: number }[]`, implementada como máquina de estados caractere a caractere. Sem biblioteca de NLP — o problema é de pontuação, não de linguística.

### Regras

1. **Parágrafos primeiro:** o texto é dividido em parágrafos por linhas em branco ou quebras de linha (webnovels chinesas usam um parágrafo por linha). Cada parágrafo recebe um índice; frases nunca atravessam parágrafos.
2. **Pontuação forte encerra frase:** `。` `！` `？` `…`(e a forma dupla `……`) `‼` `⁉`, incluindo sequências (`？！` encerra uma vez, no fim da sequência).
3. **Aspas e parênteses asiáticos são regiões protegidas:** dentro de `「…」` `『…』` `“…”` `‘…’` `（…）` `《…》`, pontuação forte **não** encerra a frase — quem encerra é o fechamento da região quando o estado de profundidade volta a zero. Aninhamento (`「…『…』…」`) é tratado com pilha.
4. **Pontuação imediatamente após fechamento pertence à frase:** `「…。」` termina no `」`; `「…」。` termina no `。`.
5. **Reticências como ponte:** `……` só encerra se o que vem depois inicia novo conteúdo; sequências `…”` ou `…」` seguem a regra 4.
6. **Sobra sem pontuação final** (fim de parágrafo sem `。` etc.) vira frase mesmo assim — comum em títulos e onomatopeias.
7. **Aspas desbalanceadas** (autor esqueceu de fechar): ao fim do parágrafo a pilha é zerada à força e o trecho vira frase; o caso é logado, nunca derruba a importação.
8. Espaços/normalização: trim por frase; texto original **não** é alterado além disso (nada de normalizar pontuação — o `texto_zh` da frase deve ser um recorte fiel de `texto_origem`).

### Bateria de testes (mínimo obrigatório)

| Entrada | Saída esperada |
|---|---|
| `他说。她走了！` | 2 frases |
| `「你好。今天如何？」他问。` | 1 frase — a regra 3 impede corte no `。` e no `？` internos às aspas; diálogo + narração ficam juntos |
| `「等等！」她喊道。「别走。」` | 2 frases (`「等等！」她喊道。` e `「别走。」`) |
| `他想：『那人说过「不行」。』然后离开。` | 1 frase (aninhamento) |
| `什么……？` | 1 frase |
| `第一章 十日终焉` (sem pontuação) | 1 frase |
| Parágrafo com aspas nunca fechadas | 1 frase, log de aviso |
| Texto com `\r\n` (Windows) e linhas em branco múltiplas | parágrafos corretos |

## 2. Pipeline de tradução em blocos (decisão D3)

### Montagem

1. Frases alvo do job: todas com `status_traducao IN ('pendente','erro')` (e, se o usuário mandou sobrescrever, também as demais — respeitando a regra de `editado_manualmente` de `03-modelo-de-dados.md`).
2. Partição em **blocos de ~20 frases** (configurável), sem quebrar parágrafo no meio do bloco quando possível.
3. Cada chamada leva:
   - **Sistema:** prompt mãe ativo da obra + glossário completo formatado (`termo_zh → termo_pt [categoria]`) + instruções fixas do app (formato de saída, política de termos novos). Na Anthropic, este bloco recebe `cache_control` (**prompt caching**) — é idêntico em todos os blocos do capítulo, o que corta o custo de entrada em até 90% do 2º bloco em diante.
   - **Usuário:** cauda de contexto (últimas 2 frases zh + pt do bloco anterior, marcadas como "já traduzido, não retraduzir") + frases do bloco numeradas `[ordem] texto_zh` + próximas 2 frases zh do bloco seguinte marcadas como "contexto futuro, não traduzir".
4. **Saída estruturada obrigatória** (tool use / responseSchema):

```json
{
  "traducoes": [ { "ordem": 37, "texto_pt": "..." } ],
  "termos_novos": [ { "termo_zh": "...", "termo_pt": "...", "categoria": "...", "contexto": "..." } ]
}
```

### Validação e persistência por bloco

- Cada `ordem` retornada deve existir no bloco enviado; faltantes → essas frases ficam `erro` (motivo registrado em log); excedentes são descartados.
- Gravação transacional: `texto_pt`, `texto_pt_original_ia` (só se ainda NULL), `status_traducao='traduzida'`.
- `termos_novos` que não existem no `glossario` nem em `termos_sugeridos` pendentes viram sugestões novas; o SSE avisa a interface.
- Progresso SSE após cada bloco.

### Falhas e retomada

- **Erro transitório** (429, 5xx, timeout, rede): retry do bloco com backoff exponencial (2s, 4s, 8s, 16s; 4 tentativas). Persistindo, frases do bloco → `erro`, job **continua** nos próximos blocos.
- **Erro fatal** (401 chave inválida, 400): job para imediatamente com `job_erro` explicando (ex.: "chave de API inválida — Configurações").
- **Processo morto no meio:** nada a fazer — o estado é `status_traducao` no banco; reabrir e clicar "Retomar" (mesmo `POST /traduzir`) continua do ponto exato.
- Blocos são processados **sequencialmente** (1 por vez): mantém a cauda de contexto correta e respeita rate limits de contas novas.

## 3. Protocolo de Revisão

`POST /frases/:id/revisar { pergunta }`:

1. **Contexto montado no backend:** prompt mãe ativo + glossário (sistema, com caching) + N frases vizinhas de cada lado (padrão 3, configurável) com suas traduções atuais + a frase alvo (zh + pt atual + pt original da IA, se diferente) + a pergunta do usuário.
2. **Instrução fixa do protocolo** (sistema): a IA deve responder exclusivamente via saída estruturada:

```json
{
  "trecho_zh": "trecho exato do chinês que fundamenta a resposta",
  "veredito": "correto | incorreto",
  "justificativa": "explicação citando a regra aplicada",
  "secao_regra": "identificador curto da seção/passo do prompt mãe (ex.: '3.2-nomes-proprios'); 'geral' se nenhuma regra específica",
  "correcao_proposta": "tradução corrigida completa da frase, ou null se veredito=correto"
}
```

3. **Persistência automática** em `banco_testes` (com `resposta_bruta`, provedor, modelo). Status inicial: `correto → confirmado`, `incorreto → pendente`.
4. **Interface:** resposta no painel lateral; se `incorreto`, botão "Aplicar correção" → `POST /testes/:id/aplicar-correcao` (atualiza a frase e o caso → `corrigido`).
5. `secao_regra` é texto livre curto padronizado pela instrução — o agregado `GET /testes/recorrencias` conta casos não-confirmados por seção e a interface exibe o alerta "2+ casos: considere revisar o prompt mãe" (tela 4.4).

## 4. Captura de termos novos

Duas fontes, mesmo destino (`termos_sugeridos`):

1. **Durante a tradução:** campo `termos_novos` da saída estruturada de cada bloco (§2) — formaliza o que o prompt mãe do usuário já pedia em texto livre no fluxo antigo.
2. **Fase 2, varredura passiva:** ao concluir um capítulo, comparação simples das strings zh do glossário contra o texto de origem para detectar termos do glossário que **não** foram usados na tradução com o `termo_pt` canônico (controle de consistência reverso).

A interface mostra badge de pendências e tela de aceitar/ajustar/rejeitar com um clique.

## 5. Abstração multi-provedor

```ts
interface ProvedorIA {
  id: 'claude' | 'gemini' | 'deepseek' | 'openrouter' | 'groq' | 'mistral' | 'mock';
  listarModelos(): Promise<ModeloInfo[]>;            // p/ seletor nas Configurações
  testarCredencial(): Promise<ResultadoTeste>;
  traduzirBloco(req: RequisicaoTraducao): Promise<RespostaTraducao>;   // §2
  revisarFrase(req: RequisicaoRevisao): Promise<RespostaRevisao>;      // §3
}
```

- A orquestração (blocos, retomada, persistência, SSE) é **independente de provedor**; cada implementação só traduz a requisição para o formato do SDK e garante a saída estruturada:
  - **Claude:** tool use com `input_schema` + `tool_choice` forçado; `cache_control` no sistema.
  - **Gemini (Fase 2):** `responseMimeType: 'application/json'` + `responseSchema`; caching implícito do próprio Gemini. Nas chamadas de tradução, `thinkingConfig: { thinkingBudget: 0 }` em modelos 2.5 Flash (o raciocínio encarece a saída sem melhorar tradução; na revisão fica ligado). Se o modelo rejeitar a opção (400), repete sem ela.
  - **Compatíveis com OpenAI** (`server/src/ia/compat.ts` — DeepSeek, OpenRouter, Groq, Mistral): chat completions via `fetch`, `response_format: json_object` + instrução textual de formato no sistema, com saneamento de `<think>` e cercas de código antes do parse. Sem SDK novo; registrar = chamar `criarProvedorCompat` na fábrica.
  - **Mock:** responde localmente sem rede ("tradução simulada da frase N", vereditos alternados, termos falsos), com latência artificial opcional — permite desenvolver e demonstrar 100% do app sem chave de API (decisão D4) e é a base dos testes de integração.
- Resolução de provedor/modelo por prioridade: parâmetro da chamada → capítulo → obra → configuração global.
- Adicionar provedor futuro = 1 arquivo novo em `server/src/ia/` (ou uma chamada a `criarProvedorCompat`) + registro na fábrica.
- **Glossário relevante** (config `glossario_relevante`, padrão ligado): cada chamada leva só as entradas cujo `termo_zh` aparece no trecho enviado (bloco + cauda + contexto futuro + título; na revisão, frase + vizinhas + pergunta). Nesse modo o glossário vai na **mensagem do usuário** e o bloco de sistema fica idêntico entre blocos — preservando o prompt caching do Claude.

## 6. Guarda de chaves de API (decisão T6)

1. **Preferencial — keyring do SO** via `@napi-rs/keyring`: Credential Manager (Windows) e Secret Service/libsecret (Linux). Serviço `dao-tale`, uma entrada por provedor.
2. **Fallback — arquivo** `credenciais.json` no diretório de dados com permissão `0600`, usado apenas se o keyring falhar (ex.: Linux sem gnome-keyring). A tela de Configurações mostra **em qual modo está** e, no fallback, o caminho do arquivo com o aviso de que ele não é cifrado.
3. A chave: entra pela interface uma vez (`PUT /credenciais/:provedor`), é usada só na construção do cliente do SDK, nunca é logada, nunca volta em nenhum `GET`, e as chamadas vão direto do backend ao endpoint oficial do provedor.
