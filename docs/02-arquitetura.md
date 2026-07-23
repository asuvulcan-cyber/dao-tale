# 02 — Arquitetura e stack

## 1. Visão geral

```
┌─────────────────────────────────────────────────────────────┐
│ Máquina do usuário (Windows ou Linux)                       │
│                                                             │
│  navegador ──HTTP/SSE──▶ servidor local (Node.js)           │
│  (React/Vite,            127.0.0.1:8317                     │
│   servido pelo             │            │                   │
│   próprio servidor)        │            │                   │
│                            ▼            ▼                   │
│                     SQLite (arquivo   keyring do SO         │
│                     único, WAL)       (chaves de API)       │
│                            │                                │
└────────────────────────────┼────────────────────────────────┘
                             │ únicas saídas de rede:
                             ▼
              APIs oficiais dos provedores de IA
              (Anthropic, Google — chave do usuário)
```

- O servidor escuta **somente em `127.0.0.1`** — nada é exposto à rede local ou à internet.
- A interface é servida pelo próprio servidor (bundle estático em produção; em desenvolvimento, Vite com proxy).
- O app funciona offline exceto no instante das chamadas de IA (requisito local-first).

## 2. Stack escolhida

| Camada | Escolha | Observações |
|---|---|---|
| Runtime | Node.js ≥ 22 LTS | |
| Linguagem | TypeScript (strict) em todo o repositório | |
| Servidor HTTP | **Hono** | Minimalista, tipagem boa, serve estáticos e SSE sem fricção |
| Banco | **SQLite via `better-sqlite3`** | Síncrono (adequado a app single-user), arquivo único, modo WAL |
| Migrações | SQL puro versionado (`server/src/db/migrations/NNN_*.sql`), aplicadas no boot | Sem ORM: o esquema é pequeno e SQL explícito facilita auditar |
| Interface | **React 18 + Vite + Tailwind CSS** | |
| Estado/HTTP na interface | TanStack Query (cache e revalidação) + fetch nativo | |
| Validação de payloads | **Zod** nos dois lados, com tipos compartilhados em `shared/` | O contrato da API é uma fonte única de verdade em TypeScript |
| SDK Anthropic | `@anthropic-ai/sdk` | Tool use para saída estruturada; prompt caching para o prompt mãe + glossário |
| SDK Google | `@google/genai` | `responseSchema` para saída estruturada |
| Chaves de API | `@napi-rs/keyring` (Credential Manager / Secret Service) com fallback em arquivo `0600` | Detalhes em `05-fluxos-ia.md §6` |
| Testes | Vitest (unidade: segmentador, parsers, montagem de prompt; integração: API contra SQLite em memória) | O segmentador tem a maior bateria de testes do projeto |

**Por que não Python:** funcionaria igualmente bem, mas TypeScript único elimina a fronteira backend/frontend, os SDKs de IA são TS-first, e o empacotamento desktop da Fase 3 (Tauri/Electron) consome o mesmo código sem ponte entre linguagens. Empacotar Python para Windows (PyInstaller) é historicamente mais frágil.

**Por que não desktop nativo já na Fase 1:** decisão D2 — iteração mais rápida; o formato web local já se comporta como "abrir um programa" via atalho (§5).

## 3. Estrutura do repositório

Monorepo com npm workspaces:

```
dao-tale/
├── package.json               # workspaces: server, web, shared
├── docs/                      # esta documentação
├── shared/                    # tipos e schemas Zod do contrato da API
│   └── src/
│       ├── api/               # request/response de cada endpoint
│       └── dominio.ts         # Obra, Capitulo, Frase, EntradaGlossario, CasoTeste…
├── server/
│   └── src/
│       ├── index.ts           # boot: migra o banco, sobe o Hono, abre o navegador
│       ├── rotas/             # um arquivo por recurso (obras, capitulos, frases…)
│       ├── db/
│       │   ├── migrations/    # 001_inicial.sql, 002_…
│       │   └── repositorios/  # acesso a dados por tabela
│       ├── segmentacao/       # máquina de estados + testes
│       ├── ia/
│       │   ├── provedor.ts    # interface comum ProvedorIA
│       │   ├── claude.ts
│       │   ├── gemini.ts      # Fase 2
│       │   ├── mock.ts        # provedor simulado (dev/testes/sem chave)
│       │   └── prompts.ts     # montagem de instrução de sistema, protocolo de revisão
│       ├── traducao/          # orquestração de jobs de tradução em blocos
│       └── credenciais/       # keyring + fallback arquivo
└── web/
    └── src/
        ├── paginas/           # ListaObras, Obra, EditorCapitulo, Glossario,
        │                      # PromptMae, BancoTestes, Configuracoes
        ├── componentes/
        └── api/               # cliente tipado gerado a partir de shared/
```

## 4. Onde ficam os dados do usuário

Diretório de dados fora do repositório do código, seguindo a convenção de cada SO:

- Linux: `~/.local/share/dao-tale/` (respeitando `XDG_DATA_HOME`)
- Windows: `%APPDATA%\dao-tale\`

Conteúdo: `dao-tale.db` (+ arquivos WAL), `credenciais.json` (somente no modo fallback, permissão `0600`), `exports/` (padrão de destino das exportações). O caminho aparece na tela de Configurações para o usuário saber o que copiar num backup manual.

## 5. Como o app inicia ("abrir um programa")

- **Desenvolvimento:** `npm run dev` (servidor com reload + Vite).
- **Uso diário (Fases 1–2):** `npm run start` — builda se necessário, sobe o servidor e abre `http://127.0.0.1:8317` no navegador padrão (`start` no Windows, `xdg-open` no Linux). Um atalho de área de trabalho / `.desktop` apontando para esse comando dá a experiência de "abrir um programa". Se a porta já estiver em uso por outra instância, o comando apenas abre o navegador na instância existente (detectado via endpoint `/api/saude`).
- **Fase 3 (se o formato incomodar):** empacotamento com Tauri usando o servidor Node como sidecar, ou Electron. Nenhuma decisão necessária agora; o código não muda.

## 6. Modelo de execução do backend

- Processo único, single-user. `better-sqlite3` é síncrono; chamadas de IA são assíncronas.
- **Jobs de tradução** rodam dentro do mesmo processo, bloco a bloco (sequencial dentro do capítulo — ver `05-fluxos-ia.md §2`). Na fase de **cruzeiro** (doc 09), um lote traduz até `lote_paralelo` capítulos ao mesmo tempo (padrão 2), cada um ainda com seus blocos sequenciais; na calibração é um capítulo por vez (decisão D3 da auditoria, resolvida no doc 09 §5). O estado durável do job é o campo `status_traducao` de cada frase no banco, e o do lote as tabelas `lotes`/`lote_capitulos`: se o processo morrer no meio, "Retomar tradução"/"Retomar lote" continua de onde parou sem retraduzir o que já foi feito.
- **Progresso** é entregue à interface por SSE (`GET /api/capitulos/:id/traducao/eventos`); a interface também funciona por polling se a conexão SSE cair.
- Nenhuma fila externa, nenhum worker separado — complexidade desnecessária para single-user.
