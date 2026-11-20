# Dao Tale — guia para sessões do Claude Code

App **local** de tradução literária de webnovels para PT-BR, do **mandarim** ou do
**inglês**, com **tutor de idioma** embutido no editor. Uso pessoal de um usuário só.
A direção do produto é "o Dao Tale completo **e** um tutor" — o tutor soma, nunca
substitui nem enxuga o app.

## Idioma e estilo do código

- Tudo em português: identificadores, comentários, mensagens de erro, commits, docs.
- Comentário explica o **porquê** (a decisão, o incidente que a motivou), não o quê.
- Campos `_zh` (`texto_zh`, `termo_zh`…) significam "texto de origem" — o sufixo é
  histórico e vale também para obras em inglês (doc 28 §6). Não renomeie.
- Prettier: os `src` antigos não estão formatados. Formate só arquivos **novos**;
  em arquivo existente, siga o estilo do entorno e não reformate o arquivo inteiro.

## Mapa

| Pasta | O que é |
|---|---|
| `shared/src` | tipos e regras puras usadas pelos dois lados (`index.ts`, `idiomaOrigem.ts`, `tutor.ts`) |
| `server/src` | Hono + better-sqlite3; roda direto do TypeScript via `tsx` (sem build) |
| `server/src/db/migrations` | SQL numerado; aplicado no boot, com snapshot do banco antes |
| `server/src/ia` | provedores (`claudeCode`, `claude`, `gemini`, `compat`, `mock`), contratos JSON, prompts |
| `server/src/rotas` | API (`/api/...`); testes de rota ao lado (`*.test.ts`) |
| `web/src` | React + Vite + react-query + Tailwind; precisa de `npm run build` para a instância real |
| `docs/` | especificação numerada; decisões novas viram um doc novo numerado |
| `scripts/` | `start.mjs` (lançador), `criar-atalho.mjs`, `subir.mjs` (deploy da VPS, desligada) |

Docs que mais respondem perguntas: 02 arquitetura · 03 modelo de dados · 04 API ·
05 fluxos de IA · 08 prompt universal · 15 camadas do prompt · 28 perfis de idioma ·
29 modo tutor.

## Comandos

```bash
npm run dev                                  # servidor + Vite com reload
npm run check                                # lint + format + typecheck + testes + build — rode antes de commit
npm -w server exec vitest run src/rotas/tutor.test.ts   # um arquivo de teste
npm run atalho                               # (re)cria o atalho do menu/barra de tarefas (Linux)
```

## A instância real — não experimente nela

- Banco: `~/.local/share/dao-tale/dao-tale.db`, porta **8317**. Normalmente já está
  no ar, aberta pelo atalho (janela Chromium própria). Log: `dao-tale.log` na mesma pasta.
- O usuário pode estar editando **agora**. Leia o estado atual antes de escrever.
- Para testar: copie o banco para o scratchpad e suba outra instância
  (`DAO_TALE_DIR=<pasta da cópia> DAO_TALE_PORTA=8399 npx -w server tsx src/index.ts`,
  rodado da raiz — com `-w server` o caminho é relativo a `server/`).
- Antes de alterar o banco real à mão: backup `dao-tale.db.antes-<assunto>-<data>`.
- Mudança em `web/` só aparece na instância real depois de build (o atalho recompila
  sozinho ao abrir); mudança em `server/` exige reiniciar o servidor.
- Screenshot da interface: Chromium é flatpak (`~/.local/bin/chromium`) e não escreve
  em `/tmp` (sandbox) — salve capturas em `~/.cache/claude-capturas`.

## Motor de IA

- Provedor principal: **`claude-code`** — `claude -p` com a conta da pasta
  `~/.claude-conta2`, sem chave de API. É uma conta separada da desta sessão; não
  misture as duas.
- O motor roda **sem ferramentas, sem skills, sem MCP e sem internet**
  (`argumentosClaudeCode`). Skills e este arquivo não chegam nele: o que a tradução
  precisa saber tem de ir no prompt ou nos dados do app.
- Modelo por função (comparação de 20/11/2026): tradução, revisão e detalhes = Opus;
  QA e tutor = Sonnet. Haiku não — erra de fato, e no tutor o usuário (nível zero em
  mandarim) não teria como perceber.

## O que é do usuário

- Frase com `editado_manualmente = 1` ou `origem_edicao = 'tutor'` foi escrita por ele:
  proponha, não sobrescreva.
- O glossário da obra é lei acima das camadas do prompt (skill `camadas-do-prompt`).
- Termo "oficial" (tradução de editora, localização de jogo) só com **fonte citada** —
  nunca de memória. Um termo inventado com segurança é pior que nenhum.

## Regras de trabalho

- Commit e push **só quando o usuário pedir**. Mensagem em português, imperativo
  ("Adiciona…", "Corrige…"), corpo explicando o porquê.
- A frase-senha nunca passa por você: o usuário a redefine com `npm run senha`.
- A VPS está desligada (uso só pessoal desde 18/11/2026); não mexa em outros serviços nela.
- Skills do projeto: `revisar-capitulo` (auditar um capítulo traduzido) e
  `camadas-do-prompt` (onde mora cada regra do prompt).
