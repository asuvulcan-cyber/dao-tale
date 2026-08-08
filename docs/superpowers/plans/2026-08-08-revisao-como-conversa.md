# A Revisão Vira Conversa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Protocolo de Revisão passa a responder ao motivo declarado da dúvida, aceita réplica sem reiniciar, e permite recusar o veredito — e o rótulo de regra passa a saber a que camada do prompt pertence.

**Architecture:** SQLite local (better-sqlite3) com migrações versionadas em `.sql`; servidor Hono em TypeScript; front React + TanStack Query. A revisão é uma chamada estruturada a um provedor de IA, validada por Zod e gravada em `banco_testes`. Este trabalho acrescenta um campo `resposta` ao contrato, encadeia casos por `caso_pai_id`, e liga o rótulo de regra ao registro de temas (`shared/src/temasDoPrompt.ts`), que já sabe qual camada é dona de cada assunto.

**Tech Stack:** TypeScript, Node 22, better-sqlite3, Hono, Zod, Vitest, React 19, TanStack Query, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-08-revisao-como-conversa-design.md`

## Global Constraints

- **Monorepo npm workspaces:** `shared`, `server`, `web`. Import entre pacotes por `@dao-tale/shared`. Imports relativos dentro de um pacote **sempre com extensão `.js`** (ESM + tsx), mesmo apontando para `.ts`.
- **Testes:** `npm -w server run test` e `npm -w web run test` (Vitest). Tipos: `npm run typecheck` (roda os dois workspaces).
- **Banco em teste:** `abrirBanco(':memory:')` de `server/src/db/index.js` aplica todas as migrações. Nenhum teste toca banco em disco.
- **Migrações são imutáveis.** Nunca editar um `.sql` já numerado; criar o próximo número.
- **SQLite não altera `CHECK` nem `NOT NULL`.** Mudança nesses exige reconstrução de tabela, no padrão de `server/src/db/migrations/007_fase_e_status_parcial.sql`.
- **Idioma:** todo comentário, mensagem de erro e texto de UI em português do Brasil. Comentário explica **por quê**, não o quê.
- **Camadas do prompt:** Alfa = universal zh→pt-BR; Beta = chaves de estilo; Delta = diretrizes da obra. Nenhuma tarefa aqui corta versão nova de Alfa.
- **Nunca renomear** `prompts.tipo = 'delta'`, `{{DELTA_OBRA}}` ou `{{PREFERENCIAS_OBRA}}`: estão gravados dentro de versões de núcleo imutáveis.
- **Commits:** um por tarefa, mensagem em português, corpo explicando o porquê.

---

## Ordem e dependências

```
Task 2  →  Task 3  →  Task 4  ┐
        →  Task 5             ├→  Task 9
Task 6  →  Task 7             ┘
Task 2  →  Task 8
```

A numeração das tarefas 2–9 é preservada de propósito: a Task 1 foi **removida** (ver
abaixo) e renumerar quebraria as referências cruzadas dos testes e dos commits.

---

### Task 1: REMOVIDA — o gatilho 一直 virou trabalho de núcleo

Esta tarefa acrescentaria 一直 à lista de gatilhos da chave Beta `mais_que_perfeito`.
**Seria o conserto errado.** A apuração completa vai para um spec próprio, "Núcleo v3.1 —
partículas e anterioridade"; o resumo abaixo basta para ninguém reintroduzir esta tarefa
por engano.

Em resumo: a tabela de partículas polissêmicas do prompt *completo*
(`server/src/db/promptPadraoInicial.ts:186`) trazia a linha
*"**一直** · padrão a evitar: confundir com 总 · continuidade ininterrupta e concreta"*.
O **núcleo enxuto** — o Alfa v3.0 ativo no VPS, 6203 chars — comprimiu as 9 linhas da
tabela numa única bala que nomeia as partículas sem dizer o que fazer com cada uma. Em
#24 o modelo glosou 一直 como "(sempre)", que é a glosa de 总: cometeu ao pé da letra o
erro que a linha apagada nomeava.

Além disso, a lista de gatilhos que esta tarefa editaria (曾经, 已经, 从来, 向来, 从小,
自幼, 早已, 过) vive na **Beta** e faz trabalho de **Alfa**: dizer o que um advérbio
chinês significa é universal. Acrescentar 一直 ali aprofundaria a sobreposição entre
camadas — o modo de falha nº 1 da skill `camadas-do-prompt`, e a explicação de #23/#24
terem sido decididos nos dois sentidos com três minutos de diferença.

O conserto certo é versão nova de Alfa com a tabela restaurada, e a chave Beta passando a
**remeter** ao núcleo em vez de ler chinês. Isso pede corte de versão imutável e medição
A/B própria, e por isso saiu deste plano.

---

### Task 2: Migração 022 e os tipos do caso de teste

Reconstrói `banco_testes` com o fio, o terceiro veredito, a recusa e o campo `resposta`. Sem isto nada mais deste plano compila.

**Files:**
- Create: `server/src/db/migrations/022_revisao_conversa.sql`
- Modify: `shared/src/index.ts` (tipos `Veredito`, `StatusCasoTeste`, `CasoTeste`)
- Modify: `server/src/db/repos.ts:1005-1040` (`reposTestes.criar`)
- Test: `server/src/db/migracao022.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type Veredito = 'correto' | 'incorreto' | 'escolha-legitima'`
  - `type StatusCasoTeste = 'confirmado' | 'corrigido' | 'pendente' | 'regra-nova-necessaria' | 'rejeitado'`
  - `CasoTeste` ganha `caso_pai_id: number | null`, `resposta: string`, `motivo_rejeicao: string | null`; `justificativa` continua `string`; `secao_regra` continua `string | null`.
  - `reposTestes.criar(db, dados)` aceita `caso_pai_id?: number | null` e `resposta: string`.

- [ ] **Step 1: Write the failing test**

Create `server/src/db/migracao022.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { abrirBanco } from './index.js';

describe('migração 022', () => {
  it('cria as colunas do fio, da resposta e da recusa', () => {
    const db = abrirBanco(':memory:');
    const colunas = (db.pragma('table_info(banco_testes)') as { name: string }[]).map((c) => c.name);
    for (const nova of ['caso_pai_id', 'resposta', 'motivo_rejeicao']) {
      expect(colunas).toContain(nova);
    }
  });

  it('aceita o veredito escolha-legitima e o status rejeitado', () => {
    const db = abrirBanco(':memory:');
    // Insere direto para exercitar o CHECK, sem passar pelos repos.
    const inserir = () =>
      db
        .prepare(
          `INSERT INTO banco_testes (frase_id, obra_id, trecho_zh, pergunta, veredito,
             resposta, justificativa, status, provedor, modelo, resposta_bruta)
           VALUES (NULL, NULL, 'z', 'p', 'escolha-legitima', 'r', '', 'rejeitado', 'mock', 'm', '{}')`,
        )
        .run();
    // frase_id/obra_id são NOT NULL: o CHECK de veredito/status é avaliado antes,
    // então um CHECK antigo falharia com "CHECK constraint failed", não com NOT NULL.
    expect(inserir).toThrowError(/NOT NULL/);
  });

  it('preserva os índices da tabela original', () => {
    const db = abrirBanco(':memory:');
    const indices = (db.pragma('index_list(banco_testes)') as { name: string }[]).map((i) => i.name);
    expect(indices).toContain('idx_testes_obra_status');
    expect(indices).toContain('idx_testes_secao');
    expect(indices).toContain('idx_testes_pai');
  });

  it('escolha-legitima nasce confirmado, como correto', () => {
    // Só 'incorreto' abre pendência: o terceiro veredito diz que não há o que
    // fazer, e nascer 'pendente' o faria contar como lacuna sistemática.
    const db = abrirBanco(':memory:');
    const obraId = reposObras.criar(db, { titulo: 'Obra' }).id;
    const cap = reposCapitulos.criar(db, obraId, { numero: 1, texto_origem: '甲说。' }, [
      { texto_zh: '甲说。', paragrafo: 0 },
    ]);
    const fraseId = reposFrases.listarPorCapitulo(db, cap.id)[0].id;
    const comum = {
      frase_id: fraseId, obra_id: obraId, caso_pai_id: null, trecho_zh: '甲', pergunta: 'p',
      resposta: 'r', justificativa: '', secao_regra: null, correcao_proposta: null,
      trecho_pt_errado: null, trecho_pt_corrigido: null, motivo_rejeicao: null,
      provedor: 'mock', modelo: 'mock-v1', resposta_bruta: '{}',
    } as const;
    expect(reposTestes.criar(db, { ...comum, veredito: 'escolha-legitima' }).status).toBe('confirmado');
    expect(reposTestes.criar(db, { ...comum, veredito: 'correto' }).status).toBe('confirmado');
    expect(reposTestes.criar(db, { ...comum, veredito: 'incorreto' }).status).toBe('pendente');
  });
});
```

O import do topo do arquivo precisa de
`import { reposCapitulos, reposFrases, reposObras, reposTestes } from './repos.js';`.
Este último `it` só passa depois do Step 6 — é esperado que falhe nos Steps 2–4.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w server run test -- migracao022`
Expected: FAIL — `expected [ … ] to contain 'caso_pai_id'`.

- [ ] **Step 3: Write the migration**

Create `server/src/db/migrations/022_revisao_conversa.sql`:

```sql
-- A revisão vira conversa: fio de réplicas, terceiro veredito e recusa com motivo.
--
-- Três mudanças precisam de rebuild (o SQLite não altera CHECK nem NOT NULL), então
-- vão juntas — padrão da migração 002/007.
--
-- `resposta` nasce com o valor de `justificativa`: o texto que existe É a resposta que
-- houve, e assim o histórico não aparece vazio na tela nova.
--
-- `secao_regra = 'geral'` vira NULL. "Geral" quer dizer, no próprio contrato, "nenhuma
-- regra específica se aplica" — contá-lo como recorrência agrupava coisas sem relação
-- (5 casos na 死人经, 3 deles contando como lacuna sistemática). `recorrencias` já exige
-- IS NOT NULL, então a exclusão sai de graça.
--
-- A auto-referência aponta para `banco_testes` (o nome FINAL), não para a tabela _novo:
-- o SQLite não resolve alvo de FK no CREATE, e assim o schema já sai correto do RENAME
-- em vez de depender de o rename reescrever a referência.

CREATE TABLE banco_testes_novo (
  id                 INTEGER PRIMARY KEY,
  frase_id           INTEGER NOT NULL REFERENCES frases(id) ON DELETE CASCADE,
  obra_id            INTEGER NOT NULL REFERENCES obras(id)  ON DELETE CASCADE,
  -- Turno anterior do fio. NULL = raiz (a pergunta original).
  caso_pai_id        INTEGER REFERENCES banco_testes(id) ON DELETE CASCADE,
  trecho_zh          TEXT NOT NULL,
  pergunta           TEXT NOT NULL,
  veredito           TEXT NOT NULL CHECK (veredito IN ('correto','incorreto','escolha-legitima')),
  -- Trata do motivo declarado na pergunta. É o texto que o revisor lê primeiro.
  resposta           TEXT NOT NULL DEFAULT '',
  -- Só existe quando uma REGRA decide o caso; par natural de secao_regra.
  justificativa      TEXT NOT NULL DEFAULT '',
  secao_regra        TEXT,
  correcao_proposta  TEXT,
  trecho_pt_errado   TEXT,
  trecho_pt_corrigido TEXT,
  status             TEXT NOT NULL DEFAULT 'pendente'
                     CHECK (status IN ('confirmado','corrigido','pendente','regra-nova-necessaria','rejeitado')),
  -- Por que o revisor recusou o veredito. É o único lugar do app onde ele diz
  -- por escrito que a IA errou — entra como insumo do refinamento do prompt.
  motivo_rejeicao    TEXT,
  provedor           TEXT NOT NULL,
  modelo             TEXT NOT NULL,
  resposta_bruta     TEXT NOT NULL,
  criado_em          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO banco_testes_novo
  (id, frase_id, obra_id, caso_pai_id, trecho_zh, pergunta, veredito, resposta, justificativa,
   secao_regra, correcao_proposta, trecho_pt_errado, trecho_pt_corrigido, status,
   motivo_rejeicao, provedor, modelo, resposta_bruta, criado_em)
  SELECT id, frase_id, obra_id, NULL, trecho_zh, pergunta, veredito,
         justificativa,
         justificativa,
         CASE WHEN secao_regra = 'geral' THEN NULL ELSE secao_regra END,
         correcao_proposta, trecho_pt_errado, trecho_pt_corrigido, status,
         NULL, provedor, modelo, resposta_bruta, criado_em
  FROM banco_testes;

DROP TABLE banco_testes;
ALTER TABLE banco_testes_novo RENAME TO banco_testes;

CREATE INDEX idx_testes_obra_status ON banco_testes(obra_id, status);
CREATE INDEX idx_testes_secao       ON banco_testes(obra_id, secao_regra);
CREATE INDEX idx_testes_pai         ON banco_testes(caso_pai_id);
```

- [ ] **Step 4: Run the migration test**

Run: `npm -w server run test -- migracao022`
Expected: PASS nos três.

- [ ] **Step 5: Update the shared types**

Em `shared/src/index.ts`:

```ts
// 'escolha-legitima': a tradução não está errada, mas também não é a única leitura
// defensável. Sem ela isso era espremido em 'correto' com uma regra inventada em cima.
export type Veredito = 'correto' | 'incorreto' | 'escolha-legitima';

export type StatusCasoTeste =
  | 'confirmado'
  | 'corrigido'
  | 'pendente'
  | 'regra-nova-necessaria'
  // O revisor discordou do veredito. Sai das recorrências e dos rótulos oferecidos
  // ao modelo: veredito recusado não deve continuar empurrando regra nova.
  | 'rejeitado';
```

E em `interface CasoTeste`:

```ts
export interface CasoTeste {
  id: number;
  frase_id: number;
  obra_id: number;
  /** Turno anterior do fio; null = raiz. */
  caso_pai_id: number | null;
  trecho_zh: string;
  pergunta: string;
  veredito: Veredito;
  /** Trata do motivo declarado na pergunta. Texto principal na tela. */
  resposta: string;
  /** Só quando uma regra decide o caso; '' caso contrário. */
  justificativa: string;
  secao_regra: string | null;
  correcao_proposta: string | null;
  trecho_pt_errado: string | null;
  trecho_pt_corrigido: string | null;
  status: StatusCasoTeste;
  motivo_rejeicao: string | null;
  provedor: string;
  modelo: string;
  criado_em: string;
}
```

- [ ] **Step 6: Update `reposTestes.criar`**

Em `server/src/db/repos.ts`, a assinatura já é `Omit<CasoTeste, 'id' | 'criado_em' | 'status'>`, então os campos novos entram sozinhos nos tipos. Ajuste o corpo:

```ts
    // 'escolha-legitima' nasce confirmado, como 'correto': não há o que fazer.
    const status: StatusCasoTeste = dados.veredito === 'incorreto' ? 'pendente' : 'confirmado';
```

e acrescente `caso_pai_id`, `resposta` e `motivo_rejeicao` ao `INSERT` e ao `.run(...)`, na mesma ordem das colunas.

- [ ] **Step 7: Run the whole suite and typecheck**

Run: `npm run typecheck && npm -w server run test`
Expected: PASS. Os erros de tipo que aparecerem serão em chamadores de `reposTestes.criar` que ainda não passam `resposta`/`caso_pai_id`/`motivo_rejeicao` (testes existentes, `frases.ts`, `portabilidade.ts`). Conserte-os passando `resposta: ''`, `caso_pai_id: null`, `motivo_rejeicao: null` — os valores certos entram nas tarefas seguintes.

- [ ] **Step 8: Commit**

```bash
git add server/src/db/migrations/022_revisao_conversa.sql server/src/db/migracao022.test.ts shared/src/index.ts server/src/db/repos.ts
git commit -m "Migração 022: banco_testes ganha fio, resposta e recusa

Rebuild da tabela porque CHECK e NOT NULL não se alteram no SQLite. Os casos
antigos migram com resposta = justificativa (o texto que existe é a resposta que
houve) e secao_regra 'geral' virando NULL — 'geral' significa 'nenhuma regra se
aplica', e contá-lo como recorrência juntava coisas sem relação."
```

---

### Task 3: O contrato da revisão

O modelo passa a responder ao motivo declarado em vez de ser obrigado a citar uma regra.

**Files:**
- Modify: `shared/src/index.ts` (`RespostaRevisao`)
- Modify: `server/src/ia/respostas.ts:35-48`
- Modify: `server/src/ia/contratos.ts:192-217`
- Modify: `server/src/ia/prompts.ts:189-254`
- Modify: `server/src/ia/mock.ts:204-231`
- Modify: `server/src/rotas/frases.ts:202-216`
- Test: `server/src/ia/contratoRevisao.test.ts`

**Interfaces:**
- Consumes: `Veredito` da Task 2.
- Produces:
  - `RespostaRevisao` ganha `resposta: string`; `secao_regra` vira `string | null`.
  - `respostaRevisaoSchema` normaliza `secao_regra` vazio ou `'geral'` para `null`.

- [ ] **Step 1: Write the failing test**

Create `server/src/ia/contratoRevisao.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { respostaRevisaoSchema } from './respostas.js';
import { CONTRATO_REVISAO } from './contratos.js';
import { sistemaRevisao, usuarioRevisao } from './prompts.js';

const base = {
  omega: 'PROMPT DA OBRA',
  glossario: [],
  vizinhasAntes: [],
  vizinhasDepois: [],
  frase: { texto_zh: '他还一直以为', texto_pt: 'Ele sempre achou', texto_pt_original_ia: null },
  pergunta: 'Sempre achou? 以为 carrega "presumir", e 一直 não é um "sempre" atemporal.',
};

describe('contrato da revisão', () => {
  it('exige resposta e aceita ausência de regra', () => {
    const r = respostaRevisaoSchema.parse({
      trecho_zh: '一直以为',
      veredito: 'escolha-legitima',
      resposta: 'Seu motivo procede: 以为 traz a crença equivocada.',
    });
    expect(r.resposta).toContain('procede');
    expect(r.secao_regra).toBeNull();
    expect(r.justificativa).toBe('');
  });

  it('trata "geral" e string vazia como ausência de regra', () => {
    expect(respostaRevisaoSchema.parse({ trecho_zh: 'z', veredito: 'correto', resposta: 'r', secao_regra: 'geral' }).secao_regra).toBeNull();
    expect(respostaRevisaoSchema.parse({ trecho_zh: 'z', veredito: 'correto', resposta: 'r', secao_regra: '  ' }).secao_regra).toBeNull();
  });

  it('rejeita resposta ausente', () => {
    expect(() => respostaRevisaoSchema.parse({ trecho_zh: 'z', veredito: 'correto' })).toThrow();
  });

  it('o schema da ferramenta pede resposta e não pede secao_regra', () => {
    expect(CONTRATO_REVISAO.schema.required).toContain('resposta');
    expect(CONTRATO_REVISAO.schema.required).not.toContain('secao_regra');
    expect(CONTRATO_REVISAO.schema.properties.veredito.enum).toContain('escolha-legitima');
  });

  it('as instruções tratam a pergunta como premissa, não como endereço', () => {
    const sistema = sistemaRevisao(base);
    expect(sistema).toContain('premissa');
    expect(sistema).toMatch(/nunca substitua o motivo do usu[áa]rio/i);
    // A obrigação de citar regra era o que produzia justificativa sobre assunto
    // que o revisor não levantou (casos #23/#24).
    expect(sistema).not.toContain('citando a regra/seção do prompt da obra aplicável');
  });

  it('a pergunta do usuário vem com moldura', () => {
    expect(usuarioRevisao({ ...base, rotulosConhecidos: [] })).toContain('a premissa da sua análise');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w server run test -- contratoRevisao`
Expected: FAIL já no primeiro — `secao_regra` volta `'geral'` por causa do `.default('geral')`.

- [ ] **Step 3: Update the Zod schema**

Em `server/src/ia/respostas.ts`, substitua `respostaRevisaoSchema`:

```ts
export const respostaRevisaoSchema = z.object({
  trecho_zh: z.string(),
  veredito: z.enum(['correto', 'incorreto', 'escolha-legitima']),
  // O texto que trata do motivo declarado na pergunta. Obrigatório: era a
  // ausência dele que fazia a justificativa virar sobre outro assunto.
  resposta: z.string(),
  // '' quando nenhuma regra decide o caso. Par natural de secao_regra.
  justificativa: z.string().default(''),
  // 'geral' era o valor de fuga do contrato antigo e virava recorrência falsa:
  // três dúvidas sem relação contadas como uma lacuna sistemática.
  secao_regra: z
    .string()
    .nullable()
    .default(null)
    .transform((s) => {
      const t = s?.trim();
      return t && t.toLowerCase() !== 'geral' ? t : null;
    }),
  correcao_proposta: z.string().nullable().default(null),
  trecho_pt_errado: z.string().nullable().default(null),
  trecho_pt_corrigido: z.string().nullable().default(null),
});
```

- [ ] **Step 4: Update the tool contract**

Em `server/src/ia/contratos.ts`, `CONTRATO_REVISAO`:

```ts
  schema: {
    type: 'object',
    properties: {
      trecho_zh: { type: 'string', description: 'trecho exato do chinês que fundamenta a análise' },
      veredito: { type: 'string', enum: ['correto', 'incorreto', 'escolha-legitima'] },
      resposta: {
        type: 'string',
        description: 'a resposta à dúvida, tratando do motivo que o usuário declarou',
      },
      justificativa: {
        type: 'string',
        description: 'só quando uma REGRA do prompt decide o caso; string vazia caso contrário',
      },
      secao_regra: {
        type: ['string', 'null'],
        description: "id curto da regra citada (ex.: '3.2-nomes-proprios'); null quando não há regra",
      },
      correcao_proposta: { type: ['string', 'null'], description: 'frase corrigida completa em PT-BR' },
      trecho_pt_errado: {
        type: ['string', 'null'],
        description: 'o MENOR trecho da tradução atual que precisa mudar, copiado LETRA POR LETRA dela',
      },
      trecho_pt_corrigido: { type: ['string', 'null'], description: 'o que esse trecho deve virar' },
    },
    required: ['trecho_zh', 'veredito', 'resposta'],
  },
  notasInstrucao: [
    'Use null em correcao_proposta quando o veredito NÃO for "incorreto".',
    'Deixe secao_regra em null e justificativa em "" quando nenhuma regra do prompt decidir o caso — é o caso mais comum.',
    'trecho_pt_errado tem de ser uma cópia EXATA de um pedaço da tradução atual (mesmos acentos, mesma pontuação, mesmas aspas), curto: só o que muda, sem a frase em volta. É por ele que a correção é aplicada, trocando apenas aquele pedaço.',
    'NÃO inclua as aspas, o travessão ou a pontuação final da frase no trecho, a menos que sejam eles o erro.',
  ],
```

- [ ] **Step 5: Rewrite the operational instructions**

Em `server/src/ia/prompts.ts`, no array de `sistemaRevisaoPartes`, substitua da linha `'Responda exclusivamente pelo formato estruturado, preenchendo:'` até o fim do array por:

```ts
    'Você é o revisor da tradução acima descrita. O usuário questionará uma escolha de tradução de UMA frase específica.',
    'A PERGUNTA DO USUÁRIO é a premissa da sua análise, não apenas o endereço da frase.',
    'Se a pergunta declara um motivo ("o original diz X", "isto soa Y", "no capítulo anterior ficou Z"), sua resposta DEVE tratar desse motivo — confirmando-o ou refutando-o pelo texto-fonte chinês. Nunca substitua o motivo do usuário por outro argumento.',
    'Se o motivo dele não procede, diga isso e mostre onde no chinês. Concordar por concordar é pior que discordar.',
    'Responda exclusivamente pelo formato estruturado, preenchendo:',
    '- trecho_zh: o trecho EXATO do chinês que fundamenta sua análise;',
    '- resposta: a resposta à dúvida, endereçando o motivo declarado. É o que o revisor lê primeiro;',
    '- veredito: "correto" se a tradução atual está adequada; "incorreto" se precisa de correção; "escolha-legitima" quando ela não está errada mas também não é a única leitura defensável (o que está em jogo é preferência, não regra);',
    '- secao_regra: identificador curto e estável da regra, SOMENTE quando uma regra do prompt é o que decide o caso. Caso contrário, null — a maior parte das dúvidas de tradução não tem regra por trás, e forçar uma faz a resposta ficar sobre um assunto que o usuário não levantou;',
    '- justificativa: a regra e por que ela se aplica. String vazia quando secao_regra for null;',
    '- correcao_proposta: a frase COMPLETA corrigida em PT-BR se veredito for "incorreto"; null nos demais.',
    '- trecho_pt_errado: o MENOR pedaço da tradução ATUAL que precisa mudar, copiado dela letra por letra (mesmos acentos e pontuação). É por ele que a correção é aplicada: o app troca SÓ esse pedaço e conserva todo o resto da frase.',
    '- trecho_pt_corrigido: o que esse pedaço deve virar.',
    '- Não inclua aspas de diálogo, travessão nem a pontuação final da frase no trecho, a menos que o erro seja justamente essa marca. Se o problema for a frase inteira (ordem das orações, sentido trocado), aí sim o trecho pode ser a frase toda.',
```

E em `usuarioRevisao`, troque a linha do cabeçalho da pergunta:

```ts
  partes.push('### PERGUNTA DO USUÁRIO (a premissa da sua análise — trate do motivo que ela declara):');
```

- [ ] **Step 6: Update the mock provider**

Em `server/src/ia/mock.ts`, `revisarFrase`. O mock é o provedor dos testes: precisa devolver `resposta` e exercitar os três vereditos.

```ts
  async revisarFrase(_chave, req: RequisicaoRevisao) {
    await espera(latenciaMs());
    const pareceErro = /errad|incorret|estranh|dúvida|duvido|não seria/i.test(req.pergunta);
    // "preferência"/"soa melhor" exercita o terceiro veredito, que não existia.
    const preferencia = /prefer|soa melhor|gosto|estilo/i.test(req.pergunta);
    const trecho_zh = [...req.frase.texto_zh].slice(0, 8).join('');
    const dados = pareceErro
      ? {
          trecho_zh,
          veredito: 'incorreto' as const,
          resposta: '[simulado] O motivo que você deu procede: o original sustenta a leitura alternativa.',
          justificativa: '[simulado] A escolha diverge da regra de consistência do glossário.',
          secao_regra: 'mock-1.1-consistencia' as string | null,
          correcao_proposta: `[correção simulada] ${req.frase.texto_pt || req.frase.texto_zh}`,
          trecho_pt_errado: (req.frase.texto_pt ?? '').split(/\s+/)[0] || null,
          trecho_pt_corrigido: '[trecho simulado]',
        }
      : preferencia
        ? {
            trecho_zh,
            veredito: 'escolha-legitima' as const,
            resposta: '[simulado] As duas leituras se defendem; o original não desempata.',
            justificativa: '',
            secao_regra: null as string | null,
            correcao_proposta: null,
            trecho_pt_errado: null,
            trecho_pt_corrigido: null,
          }
        : {
            trecho_zh,
            veredito: 'correto' as const,
            resposta: '[simulado] O motivo que você levantou não se sustenta no texto-fonte.',
            justificativa: '',
            secao_regra: null as string | null,
            correcao_proposta: null,
            trecho_pt_errado: null,
            trecho_pt_corrigido: null,
          };
    return { ...dados, bruta: JSON.stringify(dados), uso: usoSimulado('revisao', req, dados) };
  },
```

- [ ] **Step 7: Wire the route**

Em `server/src/rotas/frases.ts`, no `reposTestes.criar` da rota `/frases/:id/revisar`, acrescente ao objeto:

```ts
        caso_pai_id: null,
        resposta: resposta.resposta,
        motivo_rejeicao: null,
```

(o `caso_pai_id` de verdade chega na Task 4).

E em `shared/src/index.ts`, `RespostaRevisao`:

```ts
export interface RespostaRevisao {
  trecho_zh: string;
  veredito: Veredito;
  /** Trata do motivo declarado na pergunta. Texto principal na tela. */
  resposta: string;
  /** Só quando uma regra decide o caso; '' caso contrário. */
  justificativa: string;
  secao_regra: string | null;
  correcao_proposta: string | null;
  trecho_pt_errado?: string | null;
  trecho_pt_corrigido?: string | null;
}
```

- [ ] **Step 8: Run everything**

Run: `npm run typecheck && npm -w server run test`
Expected: PASS. `server/src/ia/prompts.test.ts` e `server/src/ia/contratos.test.ts` provavelmente falham por asserção sobre o texto antigo — atualize as asserções, **não** o código novo, e confira que cada uma continua testando a mesma intenção.

- [ ] **Step 9: Commit**

```bash
git add shared/src/index.ts server/src/ia server/src/rotas/frases.ts
git commit -m "Contrato da revisão: responder à dúvida, não citar regra a todo custo

justificativa era definida como 'explicação citando a regra aplicável' e
secao_regra era obrigatório: o modelo tinha que sair com uma regra na mão, e
quando a dúvida não era de regra ele pegava a que desse. Agora `resposta` é o
campo obrigatório e trata do motivo declarado; regra e justificativa só existem
quando a regra é o que decide. 'escolha-legitima' dá saída honesta ao caso em
que as duas leituras se defendem."
```

---

### Task 4: O fio de réplicas

**Files:**
- Modify: `server/src/db/repos.ts` (`reposTestes`: `fio`, `temFilho`)
- Modify: `server/src/ia/provedor.ts:99-115` (`RequisicaoRevisao`)
- Modify: `server/src/ia/prompts.ts` (`usuarioRevisao`, instruções)
- Modify: `server/src/rotas/frases.ts:14-18, 113-223`
- Test: `server/src/rotas/fioRevisao.test.ts`

**Interfaces:**
- Consumes: `CasoTeste.caso_pai_id` (Task 2), `RespostaRevisao.resposta` (Task 3).
- Produces:
  - `reposTestes.fio(db, casoId): CasoTeste[]` — raiz→folha, inclusive o próprio.
  - `reposTestes.temFilho(db, casoId): boolean`
  - `RequisicaoRevisao.turnosAnteriores?: TurnoRevisao[]` com
    `TurnoRevisao = { pergunta: string; resposta: string; veredito: string; secao_regra: string | null; correcao_proposta: string | null; recusado: boolean; motivo_rejeicao: string | null }`
  - `POST /frases/:id/revisar` aceita `caso_pai_id?: number`.

- [ ] **Step 1: Write the failing test**

Create `server/src/rotas/fioRevisao.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { abrirBanco, type BancoDados } from '../db/index.js';
import { reposCapitulos, reposFrases, reposObras, reposTestes } from '../db/repos.js';

let db: BancoDados;
let obraId: number;
let fraseId: number;

beforeEach(() => {
  db = abrirBanco(':memory:');
  obraId = reposObras.criar(db, { titulo: 'Obra' }).id;
  const cap = reposCapitulos.criar(db, obraId, { numero: 1, texto_origem: '甲说。' }, [
    { texto_zh: '甲说。', paragrafo: 0 },
  ]);
  fraseId = reposFrases.listarPorCapitulo(db, cap.id)[0].id;
});

function caso(pergunta: string, pai: number | null) {
  return reposTestes.criar(db, {
    frase_id: fraseId,
    obra_id: obraId,
    caso_pai_id: pai,
    trecho_zh: '甲',
    pergunta,
    veredito: 'incorreto',
    resposta: `resposta de ${pergunta}`,
    justificativa: '',
    secao_regra: null,
    correcao_proposta: null,
    trecho_pt_errado: null,
    trecho_pt_corrigido: null,
    motivo_rejeicao: null,
    provedor: 'mock',
    modelo: 'mock-v1',
    resposta_bruta: '{}',
  });
}

describe('fio de réplicas', () => {
  it('devolve a cadeia da raiz até a folha', () => {
    const a = caso('primeira', null);
    const b = caso('segunda', a.id);
    const c = caso('terceira', b.id);
    expect(reposTestes.fio(db, c.id).map((x) => x.pergunta)).toEqual(['primeira', 'segunda', 'terceira']);
  });

  it('sabe quem tem filho', () => {
    const a = caso('primeira', null);
    const b = caso('segunda', a.id);
    expect(reposTestes.temFilho(db, a.id)).toBe(true);
    expect(reposTestes.temFilho(db, b.id)).toBe(false);
  });

  it('apagar a raiz leva o fio inteiro (ON DELETE CASCADE)', () => {
    const a = caso('primeira', null);
    const b = caso('segunda', a.id);
    db.prepare('DELETE FROM banco_testes WHERE id = ?').run(a.id);
    expect(reposTestes.obter(db, b.id)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w server run test -- fioRevisao`
Expected: FAIL — `reposTestes.fio is not a function`.

- [ ] **Step 3: Implement the repo functions**

Em `server/src/db/repos.ts`, dentro de `reposTestes`:

```ts
  /** A cadeia de réplicas da raiz até o caso dado, inclusive. Recursiva por
      caso_pai_id — sem ela a segunda pergunta sobre a mesma frase não sabe o que
      a primeira respondeu, e o modelo já devolveu vereditos opostos por isso. */
  fio(db: BancoDados, casoId: number): CasoTeste[] {
    return db
      .prepare(
        `WITH RECURSIVE cadeia(id) AS (
           SELECT ?
           UNION ALL
           SELECT t.caso_pai_id FROM banco_testes t JOIN cadeia c ON t.id = c.id
           WHERE t.caso_pai_id IS NOT NULL
         )
         SELECT b.* FROM banco_testes b JOIN cadeia ON b.id = cadeia.id
         ORDER BY b.criado_em, b.id`,
      )
      .all(casoId) as CasoTeste[];
  },

  temFilho(db: BancoDados, casoId: number): boolean {
    const l = db.prepare('SELECT 1 n FROM banco_testes WHERE caso_pai_id = ? LIMIT 1').get(casoId);
    return l !== undefined;
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm -w server run test -- fioRevisao`
Expected: PASS nos três.

- [ ] **Step 5: Write the failing route test**

Acrescente a `server/src/rotas/fioRevisao.test.ts`:

```ts
import { montarTurnos, TETO_TURNOS } from './frases.js';

describe('turnos enviados ao modelo', () => {
  it('converte o fio em turnos, do mais antigo ao mais recente', () => {
    const a = caso('primeira', null);
    const b = caso('segunda', a.id);
    const turnos = montarTurnos(reposTestes.fio(db, b.id));
    expect(turnos.map((t) => t.pergunta)).toEqual(['primeira', 'segunda']);
    expect(turnos[0].resposta).toBe('resposta de primeira');
    expect(turnos[0].recusado).toBe(false);
  });

  it('acima do teto mantém o primeiro turno e os mais recentes', () => {
    let pai: number | null = null;
    for (let i = 1; i <= 9; i++) pai = caso(`p${i}`, pai).id;
    const turnos = montarTurnos(reposTestes.fio(db, pai!));
    expect(turnos).toHaveLength(TETO_TURNOS);
    // O primeiro fixa a dúvida; os demais são os mais recentes.
    expect(turnos[0].pergunta).toBe('p1');
    expect(turnos.at(-1)!.pergunta).toBe('p9');
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm -w server run test -- fioRevisao`
Expected: FAIL — `montarTurnos` não é exportado por `frases.ts`.

- [ ] **Step 7: Implement `montarTurnos` and the route**

Em `server/src/rotas/frases.ts`, no topo do arquivo:

```ts
/** Teto de turnos enviados ao modelo. Sem ele uma discussão longa cresce o prompt
    sem limite e estoura o desenho de cache. Mantém o PRIMEIRO (que fixa a dúvida)
    e os mais recentes. */
export const TETO_TURNOS = 6;

export interface TurnoRevisao {
  pergunta: string;
  resposta: string;
  veredito: string;
  secao_regra: string | null;
  correcao_proposta: string | null;
  recusado: boolean;
  motivo_rejeicao: string | null;
}

export function montarTurnos(fio: CasoTeste[]): TurnoRevisao[] {
  const turnos = fio.map((c) => ({
    pergunta: c.pergunta,
    resposta: c.resposta,
    veredito: c.veredito,
    secao_regra: c.secao_regra,
    correcao_proposta: c.correcao_proposta,
    recusado: c.status === 'rejeitado',
    motivo_rejeicao: c.motivo_rejeicao,
  }));
  if (turnos.length <= TETO_TURNOS) return turnos;
  return [turnos[0], ...turnos.slice(-(TETO_TURNOS - 1))];
}
```

Importe `CasoTeste` de `@dao-tale/shared`.

No `revisarSchema`, acrescente `caso_pai_id: z.number().int().optional()`.

Na rota, depois de obter `frase` e antes da chamada ao provedor:

```ts
    let turnosAnteriores: TurnoRevisao[] | undefined;
    let omitidos = 0;
    if (corpo.data.caso_pai_id !== undefined) {
      const pai = reposTestes.obter(db, corpo.data.caso_pai_id);
      if (!pai || pai.frase_id !== frase.id) {
        return c.json({ erro: { codigo: 'pai-invalido', mensagem: 'O caso anterior não existe ou é de outra frase.' } }, 400);
      }
      // Replicar no meio de um fio criaria dois ramos sem utilidade nenhuma.
      if (reposTestes.temFilho(db, pai.id)) {
        return c.json({ erro: { codigo: 'pai-invalido', mensagem: 'Este caso já tem uma réplica. Responda ao turno mais recente do fio.' } }, 400);
      }
      const fio = reposTestes.fio(db, pai.id);
      turnosAnteriores = montarTurnos(fio);
      omitidos = fio.length - turnosAnteriores.length;
    }
```

Passe `turnosAnteriores` e `turnosOmitidos: omitidos` na chamada `provedor.revisarFrase(...)`, e `caso_pai_id: corpo.data.caso_pai_id ?? null` no `reposTestes.criar`.

Em `server/src/ia/provedor.ts`, `RequisicaoRevisao` ganha:

```ts
  /** Turnos anteriores do fio, do mais antigo ao mais recente. Sem eles a réplica
   *  reinicia a dúvida — foi o que produziu vereditos opostos na mesma frase. */
  turnosAnteriores?: {
    pergunta: string;
    resposta: string;
    veredito: string;
    secao_regra: string | null;
    correcao_proposta: string | null;
    recusado: boolean;
    motivo_rejeicao: string | null;
  }[];
  /** Quantos turnos ficaram de fora pelo teto — vai dito ao modelo. */
  turnosOmitidos?: number;
```

- [ ] **Step 8: Render the thread in the prompt**

Em `server/src/ia/prompts.ts`, em `usuarioRevisao`, **antes** do bloco `### FRASE QUESTIONADA:`:

```ts
  if (req.turnosAnteriores && req.turnosAnteriores.length > 0) {
    partes.push('### Discussão até aqui (você já respondeu isto; o usuário replicou):');
    if (req.turnosOmitidos && req.turnosOmitidos > 0) {
      partes.push(`(${req.turnosOmitidos} turno(s) intermediário(s) omitido(s) por tamanho.)`);
    }
    req.turnosAnteriores.forEach((t, i) => {
      partes.push(`[turno ${i + 1}] usuário: ${t.pergunta}`);
      const regra = t.secao_regra ? ` · regra: ${t.secao_regra}` : '';
      partes.push(`[turno ${i + 1}] você: (${t.veredito}${regra}) ${t.resposta}`);
      if (t.correcao_proposta) partes.push(`[turno ${i + 1}] correção que você propôs: ${t.correcao_proposta}`);
      if (t.recusado) {
        partes.push(`[turno ${i + 1}] o usuário RECUSOU esse veredito${t.motivo_rejeicao ? `: ${t.motivo_rejeicao}` : '.'}`);
      }
    });
    partes.push('');
  }
```

E acrescente ao array de instruções de `sistemaRevisaoPartes`, logo depois da linha "Se o motivo dele não procede…":

```ts
    'Quando houver "Discussão até aqui", diga explicitamente se você MANTÉM ou REVISA o veredito anterior, e por quê. Repetir o argumento já contestado sem endereçar a contestação é o pior desfecho possível.',
```

- [ ] **Step 9: Run tests and typecheck**

Run: `npm run typecheck && npm -w server run test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add server/src/db/repos.ts server/src/ia/provedor.ts server/src/ia/prompts.ts server/src/rotas/frases.ts server/src/rotas/fioRevisao.test.ts
git commit -m "Réplica sem reiniciar a dúvida

Cada pergunta era uma linha solta e a segunda chamada não recebia a primeira:
na 死人经 isso produziu vereditos opostos na mesma frase com 3 minutos de
diferença. Agora a réplica encadeia por caso_pai_id e os turnos anteriores vão
no prompt, com teto de 6 para a discussão não crescer sem limite."
```

---

### Task 5: Recusar o veredito

**Files:**
- Modify: `server/src/db/repos.ts` (`atualizarStatus`, `recorrencias`, `rotulosDeRegra`)
- Modify: `server/src/rotas/curadoria.ts:242-251`
- Test: `server/src/db/recusa.test.ts`

**Interfaces:**
- Consumes: `status: 'rejeitado'`, `motivo_rejeicao` (Task 2), `caso_pai_id` (Task 2).
- Produces: `reposTestes.atualizarStatus(db, id, status, motivo?)`; `PATCH /testes/:id` aceita `{ status, motivo_rejeicao? }`.

- [ ] **Step 1: Write the failing test**

Create `server/src/db/recusa.test.ts` com o mesmo `beforeEach`/helper `caso(...)` da Task 4 (repita-o; o arquivo tem de rodar sozinho), acrescentando o parâmetro `secao`:

```ts
function caso(secao: string | null, pai: number | null) {
  return reposTestes.criar(db, {
    frase_id: fraseId, obra_id: obraId, caso_pai_id: pai, trecho_zh: '甲',
    pergunta: 'p', veredito: 'incorreto', resposta: 'r', justificativa: '',
    secao_regra: secao, correcao_proposta: null, trecho_pt_errado: null,
    trecho_pt_corrigido: null, motivo_rejeicao: null,
    provedor: 'mock', modelo: 'mock-v1', resposta_bruta: '{}',
  });
}

describe('recusar o veredito', () => {
  it('grava o motivo junto do status', () => {
    const c = caso('5-mais-que-perfeito', null);
    const atualizado = reposTestes.atualizarStatus(db, c.id, 'rejeitado', 'a regra citada não vale aqui');
    expect(atualizado!.status).toBe('rejeitado');
    expect(atualizado!.motivo_rejeicao).toBe('a regra citada não vale aqui');
  });

  it('caso rejeitado sai das recorrências', () => {
    const a = caso('5-mais-que-perfeito', null);
    const b = caso('5-mais-que-perfeito', null);
    expect(reposTestes.recorrencias(db, obraId)).toHaveLength(1);
    reposTestes.atualizarStatus(db, a.id, 'rejeitado', null);
    expect(reposTestes.recorrencias(db, obraId)).toHaveLength(0);
  });

  it('caso rejeitado sai dos rótulos oferecidos ao modelo', () => {
    const a = caso('1-prosa-nao-legenda', null);
    expect(reposTestes.rotulosDeRegra(db, obraId)).toContain('1-prosa-nao-legenda');
    reposTestes.atualizarStatus(db, a.id, 'rejeitado', null);
    expect(reposTestes.rotulosDeRegra(db, obraId)).not.toContain('1-prosa-nao-legenda');
  });

  it('a recorrência conta só a folha do fio', () => {
    // Uma discussão de 4 turnos sobre a mesma regra é UMA lacuna, não quatro.
    let pai: number | null = null;
    for (let i = 0; i < 4; i++) pai = caso('4-sem-decalque', pai).id;
    const outro = caso('4-sem-decalque', null);
    expect(outro).toBeTruthy();
    const r = reposTestes.recorrencias(db, obraId).find((x) => x.secao_regra === '4-sem-decalque');
    expect(r?.casos).toBe(2); // a folha do fio + o caso solto
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm -w server run test -- recusa`
Expected: FAIL — `atualizarStatus` aceita 3 argumentos.

- [ ] **Step 3: Implement**

Em `server/src/db/repos.ts:1041`, a função hoje é
`atualizarStatus(db, id, status)` com um `UPDATE` de uma coluna. Substitua por:

```ts
  atualizarStatus(db: BancoDados, id: number, status: StatusCasoTeste, motivo: string | null = null): CasoTeste | undefined {
    // O motivo só faz sentido na recusa; em qualquer outro status ele é limpo,
    // senão um caso reaberto carrega a justificativa de uma recusa desfeita.
    db.prepare('UPDATE banco_testes SET status = ?, motivo_rejeicao = ? WHERE id = ?').run(
      status,
      status === 'rejeitado' ? motivo : null,
      id,
    );
    return this.obter(db, id);
  },
```

O parâmetro tem default `null`, então os chamadores existentes continuam compilando.

Em `recorrencias`, a consulta passa a:

```ts
        `SELECT secao_regra FROM banco_testes t
         WHERE obra_id = ? AND status IN ('pendente','regra-nova-necessaria','corrigido')
           AND secao_regra IS NOT NULL
           -- Só a FOLHA de cada fio: uma discussão de quatro réplicas sobre a mesma
           -- regra é uma lacuna, não quatro.
           AND NOT EXISTS (SELECT 1 FROM banco_testes f WHERE f.caso_pai_id = t.id)`,
```

Em `rotulosDeRegra`, acrescente `AND status <> 'rejeitado'` ao `WHERE`. Rótulo nascido de veredito recusado não deve voltar como sugestão ao modelo.

- [ ] **Step 4: Run to verify it passes**

Run: `npm -w server run test -- recusa`
Expected: PASS nos quatro.

- [ ] **Step 5: Open the route**

Em `server/src/rotas/curadoria.ts`, o `PATCH /testes/:id`:

```ts
  app.patch('/testes/:id', async (c) => {
    const corpo = z
      .object({
        status: z.enum(['confirmado', 'corrigido', 'pendente', 'regra-nova-necessaria', 'rejeitado']),
        motivo_rejeicao: z.string().max(500).nullable().optional(),
      })
      .safeParse(await c.req.json());
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);
    const caso = reposTestes.atualizarStatus(db, Number(c.req.param('id')), corpo.data.status, corpo.data.motivo_rejeicao ?? null);
    if (!caso) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Caso não encontrado.' } }, 404);
    return c.json(caso);
  });
```

E em `server/src/rotas/obras.ts:456`, o filtro dos casos do refino passa a:

```ts
        .casos.filter((caso) => caso.status !== 'confirmado' && caso.status !== 'rejeitado' && !reposTestes.temFilho(db, caso.id))
```

- [ ] **Step 6: Run everything**

Run: `npm run typecheck && npm -w server run test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/db/repos.ts server/src/rotas/curadoria.ts server/src/rotas/obras.ts server/src/db/recusa.test.ts
git commit -m "Recusar o veredito, com motivo

Sem isto, um veredito errado que o revisor ignora fica 'pendente' para sempre e
segue contando como lacuna sistemática — na 死人经 um caso assim ajudava a
manter mais-que-perfeito no topo das recorrências. Recusado sai das
recorrências e dos rótulos oferecidos, e as recorrências passam a contar só a
folha de cada fio."
```

---

### Task 6: `camadaDoRotulo` e rótulos sem ranking

**Files:**
- Modify: `shared/src/index.ts` (nova função `camadaDoRotulo`; `preferenciaQueCobre` fica como está)
- Modify: `server/src/db/repos.ts` (`rotulosDeRegra` devolve rótulo + camada)
- Modify: `server/src/ia/prompts.ts` (`usuarioRevisao`), `server/src/ia/provedor.ts`, `server/src/rotas/frases.ts`
- Test: `shared/src/camadaDoRotulo.test.ts` → colocar em `server/src/db/camadaDoRotulo.test.ts` (o workspace `shared` não tem runner próprio)

**Interfaces:**
- Consumes: `TEMAS`, `Tema`, `Camada` de `shared/src/temasDoPrompt.ts`; `normalizarSecaoRegra`.
- Produces:
  - `camadaDoRotulo(rotulo: string): { tema: Tema; camada: Camada } | null`
  - `reposTestes.rotulosDeRegra(db, obraId): { rotulo: string; camada: Camada | null }[]`
  - `RequisicaoRevisao.rotulosConhecidos?: { rotulo: string; camada: Camada | null }[]`

- [ ] **Step 1: Write the failing test**

Create `server/src/db/camadaDoRotulo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { camadaDoRotulo, preferenciaQueCobre } from '@dao-tale/shared';

describe('camadaDoRotulo', () => {
  it('reconhece chave de estilo como beta', () => {
    expect(camadaDoRotulo('5-mais-que-perfeito')?.camada).toBe('beta');
    expect(camadaDoRotulo('5-registro')?.camada).toBe('beta');
  });

  it('reconhece tema de núcleo como alfa', () => {
    // O ramo que hoje escapa: viraria diretriz de obra sobre tema do Alfa.
    expect(camadaDoRotulo('4-sem-decalque')?.camada).toBe('alfa');
    expect(camadaDoRotulo('glossario')?.camada).toBe('alfa');
  });

  it('devolve null para rótulo sem tema — candidato legítimo a diretriz', () => {
    expect(camadaDoRotulo('1-prosa-nao-legenda')).toBeNull();
  });

  it('inclui temas não-filtráveis, ao contrário de preferenciaQueCobre', () => {
    // nomes_proprios é beta com filtravel: false. O aviso mostra; o filtro não.
    expect(camadaDoRotulo('nomes proprios: em pinyin')?.tema.id).toBe('nomes_proprios');
    expect(preferenciaQueCobre('nomes proprios: em pinyin')).toBeNull();
  });

  it('não muda o que preferenciaQueCobre devolve', () => {
    // Não-regressão: este caminho DERRUBA candidato pago em silêncio.
    expect(preferenciaQueCobre('5-mais-que-perfeito')).toBe('mais_que_perfeito');
    expect(preferenciaQueCobre('5-registro')).toBe('registro');
    expect(preferenciaQueCobre('4-sem-decalque')).toBeNull();
    expect(preferenciaQueCobre('1-prosa-nao-legenda')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm -w server run test -- camadaDoRotulo`
Expected: FAIL — `camadaDoRotulo is not a function`.

- [ ] **Step 3: Implement**

Em `shared/src/index.ts`, ao lado de `preferenciaQueCobre`:

```ts
/**
 * Qual tema do registro este rótulo de regra invoca, e qual camada é dona dele.
 *
 * `preferenciaQueCobre` NÃO é reescrita em cima desta. As duas parecem a mesma
 * busca, mas o `find` para no primeiro casamento da ordem do array: um rótulo que
 * casasse com `nomes_proprios` (beta, filtravel: false) e com `registro` devolveria
 * `registro` hoje e `null` na versão delegada — regressão silenciosa num caminho
 * que descarta candidato pago. As duas compartilham o registro e a normalização, e
 * mantêm o predicado próprio.
 *
 * null = rótulo sem tema conhecido, ou seja, candidato legítimo a diretriz de obra.
 */
export function camadaDoRotulo(rotulo: string): { tema: Tema; camada: Camada } | null {
  const n = normalizarSecaoRegra(rotulo);
  const tema = TEMAS.find((t) => (t.padraoRotulo ?? t.padrao).test(n));
  return tema ? { tema, camada: tema.dono } : null;
}
```

Importe/reexporte `Tema` e `Camada` de `./temasDoPrompt.js` se ainda não estiverem.

- [ ] **Step 4: Run to verify it passes**

Run: `npm -w server run test -- camadaDoRotulo`
Expected: PASS nos cinco.

- [ ] **Step 5: Write the failing test for the label list**

Acrescente a `server/src/db/camadaDoRotulo.test.ts` (com o `beforeEach`/`caso` da Task 5):

```ts
describe('rótulos enviados ao modelo', () => {
  it('não expõe o ranking de frequência', () => {
    // O laço: mais usado → mais oferecido → mais escolhido → mais usado ainda.
    for (let i = 0; i < 5; i++) caso('5-mais-que-perfeito', null);
    caso('1-prosa-nao-legenda', null);
    const rotulos = reposTestes.rotulosDeRegra(db, obraId);
    expect(rotulos.map((r) => r.rotulo)).toEqual(['1-prosa-nao-legenda', '5-mais-que-perfeito']);
    expect(rotulos.find((r) => r.rotulo === '5-mais-que-perfeito')!.camada).toBe('beta');
  });
});
```

- [ ] **Step 6: Run to verify it fails, then implement**

Run: `npm -w server run test -- camadaDoRotulo` → FAIL (ordem e formato).

Em `repos.ts`, `rotulosDeRegra`:

```ts
  /** Rótulos já usados na obra, com a camada dona de cada um.
      A SELEÇÃO continua por frequência — numa obra com 200 rótulos, cortar
      alfabeticamente descartaria tudo depois do "m". O que muda é a APRESENTAÇÃO:
      a lista sai ordenada alfabeticamente, para o modelo não ver o ranking e
      realimentar o rótulo mais usado. */
  rotulosDeRegra(db: BancoDados, obraId: number): { rotulo: string; camada: Camada | null }[] {
    const linhas = db
      .prepare(
        `SELECT secao_regra, COUNT(*) n FROM banco_testes
         WHERE obra_id = ? AND secao_regra IS NOT NULL AND status <> 'rejeitado'
         GROUP BY secao_regra ORDER BY n DESC LIMIT 30`,
      )
      .all(obraId) as { secao_regra: string }[];
    return linhas
      .map((l) => ({ rotulo: l.secao_regra, camada: camadaDoRotulo(l.secao_regra)?.camada ?? null }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
  },
```

Note que a cláusula `secao_regra <> 'geral'` some: a Task 2 e a Task 3 já garantem que 'geral' virou `null`.

- [ ] **Step 7: Render grouped by layer**

Em `server/src/ia/provedor.ts`, troque o tipo:

```ts
  /** Rótulos de `secao_regra` já usados nesta obra, com a camada dona. Vão na
   *  mensagem do usuário AGRUPADOS por camada e em ordem alfabética: quando iam
   *  ordenados por frequência, o rótulo mais usado era o mais oferecido, o mais
   *  escolhido, e voltava maior ainda. */
  rotulosConhecidos?: { rotulo: string; camada: 'alfa' | 'beta' | 'delta' | null }[];
```

Em `prompts.ts`, `usuarioRevisao`, substitua o bloco dos rótulos:

```ts
  if (req.rotulosConhecidos && req.rotulosConhecidos.length > 0) {
    const diretriz = req.rotulosConhecidos.filter((r) => r.camada === null || r.camada === 'delta');
    const chaves = req.rotulosConhecidos.filter((r) => r.camada === 'beta');
    const nucleo = req.rotulosConhecidos.filter((r) => r.camada === 'alfa');
    partes.push('### Rótulos de regra já usados nesta obra');
    const linha = (t: string, l: typeof diretriz) =>
      l.length > 0 && partes.push(`${t}: ${l.map((r) => r.rotulo).join(', ')}`);
    linha('Diretrizes da obra', diretriz);
    linha('Chaves de estilo (Seção 5)', chaves);
    linha('Regras universais do núcleo', nucleo);
    partes.push(
      'Use um destes SÓ se a regra em questão for exatamente a mesma. A maior parte das dúvidas não é de regra — nesse caso deixe secao_regra em null.',
    );
    partes.push('');
  }
```

- [ ] **Step 8: Run everything**

Run: `npm run typecheck && npm -w server run test`
Expected: PASS. `server/src/db/rotulosRegra.test.ts` pode falhar por esperar `string[]`; atualize para o formato novo.

- [ ] **Step 9: Commit**

```bash
git add shared/src/index.ts server/src/db/repos.ts server/src/ia/provedor.ts server/src/ia/prompts.ts server/src/db/camadaDoRotulo.test.ts
git commit -m "O rótulo de regra passa a saber a sua camada

O registro de temas já sabia quem é dono de quê, mas o rótulo não carregava
isso: cada consumidor redescobria o assunto por conta própria. camadaDoRotulo
resolve o rótulo contra o registro, e a lista enviada ao modelo perde o ranking
de frequência — era ele que mantinha o rótulo mais usado no topo e o fazia
crescer sozinho."
```

---

### Task 7: Roteamento do refino por camada

**Files:**
- Modify: `server/src/rotas/obras.ts:420-500`
- Modify: `server/src/ia/prompts.ts` (`usuarioRefinarPrompt`, `sistemaRefinarPromptPartes`)
- Modify: `server/src/ia/provedor.ts` (`RequisicaoRefinarPrompt`)
- Test: `server/src/rotas/refinoCamada.test.ts`

**Interfaces:**
- Consumes: `camadaDoRotulo` (Task 6), `status: 'rejeitado'` + `motivo_rejeicao` (Tasks 2/5).
- Produces: `RequisicaoRefinarPrompt.recusados?: { trecho_zh: string; pergunta: string; veredito: string; resposta: string; motivo_rejeicao: string | null }[]`

- [ ] **Step 1: Write the failing test**

Create `server/src/rotas/refinoCamada.test.ts`. Use o mesmo `beforeEach`/`caso` das tarefas anteriores e monte o app com o padrão já usado em `server/src/app.test.ts` (copie de lá a criação do app e o header de sessão, se houver).

```ts
describe('roteamento do refino por camada', () => {
  it('recorrência de tema do núcleo não vira diretriz de obra', async () => {
    // 4-sem-decalque é tema de Alfa. Hoje passa direto e viraria regra no Delta.
    caso('4-sem-decalque', null);
    caso('4-sem-decalque', null);
    const r = await app.request(`/obras/${obraId}/prompts/refinar`, { method: 'POST' });
    expect(r.status).toBe(409);
    const corpo = await r.json();
    expect(corpo.erro.codigo).toBe('so-camadas-donas');
    expect(corpo.erro.mensagem).toMatch(/n[úu]cleo/i);
  });

  it('recorrência sem tema segue para a chamada paga', async () => {
    caso('1-prosa-nao-legenda', null);
    caso('1-prosa-nao-legenda', null);
    const r = await app.request(`/obras/${obraId}/prompts/refinar`, { method: 'POST' });
    expect(r.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm -w server run test -- refinoCamada`
Expected: FAIL — o primeiro devolve 200, porque só Beta é filtrada hoje.

- [ ] **Step 3: Implement the routing**

Em `server/src/rotas/obras.ts`, substitua o bloco de `porPreferencia`/`recorrencias`:

```ts
    // Roteamento por camada dona (doc 15 §7). A partição por tema diz que cada
    // assunto pertence a UMA camada: recorrência de chave de estilo se resolve
    // virando a chave, e recorrência de tema do núcleo é versão nova de Alfa ou
    // desobediência do modelo — nenhuma das duas vira diretriz de obra. Filtrar
    // aqui evita pagar uma chamada cuja resposta já se sabe.
    const classificadas = todasRecorrencias.map((r) => ({ ...r, camada: camadaDoRotulo(r.secao_regra)?.camada ?? null }));
    const daObra = classificadas.filter((r) => r.camada === null || r.camada === 'delta');
    const deChave = classificadas.filter((r) => r.camada === 'beta');
    const deNucleo = classificadas.filter((r) => r.camada === 'alfa');

    if (daObra.length === 0) {
      const lista = (l: typeof classificadas) => l.map((r) => `${r.secao_regra} (${r.casos})`).join(', ');
      const partes: string[] = [];
      if (deChave.length > 0) {
        partes.push(
          `Chaves de estilo: ${lista(deChave)}. Isso se resolve virando a chave em "Preferências de estilo" — ou o erro é o modelo desobedecendo uma regra que já existe.`,
        );
      }
      if (deNucleo.length > 0) {
        partes.push(
          `Regras universais do núcleo: ${lista(deNucleo)}. Ou a regra do núcleo tem buraco — e aí é uma versão nova de Alfa, com as duas medições do registro de temas — ou o modelo desobedeceu, e aí o conserto é temperatura, modelo ou posição no prompt. Escrever diretriz de obra sobre isso criaria sobreposição entre camadas.`,
        );
      }
      return c.json(
        {
          erro: {
            codigo: 'so-camadas-donas',
            mensagem: `${partes.join(' ')} Nenhuma recorrência é candidata a diretriz de obra — por isso nem gastei a chamada.`,
          },
        },
        409,
      );
    }
    const recorrencias = daObra;
```

Importe `camadaDoRotulo` de `@dao-tale/shared`. Mantenha `preferenciaQueCobre` importada se ainda for usada em outro ponto do arquivo; se não for, remova o import.

- [ ] **Step 4: Run to verify it passes**

Run: `npm -w server run test -- refinoCamada`
Expected: PASS nos dois.

- [ ] **Step 5: Feed the rejected cases in**

Em `server/src/rotas/obras.ts`, antes da chamada `provedor.refinarPrompt`:

```ts
    // O motivo da recusa é o único lugar do app onde o revisor diz POR ESCRITO
    // que a IA errou. Sem isso, o refinador só vê os casos em que ela acertou.
    const recusados = reposTestes
      .listar(db, obraId, { status: 'rejeitado', limite: 10 })
      .casos.map((caso) => ({
        trecho_zh: caso.trecho_zh,
        pergunta: caso.pergunta,
        veredito: caso.veredito,
        resposta: caso.resposta,
        motivo_rejeicao: caso.motivo_rejeicao,
      }));
```

Passe `recusados` na chamada. Em `provedor.ts`, `RequisicaoRefinarPrompt` ganha o campo com o mesmo tipo.

Em `prompts.ts`, ao fim de `usuarioRefinarPrompt`:

```ts
  if (req.recusados && req.recusados.length > 0) {
    partes.push('');
    partes.push('### Casos em que o revisor RECUSOU o veredito da IA');
    for (const r of req.recusados) {
      partes.push(`- ZH: ${r.trecho_zh}`);
      partes.push(`  Pergunta do revisor: ${r.pergunta}`);
      partes.push(`  Veredito recusado: ${r.veredito} — ${r.resposta}`);
      if (r.motivo_rejeicao) partes.push(`  Motivo da recusa: ${r.motivo_rejeicao}`);
    }
  }
```

E em `sistemaRefinarPromptPartes`, acrescente à lista de instruções:

```ts
    'A mensagem do usuário pode trazer casos RECUSADOS pelo revisor. Eles são correção de rumo, não material a generalizar: NÃO proponha regra que reproduza o erro apontado neles.',
```

- [ ] **Step 6: Run everything**

Run: `npm run typecheck && npm -w server run test`
Expected: PASS. `server/src/db/recorrencias.test.ts` pode precisar de ajuste se assumia que qualquer rótulo chega ao refino.

- [ ] **Step 7: Commit**

```bash
git add server/src/rotas/obras.ts server/src/ia/prompts.ts server/src/ia/provedor.ts server/src/rotas/refinoCamada.test.ts
git commit -m "Refino roteia por camada dona, e lê as recusas

O filtro de chaves de estilo já existia; faltava o ramo do núcleo. Na 死人经,
4-sem-decalque tem 2 casos e passava direto — viraria diretriz de obra sobre um
tema do Alfa, a sobreposição que a partição existe para impedir, entrando pela
porta do refinamento. E o motivo da recusa entra como insumo: é o único lugar
onde o revisor escreve por que a IA errou."
```

---

### Task 8: Portabilidade do fio

**Files:**
- Modify: `server/src/db/portabilidade.ts:105-120` (schema), `:212-231` (export), `:341-363` (import)
- Modify: `server/src/rotas/curadoria.ts:263-275` (CSV)
- Test: `server/src/db/portabilidade.test.ts`

**Interfaces:**
- Consumes: `caso_pai_id`, `resposta`, `motivo_rejeicao` (Task 2); `camadaDoRotulo` (Task 6).
- Produces: export JSON com `id` e `caso_pai_id` por caso; import remapeando ids.

- [ ] **Step 1: Write the failing test**

Acrescente a `server/src/db/portabilidade.test.ts`:

```ts
it('preserva o fio de réplicas ao exportar e reimportar', () => {
  // Os casos ganham id NOVO na importação: sem remapear, o caso_pai_id aponta
  // para outro caso — possivelmente de outra obra. É o defeito mais silencioso
  // deste trabalho.
  const a = criarCaso({ pergunta: 'primeira', pai: null });
  const b = criarCaso({ pergunta: 'segunda', pai: a.id });
  criarCaso({ pergunta: 'terceira', pai: b.id });

  const dados = exportarObra(db, obraId);
  const nova = importarObra(db, dados);

  const casos = db
    .prepare('SELECT * FROM banco_testes WHERE obra_id = ? ORDER BY criado_em, id')
    .all(nova.id) as CasoTeste[];
  expect(casos).toHaveLength(3);
  expect(casos[0].caso_pai_id).toBeNull();
  expect(casos[1].caso_pai_id).toBe(casos[0].id);
  expect(casos[2].caso_pai_id).toBe(casos[1].id);
  // E nenhum aponta para a obra original.
  expect(casos.every((c) => c.id !== a.id && c.caso_pai_id !== a.id)).toBe(true);
});

it('importa export antigo, sem os campos novos', () => {
  const dados = exportarObra(db, obraId);
  for (const c of dados.banco_testes) {
    delete (c as Record<string, unknown>).id;
    delete (c as Record<string, unknown>).caso_pai_id;
    delete (c as Record<string, unknown>).resposta;
    delete (c as Record<string, unknown>).motivo_rejeicao;
  }
  const nova = importarObra(db, dados);
  const casos = db.prepare('SELECT * FROM banco_testes WHERE obra_id = ?').all(nova.id) as CasoTeste[];
  // Sem `resposta` no arquivo, ela recebe a justificativa: o texto que existe.
  expect(casos[0].resposta).toBe(casos[0].justificativa);
  expect(casos[0].caso_pai_id).toBeNull();
});
```

Adapte `criarCaso`/`exportarObra`/`importarObra` aos helpers e nomes que o arquivo já usa.

- [ ] **Step 2: Run to verify it fails**

Run: `npm -w server run test -- portabilidade`
Expected: FAIL — o export não traz `caso_pai_id`.

- [ ] **Step 3: Widen the schema**

Em `portabilidade.ts`, no `banco_testes` do `exportSchema`:

```ts
  banco_testes: z.array(
    z.object({
      // id e caso_pai_id existem só para reconstruir o FIO na importação: os casos
      // ganham id novo, então o pai é remapeado por este par.
      id: z.number().int().optional(),
      caso_pai_id: z.number().int().nullable().optional(),
      capitulo_numero: z.number().int(),
      frase_ordem: z.number().int(),
      trecho_zh: z.string(),
      pergunta: z.string(),
      veredito: z.enum(['correto', 'incorreto', 'escolha-legitima']),
      // Ausente em export anterior a 2026-08: cai para justificativa.
      resposta: z.string().optional(),
      justificativa: z.string(),
      secao_regra: z.string().nullable(),
      correcao_proposta: z.string().nullable(),
      // Faltavam desde a migração 015 — o par cirúrgico não sobrevivia a um
      // export/import, e ninguém percebeu porque nada quebra: a correção só
      // volta a ser aplicada pela frase inteira.
      trecho_pt_errado: z.string().nullable().optional(),
      trecho_pt_corrigido: z.string().nullable().optional(),
      status: z.enum(['confirmado', 'corrigido', 'pendente', 'regra-nova-necessaria', 'rejeitado']),
      motivo_rejeicao: z.string().nullable().optional(),
      provedor: z.string(),
      modelo: z.string(),
      resposta_bruta: z.string(),
      criado_em: z.string(),
    }),
  ),
```

- [ ] **Step 4: Extend the export**

No bloco `banco_testes:` do export, acrescente `id: c.id`, `caso_pai_id: c.caso_pai_id`, `resposta: c.resposta`, `motivo_rejeicao: c.motivo_rejeicao`, `trecho_pt_errado: c.trecho_pt_errado`, `trecho_pt_corrigido: c.trecho_pt_corrigido`.

- [ ] **Step 5: Two-pass import**

Substitua o laço de importação de `banco_testes`:

```ts
    // Duas passagens: o pai pode vir DEPOIS do filho no arquivo, então primeiro
    // insere tudo com caso_pai_id nulo e guarda id-antigo → id-novo; só então
    // religa o fio. Uma passagem só religaria pelo id ERRADO em silêncio.
    const idNovoPorAntigo = new Map<number, number>();
    for (const c of dados.banco_testes) {
      const fraseId = fraseIdPorChave.get(`${c.capitulo_numero}:${c.frase_ordem}`);
      if (!fraseId) continue;
      const info = db
        .prepare(
          `INSERT INTO banco_testes (frase_id, obra_id, caso_pai_id, trecho_zh, pergunta, veredito,
             resposta, justificativa, secao_regra, correcao_proposta, trecho_pt_errado, trecho_pt_corrigido,
             status, motivo_rejeicao, provedor, modelo, resposta_bruta, criado_em)
           VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          fraseId,
          obraId,
          c.trecho_zh,
          c.pergunta,
          c.veredito,
          c.resposta ?? c.justificativa,
          c.justificativa,
          c.secao_regra,
          c.correcao_proposta,
          c.trecho_pt_errado ?? null,
          c.trecho_pt_corrigido ?? null,
          c.status,
          c.motivo_rejeicao ?? null,
          c.provedor,
          c.modelo,
          c.resposta_bruta,
          c.criado_em,
        );
      if (c.id != null) idNovoPorAntigo.set(c.id, Number(info.lastInsertRowid));
    }
    const religar = db.prepare('UPDATE banco_testes SET caso_pai_id = ? WHERE id = ?');
    for (const c of dados.banco_testes) {
      if (c.id == null || c.caso_pai_id == null) continue;
      const filho = idNovoPorAntigo.get(c.id);
      const pai = idNovoPorAntigo.get(c.caso_pai_id);
      // Pai fora do arquivo (export parcial) → o caso vira raiz em vez de apontar
      // para um id qualquer da obra nova.
      if (filho != null && pai != null) religar.run(pai, filho);
    }
```

- [ ] **Step 6: Extend the CSV**

Em `server/src/rotas/curadoria.ts`, o cabeçalho e as linhas do CSV ganham `caso_pai_id`, `resposta`, `motivo_rejeicao` e `camada` (de `camadaDoRotulo(t.secao_regra ?? '')?.camada ?? ''`). Mantenha o escapamento que o arquivo já usa para os demais campos.

- [ ] **Step 7: Run everything**

Run: `npm run typecheck && npm -w server run test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/src/db/portabilidade.ts server/src/db/portabilidade.test.ts server/src/rotas/curadoria.ts
git commit -m "Export/import preservam o fio, e o par cirúrgico

Os casos ganham id novo na importação: sem remapear, caso_pai_id apontaria para
outro caso, possivelmente de outra obra. Duas passagens resolvem — o pai pode
vir depois do filho no arquivo. De quebra, trecho_pt_errado/corrigido entram no
export: faltavam desde a migração 015 e o par cirúrgico não sobrevivia a um
ciclo, sem nada quebrar visivelmente."
```

---

### Task 9: A gaveta

**Files:**
- Create: `web/src/componentes/GavetaRevisao.tsx`
- Create: `web/src/componentes/fios.ts`
- Create: `web/src/componentes/fios.test.ts`
- Modify: `web/src/paginas/EditorCapitulo.tsx` (remover a gaveta, importar o componente)
- Modify: `web/src/paginas/BancoTestes.tsx` (etiqueta de camada, status `rejeitado`)

**Interfaces:**
- Consumes: `CasoTeste` com `caso_pai_id`/`resposta`/`motivo_rejeicao`; `camadaDoRotulo`; `POST /frases/:id/revisar` com `caso_pai_id`; `PATCH /testes/:id` com `motivo_rejeicao`.
- Produces: `agruparEmFios(casos: CasoTeste[]): CasoTeste[][]` — fios ordenados do mais recente para o mais antigo, cada fio da raiz à folha.

- [ ] **Step 1: Write the failing test**

Create `web/src/componentes/fios.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { CasoTeste } from '@dao-tale/shared';
import { agruparEmFios } from './fios';

const caso = (id: number, pai: number | null, criado: string) =>
  ({ id, caso_pai_id: pai, criado_em: criado }) as CasoTeste;

describe('agruparEmFios', () => {
  it('monta cada fio da raiz até a folha', () => {
    const casos = [caso(3, 2, '2026-08-07T03:00Z'), caso(1, null, '2026-08-07T01:00Z'), caso(2, 1, '2026-08-07T02:00Z')];
    expect(agruparEmFios(casos)).toEqual([[casos[1], casos[2], casos[0]]]);
  });

  it('ordena os fios do mais recente para o mais antigo pela folha', () => {
    const antigo = caso(1, null, '2026-08-06T01:00Z');
    const novo = caso(2, null, '2026-08-07T01:00Z');
    expect(agruparEmFios([antigo, novo])[0][0].id).toBe(2);
  });

  it('trata caso órfão como raiz — import parcial não pode sumir da tela', () => {
    const orfao = caso(5, 99, '2026-08-07T01:00Z');
    expect(agruparEmFios([orfao])).toEqual([[orfao]]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm -w web run test -- fios`
Expected: FAIL — módulo `./fios` não existe.

- [ ] **Step 3: Implement**

Create `web/src/componentes/fios.ts`:

```ts
import type { CasoTeste } from '@dao-tale/shared';

/** Agrupa os casos de uma frase em fios de réplica: cada fio vai da raiz à folha,
    e os fios vêm do mais recente para o mais antigo. Caso cujo pai não está na
    lista (import parcial) vira raiz — sumir da tela seria pior que ficar solto. */
export function agruparEmFios(casos: CasoTeste[]): CasoTeste[][] {
  const porId = new Map(casos.map((c) => [c.id, c]));
  const filhos = new Map<number, CasoTeste[]>();
  const raizes: CasoTeste[] = [];
  for (const c of casos) {
    if (c.caso_pai_id != null && porId.has(c.caso_pai_id)) {
      filhos.set(c.caso_pai_id, [...(filhos.get(c.caso_pai_id) ?? []), c]);
    } else {
      raizes.push(c);
    }
  }
  const cadeia = (raiz: CasoTeste): CasoTeste[] => {
    const fio = [raiz];
    for (let atual = raiz; ; ) {
      const proximo = (filhos.get(atual.id) ?? []).sort((a, b) => a.criado_em.localeCompare(b.criado_em))[0];
      if (!proximo) return fio;
      fio.push(proximo);
      atual = proximo;
    }
  };
  return raizes
    .map(cadeia)
    .sort((a, b) => b.at(-1)!.criado_em.localeCompare(a.at(-1)!.criado_em));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm -w web run test -- fios`
Expected: PASS nos três.

- [ ] **Step 5: Extract the drawer**

Mova o componente da gaveta de `web/src/paginas/EditorCapitulo.tsx` (o bloco que começa em `<h3 className="font-display font-semibold">Protocolo de Revisão</h3>` e vai até o fim do cartão, incluindo os hooks `useMutation`/`useQuery` que só ele usa) para `web/src/componentes/GavetaRevisao.tsx`, exportando `export function GavetaRevisao(props) { … }` com as props que o editor já passava. **Mover, não reescrever:** o objetivo é o arquivo caber na cabeça de quem lê, não mudar o comportamento existente.

Justificativa para o comentário do topo do arquivo novo:

```tsx
// A gaveta saiu de EditorCapitulo.tsx (que passava de 1500 linhas) quando o fio de
// réplicas acrescentou estado próprio. Não é refactor oportunista: é a linha em que
// o arquivo deixava de caber inteiro na cabeça de quem o edita.
```

- [ ] **Step 6: Render the thread**

Dentro de `GavetaRevisao`, substitua o bloco de resultado único e o `<details>` de histórico por:

```tsx
const fios = agruparEmFios(historico ?? []);
const corrente = fios[0];
const anteriores = fios.slice(1);
```

O fio corrente é renderizado expandido, em ordem cronológica. Para cada turno: a pergunta do usuário, depois o bloco da IA com `<Etiqueta>` do veredito (`correto` → jade, `incorreto` → selo, `escolha-legitima` → ocre), a `resposta` como texto principal, e — só quando existirem — `secao_regra` e `justificativa` numa linha discreta abaixo, com a etiqueta da camada vinda de `camadaDoRotulo(caso.secao_regra)`.

No último turno, os botões: **Aplicar correção** (quando há `correcao_proposta` e o status não é `corrigido`, preservando o aviso de proposta curta e o `window.confirm` que já existem) e **Discordo**, que abre um campo de motivo opcional e chama `PATCH /testes/:id` com `{ status: 'rejeitado', motivo_rejeicao }`.

No pé, o campo de resposta chama `POST /frases/:id/revisar` com `{ pergunta, caso_pai_id: corrente.at(-1)!.id }`. O botão "Perguntar" original, acima, continua abrindo fio novo (sem `caso_pai_id`).

`anteriores` vai para o `<details>` "Revisões anteriores", um bloco recolhido por fio, rotulado pelo veredito da folha.

"Sugerir termos" e "Segmentação" passam a `<details>` fechados quando `corrente` existe.

- [ ] **Step 7: Update the test bank screen**

Em `web/src/paginas/BancoTestes.tsx`: acrescente `rejeitado` a `STATUS_CASO_ROTULO` e à lista do `<select>` de status; mostre a etiqueta de camada ao lado de `secao_regra`; e exiba `motivo_rejeicao` quando houver.

- [ ] **Step 8: Verify**

Run: `npm run typecheck && npm -w web run test && npm run build`
Expected: PASS nos três.

Depois, com o app rodando (`npm run dev`): abra um capítulo, clique numa frase, pergunte algo, replique na resposta, e confirme que (a) o fio aparece inteiro, (b) a segunda resposta menciona o que a primeira disse, (c) "Discordo" grava e o caso some das recorrências em `/obras/:id/testes/recorrencias`.

- [ ] **Step 9: Commit**

```bash
git add web/src/componentes/GavetaRevisao.tsx web/src/componentes/fios.ts web/src/componentes/fios.test.ts web/src/paginas/EditorCapitulo.tsx web/src/paginas/BancoTestes.tsx
git commit -m "A gaveta mostra o fio, e sai de EditorCapitulo

O fio corrente ocupa a seção de revisão inteira, com a resposta como texto
principal — regra e justificativa viram linha discreta, e só quando existem. A
gaveta saiu para componente próprio porque EditorCapitulo passava de 1500 linhas
e o fio acrescenta estado."
```

---

## Depois do plano

Fora do escopo deste plano, registrado para não se perder:

- **Preços** (spec §3.2): cadastrar `deepseek:deepseek-v4-flash`, `deepseek:deepseek-v4-pro` e `gemini:gemini-flash-latest` em Configurações com os valores da tabela vigente, preencher `taxa_usd_brl` e rodar `POST /telemetria/recalcular`. É tela, não código — e é o que torna o custo do fio julgável em dinheiro.
- **Item 3** (aprender com as edições manuais) e **item 4** (varredura de consistência na obra inteira): specs próprios.
- **Subir para o VPS** com `npm run subir`, que roda typecheck + testes + build antes de enviar e faz backup verificado do banco.
