# 01 — Visão e decisões de projeto

Este documento consolida o briefing original com as decisões tomadas na fase de esquematização. O briefing definia os requisitos funcionais como fixos e deixava stack, técnica de segmentação e algumas questões em aberto. Tudo que estava em aberto está decidido aqui (com justificativa) ou listado explicitamente como pendência do usuário na seção final.

## 1. O que o aplicativo é

Programa local para tradução literária chinês → PT-BR de webnovels, com quatro pilares:

1. **Editor bilíngue frase a frase** — chinês (só leitura) ao lado da tradução (editável), gerado por segmentação automática do capítulo colado/enviado.
2. **Tradução por IA com contexto da obra** — todo pedido de tradução leva o prompt mãe ativo e o glossário completo da obra como instrução de sistema.
3. **Protocolo de Revisão estruturado** — qualquer frase pode ser questionada; a resposta da IA vem em formato fixo (trecho chinês → veredito → justificativa → correção) e é gravada automaticamente no banco de testes, eliminando o copiar/colar do fluxo antigo.
4. **Dados da obra como cidadãos de primeira classe** — glossário editável, prompt mãe versionado com notas, banco de testes filtrável e exportável.

## 2. Decisões tomadas (confirmadas com o usuário em 2026-07-10)

| # | Decisão | Escolha | Justificativa |
|---|---|---|---|
| D1 | Sistemas operacionais alvo | **Windows e Linux** | Uso real do usuário. macOS fica fora do escopo de teste/empacotamento (nada impede de funcionar, mas não é garantido). |
| D2 | Formato da aplicação | **Web local: backend + interface no navegador, iniciados por um único comando/atalho** | Iteração de desenvolvimento muito mais rápida que desktop nativo. Continua 100% local (servidor escuta só em `127.0.0.1`). O roadmap já previa empacotamento desktop na Fase 3 se o formato incomodar. |
| D3 | Estratégia de chamadas de tradução | **Por bloco alinhado por frase** (≈15–25 frases numeradas por chamada, resposta estruturada frase a frase) | ~10× menos chamadas que frase a frase (custo, tempo, pontos de falha), coesão narrativa melhor porque o modelo vê o trecho inteiro. O resultado no editor continua sendo linha a linha, como o briefing exige. Detalhes em `05-fluxos-ia.md`. |
| D4 | Chaves de API | **Usuário ainda não tem chave de nenhum provedor** (tem assinatura Pro do Claude e do Gemini, que **não** incluem acesso à API — são cobranças separadas) | Consequência direta: a Fase 1 inclui um **provedor simulado (mock)** que permite desenvolver e testar todo o fluxo de ponta a ponta sem chave. Instruções para obter chaves reais estão em `06-roadmap.md`. |

## 3. Decisões técnicas tomadas nesta esquematização

Estas eram as "decisões em aberto" do briefing, mais as escolhas de stack que ele delegava a quem implementa:

| # | Questão | Decisão | Justificativa |
|---|---|---|---|
| T1 | Linguagem/stack | **TypeScript de ponta a ponta**: Node.js (backend) + React/Vite (interface) + SQLite (`better-sqlite3`) | Uma linguagem só para todo o projeto; SDKs oficiais da Anthropic (`@anthropic-ai/sdk`) e do Google (`@google/genai`) são TypeScript-first; empacotamento desktop futuro (Tauri/Electron) reaproveita 100% do código. Detalhes em `02-arquitetura.md`. |
| T2 | Segmentação de frases chinesas | **Máquina de estados própria sobre pontuação**, sem biblioteca de NLP | O problema é bem delimitado (pontuação forte 。！？… + aspas asiáticas 「」『』 + parágrafos); uma função pura com bateria de testes dá controle total sobre os casos de diálogo aninhado, que é justamente onde bibliotecas genéricas erram. Especificada em `05-fluxos-ia.md §1`. |
| T3 | Parsing do Protocolo de Revisão | **JSON estruturado obrigatório** (tool use na API da Anthropic, `responseSchema` na do Gemini), nunca texto livre com marcadores | Elimina a classe inteira de erros de parsing; ambos os provedores suportam saída estruturada nativamente. O texto bruto da resposta também é guardado para auditoria. |
| T4 | Janela de contexto de tradução/revisão | **Configurável, com padrão definido** (tradução: cauda de 2 frases já traduzidas do bloco anterior; revisão: 3 frases vizinhas de cada lado) | Configurar é barato porque os valores já entram como parâmetros; o padrão evita que o usuário precise pensar nisso. |
| T5 | Formato de exportação | **Dois formatos**: JSON completo versionado por obra (capítulos + frases + glossário + banco de testes + prompts, reimportável) e CSV avulso para glossário e banco de testes (análise externa) | JSON preserva estrutura para backup/restauração fiel; CSV atende o caso de uso "continuar analisando fora do app" do briefing. |
| T6 | Guarda de chaves de API | **Keyring do sistema operacional** (Credential Manager no Windows, Secret Service no Linux) via binding nativo; fallback em arquivo com permissão restrita e aviso claro na interface | Atende o requisito "não em texto plano trivialmente visível" nos dois SOs alvo. Detalhes em `05-fluxos-ia.md §6`. |
| T7 | Sincronização multi-máquina | **Fora de escopo** (confirmando o desenho single-user/single-machine do briefing) | O banco é um arquivo SQLite único em local documentado — quem quiser sincronizar manualmente (copiar o arquivo, Syncthing etc.) consegue, mas o app não gerencia conflitos. |
| T8 | Banco de dados | **SQLite em arquivo único**, modo WAL, migrações versionadas embutidas no app | Requisito literal do briefing ("local, arquivo único"); WAL evita travas entre leitura da interface e escrita do job de tradução. |
| T9 | Idioma da interface | **PT-BR** | Ferramenta pessoal de um tradutor PT-BR. |

## 4. O que o briefing pedia e foi ajustado (com o porquê)

Nenhum requisito funcional foi cortado; três pontos foram refinados:

1. **"Chamada por frase" → chamada por bloco com resposta frase a frase (D3).** O requisito de fundo — editor frase a frase com janela de contexto para coesão — é atendido melhor e mais barato. O modo frase a frase não será implementado.
2. **Modelo de dados ganhou campos e tabelas de apoio** (detalhado em `03-modelo-de-dados.md`): índice de parágrafo em `frases` (sem ele é impossível reconstruir o texto com as quebras originais para exportação), status de tradução por frase (permite retomar um lote interrompido), registro do provedor/modelo/versão de prompt usados em cada capítulo (rastreabilidade para o caso de uso de comparar modelos), campo `secao_regra` estruturado em `banco_testes` (o filtro "por seção/regra do prompt" da tela 4.4 não funciona sobre texto livre), e tabela de termos sugeridos pendentes (a sugestão de glossário da tela 4.5 precisa viver em algum lugar antes de ser aceita/rejeitada).
3. **Mesclar/dividir frases no editor** entra como funcionalidade planejada (Fase 2): nenhuma segmentação automática acerta 100%, e sem essa ferramenta o usuário fica preso ao erro do segmentador.

## 5. Pendências que ainda dependem do usuário

Nada aqui bloqueia o início da Fase 1 — todas têm um padrão proposto que será usado até segunda ordem:

| Pendência | Padrão proposto |
|---|---|
| Obter chave de API da Anthropic (console.anthropic.com) e/ou do Gemini (aistudio.google.com — tem camada gratuita) | Fase 1 roda com o provedor simulado até a chave existir |
| Categorias do glossário: a lista do briefing (local / poder-habilidade / entidade / título-cargo / personagem / outro) é fixa ou deve ser editável? | Fixa por enquanto (é um enum barato de expandir depois) |
| Nome de exibição do app | "Dao Tale" |
| Porta local do servidor | 8317 (só `127.0.0.1`), configurável por variável de ambiente |
| Modelo padrão sugerido ao configurar o provedor Claude | O mais recente da família Sonnet no momento da implementação (bom custo/qualidade para volume de tradução); trocável por obra |
