# 04 — Contrato da API local

API REST em `http://127.0.0.1:8317/api`, JSON, validada com Zod nos dois lados (schemas em `shared/`). Erros seguem o formato `{ erro: { codigo, mensagem, detalhes? } }` com status HTTP adequado. Como o app é single-user local, não há autenticação — a superfície de segurança é o bind em `127.0.0.1`.

## Recursos

### Saúde e configurações

| Método e rota | Descrição |
|---|---|
| `GET /saude` | `{ ok, versao, caminho_banco }` — também usada pelo launcher para detectar instância já aberta |
| `GET /configuracoes` | Todas as configurações + status das chaves por provedor (`configurada: true/false` — **nunca** o valor da chave) |
| `PUT /configuracoes` | Atualiza chaves-valor (bloco de tradução, vizinhas de revisão, provedor/modelo padrão globais…) |
| `PUT /credenciais/:provedor` | Grava a chave de API no keyring/fallback. A chave só trafega nesta chamada, de localhost para localhost |
| `DELETE /credenciais/:provedor` | Remove a chave |
| `POST /credenciais/:provedor/testar` | Faz uma chamada mínima ao provedor para validar a chave; retorna ok/erro e modelos disponíveis |

### Obras

| Método e rota | Descrição |
|---|---|
| `GET /obras` | Lista com contadores (capítulos por status, termos, casos pendentes) |
| `POST /obras` | `{ titulo, titulo_original?, prompt_inicial?: { versao, conteudo }, glossario_inicial?: [...] }` — cobre o fluxo "Nova obra" da tela 4.1 numa chamada |
| `GET /obras/:id` · `PUT /obras/:id` · `DELETE /obras/:id` | Delete retorna antes a contagem do que cai em cascata quando chamado com `?simular=1` |
| `GET /obras/:id/exportar?formato=json` | Download do export completo (`dao-tale-export-v1`) |

### Prompt mãe (versionamento)

| Método e rota | Descrição |
|---|---|
| `GET /obras/:id/prompts` | Histórico completo (versão, notas, data, ativo) |
| `POST /obras/:id/prompts` | Cria nova versão `{ versao, conteudo, notas_versao?, ativar: bool }` — versões são imutáveis |
| `POST /prompts/:id/ativar` | Transação: desativa o atual, ativa este (também é o "reverter" da tela 4.6) |

### Capítulos e tradução

| Método e rota | Descrição |
|---|---|
| `GET /obras/:id/capitulos` | Lista com status e progresso (`frases_total`, `frases_traduzidas`, `frases_erro`) |
| `POST /obras/:id/capitulos` | `{ numero, titulo?, texto_origem }` → segmenta imediatamente e devolve o capítulo com as frases em `pendente`. Segmentação é local e síncrona (rápida) |
| `GET /capitulos/:id` | Capítulo + frases ordenadas (com `paragrafo`, para o editor agrupar) |
| `PUT /capitulos/:id` | Muda `status`, `titulo`, `titulo_pt`, provedor/modelo do capítulo |
| `DELETE /capitulos/:id` | Com `?simular=1` como em obras |
| `GET /capitulos/:id/baixar` | Download da tradução: `?formato=txt` (padrão), `md` (preserva itálico/negrito) ou `bilingue`; todos com cabeçalho de título |
| `GET /capitulos/:id/consistencia` | Varredura reversa do glossário: `{ ocorrencias, violacoes[], termos_curtos_ignorados }` (termos de 1 caractere são ignorados; termo contido em termo mais longo presente na frase é coberto pelo longo) |
| `POST /capitulos/:id/traduzir` | Inicia (ou **retoma**) o job de tradução em blocos: `{ provedor?, modelo?, sobrescrever_editadas?: bool }`. 409 se já há job ativo no capítulo. Só frases `pendente`/`erro` são traduzidas — retomar é a mesma chamada |
| `POST /capitulos/:id/traduzir/cancelar` | Cancela o job após o bloco corrente; frases restantes ficam `pendente` |
| `GET /capitulos/:id/traducao/eventos` | **SSE** de progresso: eventos `bloco_concluido {frases_prontas, total}`, `frase_erro`, `termos_sugeridos`, `job_concluido`, `job_erro`. A interface cai para polling de `GET /capitulos/:id` se o SSE desconectar |

### Frases

| Método e rota | Descrição |
|---|---|
| `PATCH /frases/:id` | `{ texto_pt }` → grava e marca `editado_manualmente`. Autosave com debounce na interface |
| `POST /frases/:id/reverter-ia` | Restaura `texto_pt_original_ia` |
| `GET /frases/:id/testes` | Histórico do Protocolo de Revisão da frase (casos do banco de testes, mais recente primeiro) |
| `POST /frases/:id/revisar` | **Protocolo de Revisão**: `{ pergunta, provedor?, modelo? }` → resposta estruturada `{ trecho_zh, veredito, justificativa, secao_regra, correcao_proposta }`, já gravada em `banco_testes`; retorna também `caso_teste_id` |
| `POST /frases/mesclar` · `POST /frases/:id/dividir` | Fase 2 — correção manual de segmentação, transacional com renumeração |

### Banco de testes

| Método e rota | Descrição |
|---|---|
| `GET /obras/:id/testes` | Filtros: `status`, `secao_regra`, `veredito`, `de`/`ate` (datas), `capitulo`; paginado |
| `GET /obras/:id/testes/recorrencias` | Agregado por `secao_regra` com contagem de casos não-confirmados — alimenta o alerta "2+ casos da mesma regra" |
| `PATCH /testes/:id` | Atualiza `status` (inclusive marcação manual `regra-nova-necessaria`) |
| `POST /testes/:id/aplicar-correcao` | Um clique: grava `correcao_proposta` em `frases.texto_pt`, status do caso → `corrigido` |
| `GET /obras/:id/testes/exportar?formato=csv` | CSV UTF-8 com BOM |

### Glossário e termos sugeridos

| Método e rota | Descrição |
|---|---|
| `GET /obras/:id/glossario` | Filtro por categoria e busca por termo |
| `POST /obras/:id/glossario` · `PATCH /glossario/:id` · `DELETE /glossario/:id` | CRUD; conflito de `termo_zh` duplicado → 409 com a entrada existente |
| `POST /obras/:id/glossario/importar` | CSV ou pares `zh,pt` colados; retorna relatório (inseridos, duplicados) |
| `GET /obras/:id/glossario/exportar?formato=csv` | |
| `GET /obras/:id/termos-sugeridos?status=pendente` | Fila de sugestões capturadas nas traduções |
| `POST /termos-sugeridos/:id/aceitar` | Insere no glossário (`origem='sugerido-ia'`), permite ajustar termo/categoria no corpo |
| `POST /termos-sugeridos/:id/rejeitar` | |

## Notas de desenho

1. **Tradução é o único fluxo assíncrono.** Todo o resto é request/response simples — segmentação, CRUD e até a revisão (uma única chamada de IA, alguns segundos, a interface mostra spinner no painel).
2. **Idempotência do traduzir:** `POST /traduzir` sobre capítulo parcialmente traduzido só processa `pendente`/`erro` — "iniciar" e "retomar" são a mesma operação, o que simplifica interface e recuperação de falhas.
3. **A chave de API nunca é lida de volta.** `GET /configuracoes` informa apenas se existe chave por provedor; não há endpoint que devolva o valor.
4. **Payloads da IA ficam no servidor.** A interface nunca fala com Anthropic/Google diretamente; montagem de prompt, chaves e parsing ficam no backend (uma única implementação, testável).
