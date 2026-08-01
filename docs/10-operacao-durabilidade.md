# 10 — Operação e durabilidade

Passo 4 do plano da Nave Mãe. **Objetivo único: não perder trabalho já pago em cota.**
Não há métrica de tempo humano aqui (premissa `feedback-lote-financeiro`) — o valor é
proteger o banco da obra real (十日终焉, em `~/.local/share/dao-tale`) contra queda,
corrupção, cópia ingênua, segunda instância e um site malicioso aberto no navegador.

Resolve **C3** e **A2** da auditoria (`docs/auditoria-2026-07.md`), fecha a pendência de
`estado-uso-real`, e — de brinde, mesmo tema — corrige **A3** (substituição em lote que
corrompe tradução revisada).

> ⚠️ Regra de trabalho deste passo: **nunca** rodar teste/e2e destrutivo contra
> `~/.local/share/dao-tale`. Toda verificação usa `DAO_TALE_DIR` apontando para pasta
> descartável. A instância real só é **lida** (para o round-trip do item 4), e só depois
> de um backup explícito do diretório inteiro.

---

## 1. Backup automático + integridade (C3)

Novo módulo `server/src/db/backup.ts` — funções puras `(db, dir) → …`, sem estado global,
testáveis com um arquivo temporário. Snapshots vão para `<dados>/backups/`, nomeados
`dao-tale-<ISO>-<motivo>.db` (o ISO ordena cronologicamente).

| Função | O quê | Como |
|---|---|---|
| `fazerBackup(db, motivo)` | snapshot online, assíncrono | `db.backup(destino)` — API online-safe do better-sqlite3, já inclui o conteúdo do WAL num arquivo `.db` autossuficiente |
| `fazerBackupSincrono(db, motivo)` | snapshot síncrono | `db.serialize()` + `fs.writeFileSync` — usado **antes de migrar** (contexto síncrono do boot) |
| `rotacionar(dir, manterN)` | retenção | mantém os N mais novos (padrão 10, `DAO_TALE_BACKUPS_MANTER`), apaga os demais |
| `checkpointWal(db)` | dobra o WAL no `.db` | `db.pragma('wal_checkpoint(TRUNCATE)')` — depois disso copiar só o `.db` é seguro |
| `verificarIntegridade(db)` | sanidade | `db.pragma('integrity_check')` → `'ok'` ou lista de danos |
| `restaurarDe(backup, destino)` | **o outro lado obrigatório** | `integrity_check` no backup → renomeia o `.db` atual p/ `.pre-restauracao` → copia o backup por cima → remove `-wal`/`-shm` órfãos → reabre e reverifica |

**Quando o backup roda:**

- **No boot**, antes de servir: `fazerBackup(db, 'boot')` + `rotacionar` + `integrity_check`
  (log ruidoso se não for `ok`).
- **Antes de migrar** (dentro de `abrirBanco`, só quando há migração pendente **e** o banco
  é um arquivo): `fazerBackupSincrono(db, 'pre-migracao')`. Captura o estado exato de antes
  da migração — proteção contra migração ruim, que um backup pós-migração não dá.
- **Antes de operação de risco**: iniciar um lote (`iniciarLote`, antes de `arrancar`) e
  importar obra (`POST /obras/importar`) → `fazerBackup(db, 'pre-lote' | 'pre-import')`.

**Restauração testada (backup que não restaura é teatro):** `restaurarDe` tem teste
dedicado — cria banco, insere dados, faz backup, apaga/corrompe dados, restaura, e
**afirma que os dados originais voltaram e `integrity_check = ok`**. Exposto ao usuário
como `npm run restaurar` (`scripts/restaurar.mjs`: lista backups, recusa rodar se o app
estiver no ar em `/api/saude`, confirma antes de sobrescrever).

**Shutdown limpo:** handler de `SIGINT`/`SIGTERM` em `index.ts` → `checkpointWal(db)` +
`db.close()` + remove o lockfile + `process.exit(0)`. Como o `better-sqlite3` é síncrono,
todo write commitado já está durável no WAL; o checkpoint só folda o WAL para o `.db` ficar
completo por si. Jobs/lotes em voo são abandonados sem dó — o estado por frase é durável,
"Retomar" reconstrói (log: "N capítulos em voo — retomáveis").

### Teste-seguro
`abrirBanco(':memory:')` (usado em todos os testes) **não** dispara backup de arquivo: o
hook `antesDeMigrar` só é ligado pelo acessor de produção `banco()`, e ele checa que o
banco é arquivo antes de serializar. Os 109 testes seguem intocados.

---

## 2. Instância única canônica + indicador na UI

**Lockfile** `<dados>/dao-tale.lock` = `{ pid, porta, iniciado_em }`, **por diretório de
dados**. No boot, antes de abrir o `.db`:

- Lock existe e o dono está **vivo** (`process.kill(pid, 0)` ou `/api/saude` responde) →
  **recusa subir** com mensagem clara (`Já há uma instância nesta pasta: PID X, porta Y`).
  Evita dois processos no mesmo `.db` — os runtimes de job/lote são em memória, dois
  servidores gastariam cota em dobro e sujariam o estado.
- Lock **stale** (pid morto) → sobrescreve e segue (log: "lock órfão removido").
- Escreve o próprio lock; remove no shutdown limpo e em `process.on('exit')`.

Como o lock é **por pasta**, rodar a obra real (`~/.local/share/dao-tale`, 8317) e uma
instância descartável (`DAO_TALE_DIR=/tmp/…`, outra porta) ao mesmo tempo continua
permitido — são `.db` diferentes. O que fica bloqueado é a mesma pasta duas vezes, que é
o caso de corrupção. `EADDRINUSE` (porta ocupada por terceiro) ganha mensagem amigável (B7).

**Indicador na UI (o usuário já se perguntou "estou na instância certa?"):**
`/api/saude` passa a devolver `{ porta, caminho_dados, canonico, backups: {ultimo, total} }`,
onde `canonico = (caminho_dados é o XDG padrão && porta === 8317)`.

- **Configurações → Dados**: mostra porta + caminho + último backup + total, e um botão
  **"Fazer backup agora"** (`POST /api/sistema/backup`).
- **Cabeçalho (`App.tsx`)**: quando `canonico === false`, uma tarja visível
  **"instância de teste — `<pasta>`"**. Some na instância real. Resolve a confusão de
  8317 × 8399 × 8412 de uma olhada.

---

## 3. Proteção da API local contra CSRF/DNS-rebinding (A2)

Middleware `app.use('/api/*', …)` em `criarApp`, antes das rotas. Regra (baseada em
**hostname loopback**, não em porta — assim os testes com `Host: localhost` seguem verdes):

1. **Toda** rota `/api`: o hostname do header `Host` precisa ser loopback
   (`127.0.0.1` / `localhost` / `[::1]`). Derruba DNS-rebinding (o atacante põe o domínio
   dele no `Host`) — inclusive para leitura.
2. **Métodos mutantes** (`POST/PUT/DELETE/PATCH`): se houver header `Origin`, o hostname
   dele também precisa ser loopback. Um site qualquer (`https://site-malicioso`) tem
   `Origin` público → **403**. O app servido por si mesmo (produção) manda
   `Origin: http://127.0.0.1:8317`; o proxy do Vite em dev manda `http://localhost:5173`
   (loopback) → ambos passam. Requisição sem `Origin` (curl, script local) passa — não é a
   ameaça (o alvo é a aba do navegador).

~20 linhas, resposta `403 {erro:{codigo:'origem-bloqueada'}}`. Testes novos: `POST` com
`Origin` público → 403; `Origin` loopback → 200; `GET`/`POST` com `Host` não-loopback →
403; fluxo existente (sem `Origin`, `Host: localhost`) → intacto.

> **Atualização (Passo 7, doc 13 §1):** o módulo virou `rotas/protecaoOrigem.ts` e ganhou
> um segundo modo. A regra descrita acima continua valendo palavra por palavra no **modo
> local** (o padrão); em **modo hospedado** o loopback dá lugar à allowlist do domínio, o
> `Origin` passa a ser obrigatório nos métodos mutantes, e quem autentica de verdade é a
> sessão. Os testes desta seção seguem verdes, sem alteração.

---

## 4. Export/import redondo com o schema novo

Auditoria de `server/src/db/portabilidade.ts` × schema pós-Passos 2/3:

| Campo novo | No export? | Veredito |
|---|---|---|
| `prompts.tipo` (delta/completo) | sim (default `completo`) | ✅ correto |
| `prompts.nucleo_id` | não | ✅ id interno de outro banco; delta recompõe com o núcleo local |
| `capitulos.nucleo_id` | não | ✅ id interno |
| `capitulos.consistencia_violacoes` | não | ✅ cache derivado, recomputável |
| `obras.fase_traducao` (calibração/cruzeiro) | **não** | ⚠️ decisão real do usuário — **passa a exportar** (aditivo, default `calibracao`) |
| `lotes` / `lote_capitulos` | não | ✅ estado operacional efêmero (não sobrevive ao processo) — exportar referenciaria schema morto |
| `qa_apontamentos` (mig. 009) | não | a decidir no round-trip — regenerável, análogo a `banco_testes` |
| status `parcial` (mig. 007) | sim (`STATUS_CAPITULO`) | ✅ já no enum |

Ação: **adicionar `fase_traducao`** ao schema de export (com default, sem subir
`versao_schema` — é aditivo e retrocompatível). Endurecer **B4** (dois prompts `ativo:true`
→ 400 amigável em vez de 500) se sair barato. Teste sintético export→import→export estável
cobrindo prompt-delta, `parcial` e `fase_traducao`.

**Round-trip com o export real de 十日终焉 (não destrutivo):** backup explícito do diretório
real primeiro; depois `cp` do `.db` (+ `-wal`/`-shm`) para uma pasta descartável; export via
API → import numa segunda pasta descartável → re-export → `diff` (ignorando `exportado_em`).
A pasta real nunca é aberta para escrita.

---

## 5. Pendências stale de `estado-uso-real` (verificadas, não assumidas)

- **(a) "capítulo fica 'Traduzindo' para sempre" → RESOLVIDO.** Confirmado no código:
  `job.ts` finaliza no `finally` para `traduzido`/`parcial`/`rascunho` (linhas 367-377),
  tem `catch` (C2), a migração 007 adiciona `parcial` e cura linhas presas, e
  `reposLotes.marcarInterrompidosNoBoot` cuida do lote. **Nenhuma ação de código** — só
  registrar a verificação.
- **(b) `modelo_padrao` global = `gemini-omni-flash-preview`.** É **dado** na instância
  real, não código. Vou **ler** (na cópia descartável) o valor atual e **reportar**; se
  ainda estiver acidental, o conserto é uma linha em Configurações que **o usuário** aplica
  — não mexo no dado real dele por conta própria.

---

## 6. Extra do mesmo tema — A3 (proteger tradução revisada de corrupção em lote)

`reposFrases.substituirTermo` (correção rápida do EditorCapitulo) troca **substring** crua
via `replace()` do SQL — "Rio" dentro de "Riordan". Traz a troca para o JS com
`trocaPorPalavra` (fronteira Unicode, mesmo desenho de `substituirTermoGlossario`, que já
existe e faz certo) e a prévia (`contarTermo`) passa a contar **ocorrências reais** por
palavra, não frases. Teste: "Rio→Rios" não toca "Riordan"; prévia bate com o aplicado.

---

## 7. Ordem de implementação (incremental, 109 verdes o tempo todo; 1 Passo = 1 commit)

1. `db/backup.ts` + testes (backup, rotação, integridade, **restauração round-trip**).
2. Hook `antesDeMigrar` em `abrirBanco`; boot em `index.ts` (backup boot + integridade +
   lock + shutdown limpo); `scripts/restaurar.mjs`.
3. Backup antes de lote/import.
4. Middleware Origin/Host + testes.
5. `/api/saude` enriquecido + `POST /api/sistema/backup` + Configurações + tarja no cabeçalho.
6. `fase_traducao` no export + B4 + teste de round-trip sintético.
7. A3 (substituição por palavra) + teste.
8. e2e num servidor real com dados descartáveis; round-trip do export real; ler `modelo_padrao`.
9. Commit único + atualizar memória (`plano-nave-mae`, novo `estado-operacao-durabilidade`).
</content>
</invoke>
