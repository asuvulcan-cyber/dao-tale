# Aprender com as Edições Manuais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar o laço entre o que o app já detecta e o que o revisor conserta à mão — um passe de correção assistido sobre as violações de estilo, e a leitura roteada das edições manuais que o scanner não vê.

**Architecture:** Servidor Hono + SQLite (better-sqlite3) com migrações versionadas; front React + TanStack Query. A Parte A acrescenta uma tarefa de IA (papel `estilo`) que devolve o mesmo *par cirúrgico* que a revisão já usa, aplicado por `aplicarCorrecao`. A Parte B não gasta IA: classifica cada edição manual por máquinas que já existem (`contemTermoFlexionado`, `temasNoTexto`) e só o resíduo entra na chamada de refinamento que já acontece.

**Tech Stack:** TypeScript, Node 22, better-sqlite3, Hono, Zod, Vitest, React 19, TanStack Query, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-09-aprender-com-edicoes-manuais-design.md`

## Global Constraints

- **Monorepo npm workspaces:** `shared`, `server`, `web`. Import entre pacotes por `@dao-tale/shared`. Imports relativos dentro de um pacote **sempre com extensão `.js`** (ESM + tsx), mesmo apontando para `.ts`.
- **Testes:** `npm -w server run test` e `npm -w web run test` (Vitest). Tipos: `npm run typecheck`. Build: `npm run build`.
- **Banco em teste:** `abrirBanco(':memory:')` de `server/src/db/index.js` aplica todas as migrações. Nenhum teste toca banco em disco.
- **Migrações são imutáveis.** Nunca editar um `.sql` já numerado; criar o próximo número.
- **SQLite não altera `CHECK` nem `NOT NULL`** — exige reconstrução da tabela no padrão de `server/src/db/migrations/007_fase_e_status_parcial.sql`. `ALTER TABLE ADD COLUMN` funciona normalmente.
- **Duplicar `beforeEach` e helpers entre arquivos de teste é a convenção deste repositório** (ver `recorrencias.test.ts`, `rotulosRegra.test.ts`, `recusa.test.ts`). Não extraia helper compartilhado.
- **Idioma:** todo comentário, mensagem de erro e texto de UI em português do Brasil. Comentário explica **por quê**, não o quê.
- **Design por tokens:** nada de cor, espaçamento ou tamanho cru. O projeto usa `bg-papel-fundo`, `text-tinta-2`, `border-linha`, `text-jade-forte` e afins (`docs/tokens-css.md`).
- **Nunca `git add -A` nem `git add .`** — o working tree tem arquivos do usuário fora deste trabalho. Só caminhos explícitos.
- **Commits:** um por tarefa, mensagem em português, corpo explicando o porquê.

## Ordem e dependências

```
Task 1  (independente — dívida parkeada)
Task 2  →  Task 5
        →  Task 6
Task 3  →  Task 6  →  Task 7
Task 4  →  Task 5
Tasks 5 e 7  →  Task 8
```

---

### Task 1: A dívida parkeada — `montarTurnos` sem teste de encanamento

Fecha um achado registrado na revisão final do trabalho anterior. A mutação `justificativa: ''` em `montarTurnos` passava pela suíte inteira: nada verificava que a `justificativa` do banco chega ao turno enviado ao modelo.

**Files:**
- Modify: `server/src/rotas/fioRevisao.test.ts`

**Interfaces:**
- Consumes: `montarTurnos(fio: CasoTeste[]): TurnoRevisao[]` de `server/src/rotas/frases.js`; `reposTestes.fio`, `reposTestes.criar`.
- Produces: nada.

- [ ] **Step 1: Write the failing test**

Acrescente ao `describe('turnos enviados ao modelo')` que já existe em `server/src/rotas/fioRevisao.test.ts`:

```ts
  it('leva a justificativa do banco até o turno', () => {
    // Encanamento CasoTeste.justificativa -> TurnoRevisao.justificativa. A mutação
    // `justificativa: ''` em montarTurnos passava pela suíte inteira: os testes de
    // prompts.test.ts constroem o turno à mão e os daqui usavam justificativa vazia.
    const c = reposTestes.criar(db, {
      frase_id: fraseId,
      obra_id: obraId,
      caso_pai_id: null,
      trecho_zh: '甲',
      pergunta: 'p',
      veredito: 'incorreto',
      resposta: 'trata do seu motivo',
      justificativa: 'Conforme a regra 5-mais-que-perfeito.',
      secao_regra: '5-mais-que-perfeito',
      correcao_proposta: null,
      trecho_pt_errado: null,
      trecho_pt_corrigido: null,
      motivo_rejeicao: null,
      provedor: 'mock',
      modelo: 'mock-v1',
      resposta_bruta: '{}',
    });
    const turnos = montarTurnos(reposTestes.fio(db, c.id));
    expect(turnos[0].justificativa).toBe('Conforme a regra 5-mais-que-perfeito.');
    expect(turnos[0].resposta).toBe('trata do seu motivo');
  });
```

Se o helper `caso(...)` do arquivo já aceitar `justificativa`, use-o em vez de repetir o objeto inteiro — leia o arquivo antes.

- [ ] **Step 2: Run test to verify it passes, then prove it is not blind**

Run: `npm -w server run test -- fioRevisao`
Expected: PASS (o código já está correto).

Agora prove que o teste tem valor: em `server/src/rotas/frases.ts`, na função `montarTurnos`, troque `justificativa: c.justificativa,` por `justificativa: '',`. Rode de novo.
Expected: FAIL com `expected '' to be 'Conforme a regra 5-mais-que-perfeito.'`.

Reverta com `git checkout -- server/src/rotas/frases.ts` e confirme `git diff` vazio nesse arquivo.

- [ ] **Step 3: Commit**

```bash
git add server/src/rotas/fioRevisao.test.ts
git commit -m "Trava o encanamento da justificativa até o turno do fio

A mutação \`justificativa: ''\` em montarTurnos passava pela suíte inteira: os
testes de prompts.test.ts constroem o turno à mão e os de fioRevisao usavam
justificativa vazia nas fixtures. Achado parkeado na revisão final anterior."
```

---

### Task 2: Migração 023 — papel `estilo` e `origem_edicao`

**Files:**
- Create: `server/src/db/migrations/023_passe_estilo.sql`
- Modify: `server/src/db/repos.ts` (`reposFrases.editarTexto`, `reposTestes.aplicarCorrecao`, `reposQa.aplicarSugestao`)
- Modify: `shared/src/index.ts` (tipo `Frase`, tipo `PapelIa` se existir)
- Test: `server/src/db/migracao023.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `eventos_ia.papel` aceita `'estilo'`.
  - `frases.origem_edicao TEXT` — `NULL` (manual), `'revisao'`, `'passe-estilo'`, `'qa'`.
  - `reposFrases.editarTexto(db, id, textoPt, origem: string | null = null): Frase | undefined`
  - `Frase` ganha `origem_edicao: string | null`.

- [ ] **Step 1: Write the failing test**

Create `server/src/db/migracao023.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { abrirBanco, type BancoDados } from './index.js';
import { reposCapitulos, reposFrases, reposObras } from './repos.js';

let db: BancoDados;
let fraseId: number;

beforeEach(() => {
  db = abrirBanco(':memory:');
  const obraId = reposObras.criar(db, { titulo: 'Obra' }).id;
  const cap = reposCapitulos.criar(db, obraId, { numero: 1, texto_origem: '甲说。' }, [
    { texto_zh: '甲说。', paragrafo: 0 },
  ]);
  fraseId = reposFrases.listarPorCapitulo(db, cap.id)[0].id;
});

describe('migração 023', () => {
  it('aceita o papel estilo em eventos_ia', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO eventos_ia (data, papel, provedor, modelo) VALUES ('2026-08-09','estilo','mock','m')`,
        )
        .run(),
    ).not.toThrow();
  });

  it('continua recusando papel fora do enum', () => {
    // O rebuild não pode ter afrouxado o CHECK para "qualquer texto".
    expect(() =>
      db
        .prepare(
          `INSERT INTO eventos_ia (data, papel, provedor, modelo) VALUES ('2026-08-09','inventado','mock','m')`,
        )
        .run(),
    ).toThrowError(/CHECK/);
  });

  it('frases ganham origem_edicao, nula por padrão', () => {
    const colunas = (db.pragma('table_info(frases)') as { name: string }[]).map((c) => c.name);
    expect(colunas).toContain('origem_edicao');
    expect(reposFrases.obter(db, fraseId)!.origem_edicao).toBeNull();
  });

  it('editarTexto sem origem deixa NULL — é edição manual', () => {
    reposFrases.editarTexto(db, fraseId, 'texto novo');
    const f = reposFrases.obter(db, fraseId)!;
    expect(f.editado_manualmente).toBe(true);
    expect(f.origem_edicao).toBeNull();
  });

  it('editarTexto com origem grava a origem', () => {
    reposFrases.editarTexto(db, fraseId, 'texto novo', 'passe-estilo');
    expect(reposFrases.obter(db, fraseId)!.origem_edicao).toBe('passe-estilo');
  });

  it('aplicar correção da revisão grava origem revisao', () => {
    // É o que tira a frase da mineração de edições manuais: aceitar uma proposta
    // da revisão é decisão registrada em outro canal, e recontá-la como "o que
    // você mudou à mão" ensinaria a mesma lição duas vezes.
    reposFrases.editarTexto(db, fraseId, 'concluindo que ele errara.');
    const caso = reposTestes.criar(db, {
      frase_id: fraseId,
      obra_id: reposCapitulos.obter(db, reposFrases.obter(db, fraseId)!.capitulo_id)!.obra_id,
      caso_pai_id: null,
      trecho_zh: '甲',
      pergunta: 'p',
      veredito: 'incorreto',
      resposta: 'r',
      justificativa: '',
      secao_regra: null,
      correcao_proposta: null,
      trecho_pt_errado: 'errara',
      trecho_pt_corrigido: 'errou',
      motivo_rejeicao: null,
      provedor: 'mock',
      modelo: 'mock-v1',
      resposta_bruta: '{}',
    });
    reposTestes.aplicarCorrecao(db, caso.id);
    const f = reposFrases.obter(db, fraseId)!;
    expect(f.texto_pt).toContain('errou');
    expect(f.origem_edicao).toBe('revisao');
  });
});
```

O import do topo precisa incluir `reposTestes`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w server run test -- migracao023`
Expected: FAIL — `CHECK constraint failed` no primeiro `it`.

- [ ] **Step 3: Write the migration**

Create `server/src/db/migrations/023_passe_estilo.sql`:

```sql
-- Passe de estilo e origem da edição.
--
-- `eventos_ia.papel` ganha 'estilo'. Sem papel próprio, o custo do passe se mistura
-- com o da revisão e a aba Custos deixa de responder "quanto me custa consertar
-- estilo". CHECK não se altera no SQLite: rebuild, padrão da 007.
--
-- `frases.origem_edicao` distingue a edição que o revisor DIGITOU da que ele apenas
-- APROVOU num botão. A mineração de edições manuais só pode ler a primeira: recontar
-- uma correção da revisão como "o que você mudou à mão" ensinaria a mesma lição duas
-- vezes. NULL = manual, e é o valor que todas as frases existentes recebem — nenhuma
-- delas veio de um botão que ainda não existia.

CREATE TABLE eventos_ia_novo (
  id                   INTEGER PRIMARY KEY,
  em                   TEXT NOT NULL DEFAULT (datetime('now')),
  data                 TEXT NOT NULL,
  obra_id              INTEGER REFERENCES obras(id)     ON DELETE SET NULL,
  capitulo_id          INTEGER REFERENCES capitulos(id) ON DELETE SET NULL,
  papel                TEXT NOT NULL CHECK (papel IN
                         ('traducao','revisao','qa','extracao','refinamento','titulo','comparador','estilo')),
  provedor             TEXT NOT NULL,
  modelo               TEXT NOT NULL,
  tokens_entrada       INTEGER,
  tokens_saida         INTEGER,
  tokens_cache_leitura INTEGER,
  tokens_cache_criacao INTEGER,
  custo_estimado       REAL
);

INSERT INTO eventos_ia_novo
  (id, em, data, obra_id, capitulo_id, papel, provedor, modelo,
   tokens_entrada, tokens_saida, tokens_cache_leitura, tokens_cache_criacao, custo_estimado)
  SELECT id, em, data, obra_id, capitulo_id, papel, provedor, modelo,
         tokens_entrada, tokens_saida, tokens_cache_leitura, tokens_cache_criacao, custo_estimado
  FROM eventos_ia;

DROP TABLE eventos_ia;
ALTER TABLE eventos_ia_novo RENAME TO eventos_ia;

CREATE INDEX idx_eventos_ia_obra     ON eventos_ia(obra_id, em);
CREATE INDEX idx_eventos_ia_capitulo ON eventos_ia(capitulo_id);
CREATE INDEX idx_eventos_ia_dia      ON eventos_ia(data, provedor);

ALTER TABLE frases ADD COLUMN origem_edicao TEXT;
```

**Antes de escrever este SQL, abra `server/src/db/migrations/010_eventos_ia.sql` e confira coluna a coluna** que a lista acima reproduz o schema atual — se alguma migração posterior acrescentou coluna a `eventos_ia`, ela tem de entrar aqui também, senão o rebuild perde dados.

- [ ] **Step 4: Run the migration test**

Run: `npm -w server run test -- migracao023`
Expected: os três primeiros `it` passam; os dois de `editarTexto` ainda falham.

- [ ] **Step 5: Wire `origem_edicao` into the repos**

Em `server/src/db/repos.ts`:

```ts
  editarTexto(db: BancoDados, id: number, textoPt: string, origem: string | null = null): Frase | undefined {
    // `origem` NULA é edição digitada pelo revisor — é o que a mineração de edições
    // manuais lê. Quem aplica por botão (revisão, passe de estilo, QA) passa a sua
    // origem, para a mesma lição não ser contada duas vezes.
    db.prepare('UPDATE frases SET texto_pt = ?, editado_manualmente = 1, origem_edicao = ? WHERE id = ?').run(
      textoPt,
      origem,
      id,
    );
    return this.obter(db, id);
  },
```

Em `reposTestes.aplicarCorrecao` (`repos.ts:1073`), acrescente `origem_edicao = 'revisao'` ao `UPDATE frases`.
Em `reposQa.aplicarSugestao` (`repos.ts:1610`), acrescente `origem_edicao = 'qa'` ao `UPDATE frases`.

Em `shared/src/index.ts`, a interface `Frase` ganha:

```ts
  /** De onde veio a última edição: null = digitada pelo revisor; 'revisao',
   *  'passe-estilo' ou 'qa' = aprovada num botão. */
  origem_edicao: string | null;
```

- [ ] **Step 6: Run everything**

Run: `npm run typecheck && npm -w server run test`
Expected: PASS. Se algum teste esperava a forma antiga de `Frase`, atualize a asserção.

- [ ] **Step 7: Commit**

```bash
git add server/src/db/migrations/023_passe_estilo.sql server/src/db/migracao023.test.ts server/src/db/repos.ts shared/src/index.ts
git commit -m "Migração 023: papel estilo e origem da edição

O passe de estilo precisa de papel próprio na telemetria, senão o custo se
mistura com o da revisão. E origem_edicao distingue o que o revisor DIGITOU do
que ele apenas APROVOU num botão — sem isso a mineração recontaria uma correção
da revisão como 'o que você mudou à mão'."
```

---

### Task 3: `trechoQueMudou` — o inverso da correção cirúrgica

**Files:**
- Modify: `shared/src/index.ts`
- Test: `server/src/db/trechoQueMudou.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `trechoQueMudou(antes: string, depois: string): { de: string; para: string }`

- [ ] **Step 1: Write the failing test**

Create `server/src/db/trechoQueMudou.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { trechoQueMudou } from '@dao-tale/shared';

describe('trechoQueMudou', () => {
  it('isola a palavra que mudou no meio da frase', () => {
    expect(trechoQueMudou('ele já é um morto agora', 'ele já é um cadáver agora')).toEqual({
      de: 'morto',
      para: 'cadáver',
    });
  });

  it('pega inserção pura', () => {
    expect(trechoQueMudou('o mestre era rico', 'o mestre era muito rico')).toEqual({
      de: '',
      para: 'muito ',
    });
  });

  it('pega remoção pura', () => {
    expect(trechoQueMudou('deu um sinal', 'deu sinal')).toEqual({ de: 'um ', para: '' });
  });

  it('textos iguais devolvem par vazio', () => {
    expect(trechoQueMudou('igual', 'igual')).toEqual({ de: '', para: '' });
  });

  it('mudança no começo não come o resto', () => {
    expect(trechoQueMudou('Matar é limpo', 'O ato de matar é limpo')).toEqual({
      de: 'Matar',
      para: 'O ato de matar',
    });
  });

  it('prefixo e sufixo comuns não se sobrepõem', () => {
    // "aa" -> "aaa": o sufixo comum não pode consumir letras que o prefixo já contou,
    // senão o trecho sai negativo e a função devolve lixo.
    expect(trechoQueMudou('aa', 'aaa')).toEqual({ de: '', para: 'a' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w server run test -- trechoQueMudou`
Expected: FAIL — `trechoQueMudou is not a function`.

- [ ] **Step 3: Implement**

Em `shared/src/index.ts`, ao lado de `aplicarCorrecao`:

```ts
/**
 * O menor trecho que difere entre dois textos: corta o prefixo e o sufixo comuns.
 *
 * É o INVERSO de `aplicarCorrecao` — dela sai o par que a correção cirúrgica
 * consumiria. Serve para ler o que o revisor mudou à mão sem despejar a frase
 * inteira no relatório: `morto -> cadáver` ensina; a frase de 200 caracteres não.
 */
export function trechoQueMudou(antes: string, depois: string): { de: string; para: string } {
  let i = 0;
  while (i < antes.length && i < depois.length && antes[i] === depois[i]) i++;
  // O sufixo comum não pode invadir o que o prefixo já contou ("aa" -> "aaa"),
  // senão os índices se cruzam e o slice devolve lixo.
  let j = 0;
  while (j < antes.length - i && j < depois.length - i && antes[antes.length - 1 - j] === depois[depois.length - 1 - j]) j++;
  return { de: antes.slice(i, antes.length - j), para: depois.slice(i, depois.length - j) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm -w server run test -- trechoQueMudou`
Expected: PASS nos seis.

- [ ] **Step 5: Commit**

```bash
git add shared/src/index.ts server/src/db/trechoQueMudou.test.ts
git commit -m "trechoQueMudou: o inverso da correção cirúrgica

Ler o que o revisor mudou à mão exige o par (de, para); aplicarCorrecao vai no
sentido contrário. Sem isto, a mineração despejaria a frase inteira no relatório
em vez do que de fato mudou."
```

---

### Task 4: O contrato do passe de estilo

**Files:**
- Modify: `server/src/ia/respostas.ts`, `server/src/ia/contratos.ts`, `server/src/ia/prompts.ts`, `server/src/ia/provedor.ts`
- Modify: `server/src/ia/claude.ts`, `server/src/ia/gemini.ts`, `server/src/ia/compat.ts`, `server/src/ia/mock.ts`
- Test: `server/src/ia/passeEstilo.test.ts`

**Interfaces:**
- Consumes: `Violacao { ordem, regra, trecho }` de `server/src/traducao/estiloViolacoes.js`.
- Produces:
  - `respostaPasseEstiloSchema` com `correcoes: { ordem, regra, trecho_pt_errado, trecho_pt_corrigido, descartar }[]`
  - `CONTRATO_PASSE_ESTILO`
  - `RequisicaoPasseEstilo { modelo, temperatura?, omega, alvos: { ordem, texto_pt, violacoes: { regra, trecho }[] }[], vizinhas: { ordem, texto_pt }[] }`
  - `ProvedorIA.passeEstilo(chave, req): Promise<RespostaPasseEstilo>`
  - `sistemaPasseEstilo(req)`, `usuarioPasseEstilo(req)`

- [ ] **Step 1: Write the failing test**

Create `server/src/ia/passeEstilo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { respostaPasseEstiloSchema } from './respostas.js';
import { CONTRATO_PASSE_ESTILO } from './contratos.js';
import { sistemaPasseEstilo, usuarioPasseEstilo } from './prompts.js';

const req = {
  modelo: 'm',
  omega: 'PROMPT DA OBRA',
  alvos: [
    { ordem: 12, texto_pt: 'concluindo que ele errara.', violacoes: [{ regra: 'mais-que-perfeito', trecho: 'errara' }] },
  ],
  vizinhas: [{ ordem: 11, texto_pt: 'O senhor não lhe deu chance.' }],
};

describe('contrato do passe de estilo', () => {
  it('aceita correção com par cirúrgico', () => {
    const r = respostaPasseEstiloSchema.parse({
      correcoes: [
        { ordem: 12, regra: 'mais-que-perfeito', trecho_pt_errado: 'errara', trecho_pt_corrigido: 'errou' },
      ],
    });
    expect(r.correcoes[0].descartar).toBe(false);
  });

  it('aceita descarte sem par — o scanner é heurístico e erra', () => {
    const r = respostaPasseEstiloSchema.parse({
      correcoes: [{ ordem: 3, regra: 'mais-que-perfeito', descartar: true }],
    });
    expect(r.correcoes[0].descartar).toBe(true);
    expect(r.correcoes[0].trecho_pt_errado).toBeNull();
  });

  it('recusa correção sem par quando não é descarte', () => {
    expect(() =>
      respostaPasseEstiloSchema.parse({ correcoes: [{ ordem: 3, regra: 'mais-que-perfeito' }] }),
    ).toThrow();
  });

  it('lista vazia é resposta válida', () => {
    expect(respostaPasseEstiloSchema.parse({}).correcoes).toEqual([]);
  });

  it('as instruções proíbem tocar em mais que a violação', () => {
    const s = sistemaPasseEstilo(req);
    expect(s).toMatch(/apenas a viola[çc][ãa]o/i);
    expect(s).toMatch(/n[ãa]o retraduza/i);
    // Sem isto o modelo devolve um trecho que aparece duas vezes na frase e
    // aplicarCorrecao cai no caminho da frase inteira.
    expect(s).toMatch(/[úu]nico na frase/i);
  });

  it('a mensagem traz a frase, a regra e o trecho acusado', () => {
    const u = usuarioPasseEstilo(req);
    expect(u).toContain('[12]');
    expect(u).toContain('concluindo que ele errara.');
    expect(u).toContain('mais-que-perfeito');
    expect(u).toContain('errara');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w server run test -- passeEstilo`
Expected: FAIL — módulo não exporta `respostaPasseEstiloSchema`.

- [ ] **Step 3: The Zod schema**

Em `server/src/ia/respostas.ts`:

```ts
// Passe de estilo: a IA propõe o conserto SÓ das violações que o scanner acusou.
// `descartar` existe porque o scanner é heurístico por sufixo — "romãzeira",
// "Voadora" e "prepara" já apareceram como falso positivo. Dar ao modelo uma saída
// honesta é melhor que forçá-lo a inventar correção para o que está certo.
export const respostaPasseEstiloSchema = z.object({
  correcoes: z
    .array(
      z
        .object({
          ordem: z.coerce.number().int(),
          regra: z.string().default(''),
          trecho_pt_errado: z.string().nullable().default(null),
          trecho_pt_corrigido: z.string().nullable().default(null),
          descartar: z.boolean().default(false),
        })
        .refine((c) => c.descartar || (!!c.trecho_pt_errado && c.trecho_pt_corrigido != null), {
          message: 'correção sem par cirúrgico só é válida quando descartar = true',
        }),
    )
    .default([]),
});
```

- [ ] **Step 4: The tool contract**

Em `server/src/ia/contratos.ts`, no mesmo formato de `CONTRATO_QA`:

```ts
export const CONTRATO_PASSE_ESTILO: Contrato<typeof respostaPasseEstiloSchema> = {
  ferramenta: 'entregar_passe_estilo',
  descricao: 'Entrega o conserto pontual das violações de estilo apontadas.',
  zod: respostaPasseEstiloSchema,
  schema: {
    type: 'object',
    properties: {
      correcoes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            ordem: { type: 'integer', description: 'número da frase, como recebido' },
            regra: { type: 'string', description: 'a violação apontada, ecoada para conferência' },
            trecho_pt_errado: {
              type: ['string', 'null'],
              description: 'o MENOR pedaço da tradução atual que muda, copiado LETRA POR LETRA e ÚNICO na frase',
            },
            trecho_pt_corrigido: { type: ['string', 'null'], description: 'o que esse pedaço deve virar' },
            descartar: { type: 'boolean', description: 'true = não há violação de verdade aqui' },
          },
          required: ['ordem'],
        },
      },
    },
    required: ['correcoes'],
  },
  notasInstrucao: [
    'Se não houver nada a consertar, use "correcoes": [].',
    'trecho_pt_errado tem de ser cópia EXATA de um pedaço do texto atual e ÚNICO na frase: se a palavra se repetir, inclua as vizinhas necessárias para desambiguar.',
    'Quando a violação apontada for falso positivo, devolva descartar: true e deixe o par em null.',
  ],
};
```

- [ ] **Step 5: The prompts**

Em `server/src/ia/prompts.ts`, seguindo o formato de `sistemaQaPartes`/`usuarioQa`:

```ts
// ── Passe de estilo ────────────────────────────────────────────────────────
// A varredura de estilo já aponta as violações e não tinha como ajudar a
// consertar: na 死人经 o revisor desfez 57 mais-que-perfeitos à mão, um por um.
// Este passe propõe o conserto PONTUAL de cada uma — nunca retradução, porque
// retraduzir apagaria as correções que o revisor já tinha feito na mesma frase.

export function sistemaPasseEstiloPartes(req: Pick<RequisicaoPasseEstilo, 'omega'>): PartesSistema {
  const operacional = [
    '## TAREFA: PASSE DE ESTILO',
    'Você receberá frases já traduzidas com uma ou mais VIOLAÇÕES DE ESTILO apontadas por uma varredura automática, e o trecho que disparou cada uma.',
    'Conserte APENAS A VIOLAÇÃO apontada. NÃO retraduza a frase, não melhore o que não foi apontado, não mexa em pontuação, aspas ou ordem das orações que estejam fora da violação.',
    'Para cada violação devolva o par: trecho_pt_errado (cópia EXATA de um pedaço do texto atual, e ÚNICO na frase — se a palavra se repetir, inclua as vizinhas necessárias) e trecho_pt_corrigido.',
    'A varredura é heurística e erra: se a ocorrência apontada NÃO for uma violação de verdade, devolva descartar: true e deixe o par em null. Isso é resposta legítima e esperada.',
    'As frases marcadas como contexto servem só para você entender o trecho — NÃO as corrija.',
    'Responda exclusivamente pela ferramenta/formato estruturado fornecido.',
  ].join('\n');
  return { base: req.omega.trim(), operacional };
}

export function sistemaPasseEstilo(req: Pick<RequisicaoPasseEstilo, 'omega'>): string {
  return juntarPartes(sistemaPasseEstiloPartes(req));
}

export function usuarioPasseEstilo(req: RequisicaoPasseEstilo): string {
  const partes: string[] = [];
  if (req.vizinhas.length > 0) {
    partes.push('### Contexto (NÃO corrigir):');
    for (const v of req.vizinhas) partes.push(`[${v.ordem}] ${v.texto_pt}`);
    partes.push('');
  }
  partes.push('### Frases a consertar:');
  for (const a of req.alvos) {
    partes.push(`[${a.ordem}] ${a.texto_pt}`);
    for (const v of a.violacoes) partes.push(`    violação: ${v.regra} — trecho acusado: "${v.trecho}"`);
  }
  return partes.join('\n');
}
```

Em `server/src/ia/provedor.ts`:

```ts
export interface RequisicaoPasseEstilo {
  modelo: string;
  temperatura?: number;
  omega: string;
  alvos: { ordem: number; texto_pt: string; violacoes: { regra: string; trecho: string }[] }[];
  /** Frases vizinhas, só para o modelo entender o trecho. Nunca corrigidas. */
  vizinhas: { ordem: number; texto_pt: string }[];
}

export interface RespostaPasseEstilo {
  correcoes: {
    ordem: number;
    regra: string;
    trecho_pt_errado: string | null;
    trecho_pt_corrigido: string | null;
    descartar: boolean;
  }[];
  bruta: string;
  uso: UsoChamada;
}
```

E acrescente à interface `ProvedorIA`:

```ts
  passeEstilo(chave: string | null, req: RequisicaoPasseEstilo): Promise<RespostaPasseEstilo>;
```

- [ ] **Step 6: The four providers**

Implemente `passeEstilo` em `claude.ts`, `gemini.ts` e `compat.ts` **copiando a forma de `analisarQa` do mesmo arquivo** — mesma montagem de sistema/usuário, mesmo uso de `CONTRATO_PASSE_ESTILO` no lugar de `CONTRATO_QA`, mesmo tratamento de erro. Leia cada arquivo antes; não invente forma nova.

Em `mock.ts`, escreva à mão:

```ts
  async passeEstilo(_chave, req: RequisicaoPasseEstilo) {
    await espera(latenciaMs());
    // Simula os dois desfechos: consertar o trecho acusado, e descartar quando o
    // trecho contém "prepara" — a classe de falso positivo do scanner por sufixo.
    const correcoes = req.alvos.flatMap((a) =>
      a.violacoes.map((v) => {
        const falsoPositivo = /prepara|roma|voadora/i.test(v.trecho);
        return falsoPositivo
          ? { ordem: a.ordem, regra: v.regra, trecho_pt_errado: null, trecho_pt_corrigido: null, descartar: true }
          : {
              ordem: a.ordem,
              regra: v.regra,
              trecho_pt_errado: v.trecho,
              trecho_pt_corrigido: `[simulado] ${v.trecho}`,
              descartar: false,
            };
      }),
    );
    return { correcoes, bruta: JSON.stringify({ correcoes }), uso: usoSimulado('estilo', req, { correcoes }) };
  },
```

Se `usoSimulado` não aceitar `'estilo'`, leia a assinatura dela e ajuste — ela recebe o papel só para estimar tokens.

- [ ] **Step 7: Run everything**

Run: `npm run typecheck && npm -w server run test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/src/ia shared/src/index.ts server/src/ia/passeEstilo.test.ts
git commit -m "Contrato do passe de estilo

A varredura já apontava as violações e não tinha como ajudar a consertar. O
contrato devolve o MESMO par cirúrgico da revisão, para reusar aplicarCorrecao
inteira. \`descartar\` existe porque o scanner é heurístico por sufixo e erra —
forçar o modelo a inventar correção para o que está certo seria pior."
```

---

### Task 5: A rota do passe

**Files:**
- Modify: `server/src/rotas/capitulos.ts`
- Test: `server/src/rotas/passeEstiloRota.test.ts`

**Interfaces:**
- Consumes: `CONTRATO_PASSE_ESTILO` e `passeEstilo` (Task 4); `origem_edicao` e `editarTexto(…, origem)` (Task 2); `analisarEstilo`, `reposEstiloIgnorado`.
- Produces: `POST /capitulos/:id/estilo/passe` → `{ correcoes: { frase_id, ordem, regra, trecho_pt_errado, trecho_pt_corrigido, descartar, previa }[] }`, onde `previa` é o resultado de `aplicarCorrecao` sobre o texto atual; e `POST /frases/:id/estilo/aplicar` que grava.

- [ ] **Step 1: Write the failing test**

Create `server/src/rotas/passeEstiloRota.test.ts`. Monte o app com o padrão de `server/src/app.test.ts` (leia-o e reaproveite a forma; não invente montagem nova). Crie uma obra com provedor `mock`, um capítulo cujo texto tenha uma frase com `errara` e outra limpa, e:

```ts
  it('só manda ao provedor as frases que o scanner acusa', async () => {
    const r = await app.request(`/api/capitulos/${capId}/estilo/passe`, { method: 'POST' });
    expect(r.status).toBe(200);
    const { correcoes } = await r.json();
    // A frase limpa não pode aparecer.
    expect(correcoes.every((c: { ordem: number }) => c.ordem === ordemComErrara)).toBe(true);
  });

  it('não repropõe o que já foi dispensado', async () => {
    await app.request(`/api/frases/${fraseId}/estilo/dispensar`, {
      method: 'POST',
      body: JSON.stringify({ regra: 'mais-que-perfeito', trecho: 'errara' }),
      headers: { 'content-type': 'application/json' },
    });
    const r = await app.request(`/api/capitulos/${capId}/estilo/passe`, { method: 'POST' });
    const { correcoes } = await r.json();
    expect(correcoes).toHaveLength(0);
  });

  it('capítulo sem violação não gasta chamada', async () => {
    const r = await app.request(`/api/capitulos/${capLimpoId}/estilo/passe`, { method: 'POST' });
    expect(r.status).toBe(200);
    expect((await r.json()).correcoes).toHaveLength(0);
    // Nenhum evento de IA gravado: o passe nem foi chamado.
    const n = db.prepare("SELECT COUNT(*) n FROM eventos_ia WHERE papel = 'estilo'").get() as { n: number };
    expect(n.n).toBe(0);
  });

  it('duas violações na mesma frase não se atropelam', async () => {
    // aplicarCorrecao só ancora quando o trecho é ÚNICO na frase (shared/src/index.ts:156).
    // Aplicar a primeira não pode deixar a segunda sem âncora.
    reposFrases.editarTexto(db, fraseId, 'ele errara e depois fizera pior.');
    const um = await app.request(`/api/frases/${fraseId}/estilo/aplicar`, {
      method: 'POST',
      body: JSON.stringify({ trecho_pt_errado: 'errara', trecho_pt_corrigido: 'errou' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(um.status).toBe(200);
    const dois = await app.request(`/api/frases/${fraseId}/estilo/aplicar`, {
      method: 'POST',
      body: JSON.stringify({ trecho_pt_errado: 'fizera', trecho_pt_corrigido: 'fez' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(dois.status).toBe(200);
    expect(reposFrases.obter(db, fraseId)!.texto_pt).toBe('ele errou e depois fez pior.');
  });

  it('trecho que não ancora devolve 400 com o trecho na mensagem', async () => {
    const r = await app.request(`/api/frases/${fraseId}/estilo/aplicar`, {
      method: 'POST',
      body: JSON.stringify({ trecho_pt_errado: 'inexistente', trecho_pt_corrigido: 'x' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(r.status).toBe(400);
    expect((await r.json()).erro.mensagem).toContain('inexistente');
  });

  it('aplicar grava a origem passe-estilo', async () => {
    const r = await app.request(`/api/frases/${fraseId}/estilo/aplicar`, {
      method: 'POST',
      body: JSON.stringify({ trecho_pt_errado: 'errara', trecho_pt_corrigido: 'errou' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(r.status).toBe(200);
    const f = reposFrases.obter(db, fraseId)!;
    expect(f.texto_pt).toContain('errou');
    expect(f.origem_edicao).toBe('passe-estilo');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm -w server run test -- passeEstiloRota`
Expected: FAIL — 404 na rota.

- [ ] **Step 3: Implement the routes**

Em `server/src/rotas/capitulos.ts`, logo depois da rota `GET /capitulos/:id/estilo`:

```ts
  // Passe de estilo: propõe o conserto das violações que a varredura já acusa.
  // Escopo estreito de propósito — só as frases da lista, nunca o capítulo inteiro.
  app.post('/capitulos/:id/estilo/passe', async (c) => {
    const id = Number(c.req.param('id'));
    const capitulo = reposCapitulos.obter(db, id);
    if (!capitulo) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Capítulo não encontrado.' } }, 404);

    const prompt = reposPrompts.composto(db, capitulo.obra_id);
    if (!prompt) {
      return c.json({ erro: { codigo: 'sem-prompt', mensagem: 'A obra não tem prompt mãe ativo e não há prompt padrão ativo.' } }, 400);
    }
    const prefs = normalizarPreferencias(reposPrompts.ativo(db, capitulo.obra_id)?.preferencias);
    const frases = reposFrases.listarPorCapitulo(db, id);
    const idPorOrdem = new Map(frases.map((f) => [f.ordem, f.id]));
    const ignoradas = reposEstiloIgnorado.doCapitulo(db, id);
    const visiveis = analisarEstilo(frases, prefs).violacoes.filter((v) => {
      const fid = idPorOrdem.get(v.ordem);
      return fid != null && !ignoradas.has(`${fid}|${v.regra}|${v.trecho}`);
    });

    // Sem violação não há chamada — o passe custa dinheiro e não se paga no vazio.
    if (visiveis.length === 0) return c.json({ correcoes: [] });

    const porOrdem = new Map<number, { regra: string; trecho: string }[]>();
    for (const v of visiveis) porOrdem.set(v.ordem, [...(porOrdem.get(v.ordem) ?? []), { regra: v.regra, trecho: v.trecho }]);
    const textoPorOrdem = new Map(frases.map((f) => [f.ordem, f.texto_pt ?? '']));
    const alvos = [...porOrdem.entries()].map(([ordem, violacoes]) => ({
      ordem,
      texto_pt: textoPorOrdem.get(ordem) ?? '',
      violacoes,
    }));
    const alvosSet = new Set(alvos.map((a) => a.ordem));
    const vizinhas = frases
      .filter((f) => !alvosSet.has(f.ordem) && [...alvosSet].some((o) => Math.abs(o - f.ordem) === 1))
      .map((f) => ({ ordem: f.ordem, texto_pt: f.texto_pt ?? '' }));

    // Mesma cadeia do papel `revisao` (doc 08 §5): o par de revisão vence quando
    // configurado, senão cai no do capítulo, no da obra e no padrão. Nunca se mistura
    // modelo de um provedor com outro.
    const obra = reposObras.obter(db, capitulo.obra_id)!;
    const config = reposConfig.obterTodas(db);
    const papelRevisao = !!config.provedor_revisao;
    const provedorId: ProvedorId = papelRevisao
      ? (config.provedor_revisao as ProvedorId)
      : ((capitulo.provedor as ProvedorId | null) ?? obra.provedor_padrao ?? config.provedor_padrao);
    const provedor = obterProvedor(provedorId);
    const modelo = papelRevisao
      ? config.modelo_revisao || provedor.modeloPadrao
      : (capitulo.modelo ?? obra.modelo_padrao ?? (config.modelo_padrao || provedor.modeloPadrao));
    const chave = provedor.precisaChave ? await obterChave(provedorId) : null;
    if (provedor.precisaChave && !chave) {
      return c.json({ erro: { codigo: 'sem-chave', mensagem: `Nenhuma chave de API configurada para ${provedor.nome}.` } }, 400);
    }

    try {
      reposUso.registrar(db, provedorId, modelo);
      const resposta = await provedor.passeEstilo(chave, {
        modelo,
        temperatura: resolverTemperatura(config.temperaturas, 'revisao', obra.temperatura),
        omega: prompt.texto,
        alvos,
        vizinhas,
      });
      registrarEvento(db, { obra_id: capitulo.obra_id, capitulo_id: id, papel: 'estilo', provedor: provedorId, modelo, uso: resposta.uso });
      const correcoes = resposta.correcoes.map((cor) => {
        const frase_id = idPorOrdem.get(cor.ordem) ?? null;
        const texto = textoPorOrdem.get(cor.ordem) ?? '';
        return { ...cor, frase_id, previa: cor.descartar ? null : aplicarCorrecao(texto, cor) };
      });
      return c.json({ correcoes });
    } catch (e) {
      const mensagem = e instanceof ErroProvedor ? e.message : `Falha no passe de estilo: ${(e as Error).message}`;
      return c.json({ erro: { codigo: 'passe-estilo', mensagem } }, 502);
    }
  });

  // Aplica uma correção do passe. Separada da proposta porque a decisão é humana:
  // a rota de cima nunca escreve no texto.
  app.post('/frases/:id/estilo/aplicar', async (c) => {
    const corpo = z
      .object({ trecho_pt_errado: z.string().min(1), trecho_pt_corrigido: z.string() })
      .safeParse(await c.req.json());
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);
    const frase = reposFrases.obter(db, Number(c.req.param('id')));
    if (!frase) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Frase não encontrada.' } }, 404);
    const r = aplicarCorrecao(frase.texto_pt ?? '', corpo.data);
    if (r.tipo === 'impossivel') {
      return c.json({ erro: { codigo: 'trecho-nao-encontrado', mensagem: `O trecho "${corpo.data.trecho_pt_errado}" não foi encontrado no texto atual da frase.` } }, 400);
    }
    return c.json(reposFrases.editarTexto(db, frase.id, r.texto, 'passe-estilo'));
  });
```

`previa` viaja para a tela poder mostrar, antes de gravar, se a aplicação seria cirúrgica ou pela frase inteira — o mesmo aviso que a revisão já dá.

- [ ] **Step 4: Run to verify it passes**

Run: `npm -w server run test -- passeEstiloRota`
Expected: PASS nos quatro.

- [ ] **Step 5: Run everything**

Run: `npm run typecheck && npm -w server run test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/rotas/capitulos.ts server/src/rotas/passeEstiloRota.test.ts
git commit -m "Rota do passe de estilo

Propor e aplicar são rotas separadas porque a decisão é humana: a proposta nunca
escreve no texto. Capítulo sem violação não gasta chamada, e o que já foi
dispensado não volta a ser proposto."
```

---

### Task 6: A classificação das edições manuais

**Files:**
- Create: `server/src/traducao/edicoesManuais.ts`
- Test: `server/src/traducao/edicoesManuais.test.ts`

**Interfaces:**
- Consumes: `trechoQueMudou` (Task 3); `origem_edicao` (Task 2); `contemTermoFlexionado` de `server/src/traducao/flexao.js`; `temasNoTexto` de `@dao-tale/shared`.
- Produces:

```ts
export type RotaEdicao = 'tipografia' | 'glossario' | 'chave-estilo' | 'nucleo' | 'diretriz';
export interface EdicaoClassificada {
  frase_id: number; ordem: number; capitulo_numero: number;
  texto_zh: string; ia: string; voce: string;
  de: string; para: string;
  rota: RotaEdicao;
  detalhe: string | null;   // termo do glossário, ou id do tema
}
export function classificarEdicoes(
  frases: { id: number; ordem: number; capitulo_numero: number; texto_zh: string; texto_pt_original_ia: string | null; texto_pt: string; editado_manualmente: boolean; origem_edicao: string | null }[],
  glossario: EntradaGlossario[],
): EdicaoClassificada[];
```

- [ ] **Step 1: Write the failing test**

Create `server/src/traducao/edicoesManuais.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { classificarEdicoes } from './edicoesManuais.js';

const base = { id: 1, ordem: 0, capitulo_numero: 1, texto_zh: '甲', editado_manualmente: true, origem_edicao: null };
const glossario = [
  { id: 1, obra_id: 1, termo_zh: '金鹏堡', termo_pt: 'Fortaleza do Peng Dourado', categoria: 'lugar', nota: null, principal_id: null, criado_em: '' },
] as never[];

const uma = (ia: string, voce: string, extra: Record<string, unknown> = {}) =>
  classificarEdicoes([{ ...base, texto_pt_original_ia: ia, texto_pt: voce, ...extra }], glossario);

describe('classificarEdicoes', () => {
  it('aspas curvas viram tipografia', () => {
    expect(uma('ele disse ‘vá’ agora', "ele disse 'vá' agora")[0].rota).toBe('tipografia');
  });

  it('termo do glossário fora da forma canônica vai para glossário', () => {
    const r = uma('a Fortaleza Jinpeng caiu', 'a Fortaleza do Peng Dourado caiu');
    expect(r[0].rota).toBe('glossario');
    expect(r[0].detalhe).toBe('Fortaleza do Peng Dourado');
  });

  it('mais-que-perfeito desfeito vai para chave de estilo', () => {
    const r = uma('concluindo que ele errara', 'concluindo que ele errou');
    expect(r[0].rota).toBe('chave-estilo');
  });

  it('decalque desfeito vai para núcleo', () => {
    const r = uma('a outra parte recuou', 'o inimigo recuou');
    expect(r[0].rota).toBe('nucleo');
  });

  it('troca vocabular sem tema vira candidato a diretriz', () => {
    const r = uma('ele já é um morto', 'ele já é um cadáver');
    expect(r[0].rota).toBe('diretriz');
    expect(r[0]).toMatchObject({ de: 'morto', para: 'cadáver' });
  });

  it('glossário vence tema quando os dois casariam', () => {
    // "Fortaleza Jinpeng -> Fortaleza do Peng Dourado" casaria o tema `glossario`
    // por conter a palavra; o que interessa é QUAL termo, não que é glossário.
    expect(uma('a Fortaleza Jinpeng caiu', 'a Fortaleza do Peng Dourado caiu')[0].detalhe).not.toBeNull();
  });

  it('edição vinda de botão não entra', () => {
    expect(uma('ele errara', 'ele errou', { origem_edicao: 'revisao' })).toHaveLength(0);
    expect(uma('ele errara', 'ele errou', { origem_edicao: 'passe-estilo' })).toHaveLength(0);
  });

  it('frase sem edição ou sem original não entra', () => {
    expect(uma('igual', 'igual')).toHaveLength(0);
    expect(classificarEdicoes([{ ...base, texto_pt_original_ia: null, texto_pt: 'x' }], glossario)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm -w server run test -- edicoesManuais`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implement**

Create `server/src/traducao/edicoesManuais.ts`:

```ts
import { temasNoTexto, trechoQueMudou, type EntradaGlossario } from '@dao-tale/shared';
import { contemTermoFlexionado } from './flexao.js';

// O que o revisor corrige à mão é o sinal mais forte que o app tem — e o menos
// lido. Na 死人经 foram 146 edições contra 25 casos no banco de testes. Mas a
// maior parte NÃO vira regra nova: é chave de estilo que o modelo desobedeceu,
// termo de glossário que derivou, ou tipografia. Classificar antes de propor é o
// que impede o refinamento de receber material que ele é proibido de usar.

export type RotaEdicao = 'tipografia' | 'glossario' | 'chave-estilo' | 'nucleo' | 'diretriz';

export interface EdicaoClassificada {
  frase_id: number;
  ordem: number;
  capitulo_numero: number;
  texto_zh: string;
  ia: string;
  voce: string;
  de: string;
  para: string;
  rota: RotaEdicao;
  /** Termo do glossário, ou id do tema — o que explica a rota. */
  detalhe: string | null;
}

/** Tira do texto o que é decisão de tipografia, não de tradução. */
const normalizarTipografia = (t: string) =>
  t
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/…/g, '...')
    .replace(/[–—]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export function classificarEdicoes(
  frases: {
    id: number;
    ordem: number;
    capitulo_numero: number;
    texto_zh: string;
    texto_pt_original_ia: string | null;
    texto_pt: string;
    editado_manualmente: boolean;
    origem_edicao: string | null;
  }[],
  glossario: EntradaGlossario[],
): EdicaoClassificada[] {
  const saida: EdicaoClassificada[] = [];
  for (const f of frases) {
    // Só edição DIGITADA pelo revisor. O que veio de botão já é decisão registrada
    // em outro canal, e recontá-la ensinaria a mesma lição duas vezes.
    if (!f.editado_manualmente || f.origem_edicao !== null) continue;
    const ia = f.texto_pt_original_ia;
    if (!ia || ia === f.texto_pt) continue;

    const { de, para } = trechoQueMudou(ia, f.texto_pt);
    const comum = {
      frase_id: f.id,
      ordem: f.ordem,
      capitulo_numero: f.capitulo_numero,
      texto_zh: f.texto_zh,
      ia,
      voce: f.texto_pt,
      de,
      para,
    };

    if (normalizarTipografia(ia) === normalizarTipografia(f.texto_pt)) {
      saida.push({ ...comum, rota: 'tipografia', detalhe: null });
      continue;
    }

    // Glossário ANTES de tema: o tema `glossario` casaria por conter a palavra, mas
    // o que interessa é QUAL termo derivou.
    const termo = glossario.find(
      (g) => !contemTermoFlexionado(ia, g.termo_pt) && contemTermoFlexionado(f.texto_pt, g.termo_pt),
    );
    if (termo) {
      saida.push({ ...comum, rota: 'glossario', detalhe: termo.termo_pt });
      continue;
    }

    const tema = temasNoTexto(`${de}\n${para}`)[0]?.tema;
    if (tema) {
      saida.push({
        ...comum,
        rota: tema.dono === 'alfa' ? 'nucleo' : 'chave-estilo',
        detalhe: tema.id,
      });
      continue;
    }

    saida.push({ ...comum, rota: 'diretriz', detalhe: null });
  }
  return saida;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm -w server run test -- edicoesManuais`
Expected: PASS nos oito. Se o teste de `chave-estilo` falhar, é porque `temasNoTexto` usa `tema.padrao` (texto corrido) e `errara`/`errou` não casa `/mais[-\s]que[-\s]perfeito|anterioridade|\bfizera\b|\bdissera\b/i`. Nesse caso **não afrouxe o padrão do registro** — acrescente ao módulo uma checagem própria pelas regras do scanner (`analisarEstilo` sobre `ia` e sobre `voce`: se a violação existia antes e sumiu depois, a rota é `chave-estilo`), e ajuste o teste para refletir isso. Registre a decisão no relatório.

- [ ] **Step 5: Commit**

```bash
git add server/src/traducao/edicoesManuais.ts server/src/traducao/edicoesManuais.test.ts
git commit -m "Classifica a edição manual por camada dona, sem gastar IA

A maior parte do que o revisor corrige à mão NÃO vira regra nova: é chave de
estilo que o modelo desobedeceu, termo de glossário que derivou, ou tipografia.
Classificar antes de propor impede o refinamento de receber material que ele é
proibido de usar — o mesmo motivo do roteamento por camada das recorrências."
```

---

### Task 7: As edições entram no refinamento

**Files:**
- Modify: `server/src/ia/provedor.ts`, `server/src/ia/prompts.ts`, `server/src/rotas/obras.ts`
- Test: `server/src/ia/prompts.test.ts`, `server/src/rotas/refinoCamada.test.ts`

**Interfaces:**
- Consumes: `classificarEdicoes` (Task 6).
- Produces: `RequisicaoRefinarPrompt.edicoes?: { trecho_zh: string; ia: string; voce: string; mudou: { de: string; para: string } }[]`; rota `GET /obras/:id/edicoes-manuais` devolvendo `EdicaoClassificada[]`.

- [ ] **Step 1: Write the failing test**

Em `server/src/ia/prompts.test.ts`:

```ts
describe('refinamento — edições manuais', () => {
  const req = {
    omega: 'PROMPT',
    deltaAtual: '',
    casos: [],
    edicoes: [
      { trecho_zh: '他已经是死人', ia: 'ele já é um morto', voce: 'ele já é um cadáver', mudou: { de: 'morto', para: 'cadáver' } },
    ],
  };

  it('traz a seção com o par e a frase inteira', () => {
    const u = usuarioRefinarPrompt(req);
    expect(u).toMatch(/corrigiu à mão/i);
    expect(u).toContain('morto');
    expect(u).toContain('cadáver');
    // A frase inteira precisa ir: "morto -> cadáver" isolado não diz por quê.
    expect(u).toContain('ele já é um morto');
  });

  it('sem edições a seção não aparece', () => {
    expect(usuarioRefinarPrompt({ ...req, edicoes: [] })).not.toMatch(/corrigiu à mão/i);
    expect(usuarioRefinarPrompt({ ...req, edicoes: undefined })).not.toMatch(/corrigiu à mão/i);
  });

  it('o sistema avisa que edição só vira regra quando se repete', () => {
    expect(sistemaRefinarPrompt(req)).toMatch(/se repete|repetir/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm -w server run test -- prompts`
Expected: FAIL — a seção não existe.

- [ ] **Step 3: Implement the prompt section**

Em `server/src/ia/provedor.ts`, `RequisicaoRefinarPrompt` ganha:

```ts
  /** Correções que o revisor digitou sem pedir revisão — o sinal mais forte que
   *  existe, e o mais bruto: a IA nunca soube que elas aconteceram. */
  edicoes?: { trecho_zh: string; ia: string; voce: string; mudou: { de: string; para: string } }[];
```

Em `server/src/ia/prompts.ts`, ao fim de `usuarioRefinarPrompt`:

```ts
  if (req.edicoes && req.edicoes.length > 0) {
    partes.push('');
    partes.push('### Correções que o revisor fez à mão (a IA nunca soube)');
    for (const e of req.edicoes) {
      partes.push(`- ZH: ${e.trecho_zh}`);
      partes.push(`  A IA escreveu: ${e.ia}`);
      partes.push(`  O revisor deixou: ${e.voce}`);
      partes.push(`  O que mudou: "${e.mudou.de}" → "${e.mudou.para}"`);
    }
  }
```

E ao array de instruções de `sistemaRefinarPromptPartes`:

```ts
    'A mensagem pode trazer CORREÇÕES QUE O REVISOR FEZ À MÃO. São o padrão que ele pratica sem pedir, e portanto o sinal mais forte — mas também o mais bruto: uma correção isolada é gosto, não regra. Só proponha regra quando o mesmo tipo de correção se repetir em casos diferentes.',
```

- [ ] **Step 4: Feed them in the route**

Em `server/src/rotas/obras.ts`, na montagem do refinamento, acrescente:

```ts
    // Só a rota `diretriz`: o resto tem dono em outra camada e o refinador é
    // proibido de propor sobre eles. Teto de 15, as mais recentes — mesmo espírito
    // do teto de 5 casos por seção recorrente.
    const edicoes = classificarEdicoes(reposFrases.paraMineracao(db, obraId), reposGlossario.listar(db, obraId))
      .filter((e) => e.rota === 'diretriz')
      .slice(-15)
      .map((e) => ({ trecho_zh: e.texto_zh, ia: e.ia, voce: e.voce, mudou: { de: e.de, para: e.para } }));
```

Isso exige um método novo em `reposFrases`:

```ts
  /** Frases da obra com o que a mineração de edições manuais precisa, já com o
      número do capítulo — a classificação é pura e não consulta o banco. */
  paraMineracao(db: BancoDados, obraId: number): {
    id: number; ordem: number; capitulo_numero: number; texto_zh: string;
    texto_pt_original_ia: string | null; texto_pt: string;
    editado_manualmente: boolean; origem_edicao: string | null;
  }[] {
    return (
      db
        .prepare(
          `SELECT f.id, f.ordem, c.numero capitulo_numero, f.texto_zh,
                  f.texto_pt_original_ia, f.texto_pt, f.editado_manualmente, f.origem_edicao
           FROM frases f JOIN capitulos c ON c.id = f.capitulo_id
           WHERE c.obra_id = ? ORDER BY c.numero, f.ordem`,
        )
        .all(obraId) as { editado_manualmente: number }[]
    ).map((l) => ({ ...l, editado_manualmente: !!l.editado_manualmente })) as never;
  },
```

E uma rota de leitura para a tela:

```ts
  app.get('/obras/:id/edicoes-manuais', (c) => {
    const obraId = Number(c.req.param('id'));
    if (!reposObras.obter(db, obraId)) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra não encontrada.' } }, 404);
    return c.json(classificarEdicoes(reposFrases.paraMineracao(db, obraId), reposGlossario.listar(db, obraId)));
  });
```

- [ ] **Step 5: Test the routing in the refinement**

Acrescente a `server/src/rotas/refinoCamada.test.ts`:

```ts
  it('só a rota diretriz vai ao refinador', async () => {
    // Uma edição de tipografia e uma de vocabulário na mesma obra: só a segunda
    // pode chegar à chamada paga.
    const todas = await (await app.request(`/api/obras/${obraId}/edicoes-manuais`)).json();
    expect(todas.map((e: { rota: string }) => e.rota).sort()).toEqual(['diretriz', 'tipografia']);
  });
```

- [ ] **Step 6: Run everything**

Run: `npm run typecheck && npm -w server run test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/ia/provedor.ts server/src/ia/prompts.ts server/src/rotas/obras.ts server/src/db/repos.ts server/src/ia/prompts.test.ts server/src/rotas/refinoCamada.test.ts
git commit -m "As edições manuais entram no refinamento, filtradas por rota

Só a rota 'diretriz' chega à chamada paga: o resto tem dono em outra camada e o
refinador é proibido de propor sobre eles. A frase inteira vai junto do par
porque 'morto -> cadáver' isolado não diz por quê."
```

---

### Task 8: As duas telas

**Files:**
- Create: `web/src/paginas/PasseEstilo.tsx`
- Create: `web/src/paginas/EdicoesManuais.tsx`
- Modify: `web/src/App.tsx` (rotas), `web/src/paginas/EditorCapitulo.tsx` (entrada para o passe), `web/src/paginas/ObraLayout.tsx` (entrada para as edições)

**Interfaces:**
- Consumes: `POST /capitulos/:id/estilo/passe`, `POST /frases/:id/estilo/aplicar`, `POST /frases/:id/estilo/dispensar`, `GET /obras/:id/edicoes-manuais`.
- Produces: nada consumido por outra tarefa.

- [ ] **Step 1: A tela do passe**

`PasseEstilo.tsx` — uma linha por correção proposta, com: a frase (trecho acusado destacado), a regra, a proposta `de → para`, e as ações **Aplicar**, **Editar**, **Dispensar**.

Regras de comportamento:
- Correção com `descartar: true` aparece separada, sob *"a IA acha que não é violação"*, com a ação **Dispensar** em destaque e **sem** botão de aplicar.
- Quando `previa.tipo === 'frase-inteira'`, a linha mostra o mesmo aviso que a gaveta de revisão usa (proposta bem mais curta que a frase) e o botão pede confirmação. Copie o texto do aviso de `web/src/componentes/GavetaRevisao.tsx` — não escreva outro.
- **Aplicar os marcados** no pé, aplicando em sequência e parando no primeiro erro, com o erro visível.

- [ ] **Step 2: A tela das edições manuais**

`EdicoesManuais.tsx` — agrupa por `rota`, com contagem em cada grupo e, dentro, uma linha por edição mostrando `de → para` e a frase. Cada rota traz uma frase curta dizendo o que fazer com ela:

| rota | o que a tela diz |
|---|---|
| `tipografia` | "Diferença só de aspas ou ênfase. Não ensina nada — está aqui para você conferir que é isso mesmo." |
| `glossario` | "Termo do glossário que derivou. Resolve-se na varredura de consistência, não no prompt." |
| `chave-estilo` | "O modelo desobedeceu uma chave da Seção 5. Ou a chave está errada, ou é caso para o passe de estilo." |
| `nucleo` | "Falha universal do zh→pt-BR, não específica desta obra. Candidata ao catálogo de erros comuns." |
| `diretriz` | "Sem dono em nenhuma camada — é o que pode virar diretriz da obra." |

Só o grupo `diretriz` traz o botão **Incluir no próximo refinamento**, que leva à tela do Prompt Mãe. Sem esse botão a mineração vira relatório que ninguém lê.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm -w web run test && npm run build`
Expected: PASS nos três.

Depois, com `npm run dev`: abra um capítulo com violação de estilo, rode o passe, aplique uma correção e confirme que a frase mudou e que a violação sumiu da varredura. Depois abra a tela de edições manuais da obra e confira que os grupos batem com o que você espera.

- [ ] **Step 4: Commit**

```bash
git add web/src/paginas/PasseEstilo.tsx web/src/paginas/EdicoesManuais.tsx web/src/App.tsx web/src/paginas/EditorCapitulo.tsx web/src/paginas/ObraLayout.tsx
git commit -m "As telas do passe e das edições manuais

O passe fecha o laço: a varredura apontava e não ajudava a consertar. E a tela de
edições agrupa por rota porque a contagem sozinha não diz o que fazer — só o
grupo 'diretriz' oferece o botão que leva ao refinamento."
```

---

## Depois do plano

- **Catálogo universal de erros zh→pt-BR**: a rota `nucleo` da Task 6 é a matéria-prima. Spec próprio.
- **Varredura de consistência na obra inteira**: a rota `glossario` aponta para ela. Spec próprio.
- Subir com `npm run subir`, que roda typecheck + testes + build e faz backup verificado do banco antes de migrar.
