# 03 — Modelo de dados (SQLite)

Esquema completo da migração inicial. Baseado no modelo do briefing, com os acréscimos justificados em `01-visao-e-decisoes.md §4` — cada desvio está marcado com **(+)** e comentado.

Convenções: `INTEGER PRIMARY KEY` (rowid), datas em ISO-8601 UTC (`TEXT`), booleanos como `INTEGER` 0/1, enums como `TEXT` com `CHECK`. `PRAGMA foreign_keys = ON` sempre; `PRAGMA journal_mode = WAL`.

## Diagrama de relacionamentos

```
obras 1──n prompts
  │ 1──n capitulos 1──n frases 1──n banco_testes
  │ 1──n glossario
  │ 1──n termos_sugeridos (n──1 capitulos)
  │ 1──n banco_testes (FK redundante p/ filtro)
configuracoes (chave-valor global)
```

## DDL

```sql
CREATE TABLE obras (
  id               INTEGER PRIMARY KEY,
  titulo           TEXT NOT NULL,
  titulo_original  TEXT,                          -- nome em chinês, opcional
  sinopse          TEXT,                          -- (+) resumo curto, exibido no cartão da obra
  tags             TEXT NOT NULL DEFAULT '[]',    -- (+) JSON array de strings
  capa             BLOB,                          -- (+) imagem de capa (app local, dispensa arquivos soltos)
  capa_mime        TEXT,
  provedor_padrao  TEXT,                          -- (+) id de provedor (PROVEDORES_IDS no shared); NULL = padrão global
  modelo_padrao    TEXT,                          -- (+) id do modelo no provedor; NULL = padrão do provedor
  temperatura      REAL,                          -- (+) migração 013: override de amostragem da obra (doc 08 §13);
                                                  --     NULL = padrão do papel, vindo das Configurações
  criado_em        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  atualizado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- (+) uso_ia (migração 003): contagem local de requisições por dia/provedor/modelo,
--     PRIMARY KEY (data, provedor, modelo) — alimenta o indicador de cota gratuita.
-- (+) provedor/modelo padrão por obra: requisito 4.7 do briefing ("seleção do
--     provedor/modelo padrão por obra ou por capítulo") precisava morar em algum lugar.

CREATE TABLE prompts (
  id           INTEGER PRIMARY KEY,
  obra_id      INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  versao       TEXT NOT NULL,                     -- ex.: "4.1"
  conteudo     TEXT NOT NULL,
  notas_versao TEXT,                              -- (+) "o que mudou e por quê" (tela 4.6 do briefing)
  ativo        INTEGER NOT NULL DEFAULT 0,
  preferencias TEXT,                              -- (+) migração 012: preferências de estilo em JSON (doc 08 §12);
                                                  --     NULL = padrões do app = comportamento de sempre
  criado_em    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (obra_id, versao)
);
CREATE UNIQUE INDEX idx_prompt_ativo_por_obra ON prompts(obra_id) WHERE ativo = 1;
-- O índice parcial único garante no banco a regra "só um prompt ativo por obra".
-- Ativar uma versão é uma transação: desativa a atual, ativa a nova.
-- Versões são IMUTÁVEIS depois de criadas ("editar" o prompt ativo = criar nova versão);
-- é isso que torna prompt_id em capitulos uma referência histórica confiável.

CREATE TABLE capitulos (
  id            INTEGER PRIMARY KEY,
  obra_id       INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  numero        INTEGER NOT NULL,
  titulo        TEXT,                             -- (+) capítulos de webnovel têm título; opcional
  titulo_pt     TEXT,                             -- (+) título traduzido pela IA junto com o 1º bloco
  status        TEXT NOT NULL DEFAULT 'rascunho'  -- 'traduzido' = job completo, aguardando revisão
                CHECK (status IN ('rascunho','traduzindo','traduzido','revisado','finalizado')),
  texto_origem  TEXT NOT NULL,                    -- chinês bruto, como recebido
  provedor      TEXT,                             -- (+) provedor usado na última tradução
  modelo        TEXT,                             -- (+) modelo usado na última tradução
  prompt_id     INTEGER REFERENCES prompts(id),   -- (+) versão do prompt mãe usada na última tradução
  criado_em     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (obra_id, numero)
);
-- (+) provedor/modelo/prompt_id registram COM O QUE o capítulo foi traduzido — é o que
--     permite o caso de uso do briefing §5.4 de comparar modelos no mesmo texto.

CREATE TABLE frases (
  id                    INTEGER PRIMARY KEY,
  capitulo_id           INTEGER NOT NULL REFERENCES capitulos(id) ON DELETE CASCADE,
  ordem                 INTEGER NOT NULL,          -- posição no capítulo (0-based)
  paragrafo             INTEGER NOT NULL,          -- (+) índice do parágrafo de origem (0-based)
  texto_zh              TEXT NOT NULL,
  texto_pt              TEXT NOT NULL DEFAULT '',
  texto_pt_original_ia  TEXT,                      -- 1ª tradução da IA, preservada p/ diff; NULL até traduzir
  editado_manualmente   INTEGER NOT NULL DEFAULT 0,
  status_traducao       TEXT NOT NULL DEFAULT 'pendente'
                        CHECK (status_traducao IN ('pendente','traduzida','erro')),
  UNIQUE (capitulo_id, ordem)
);
CREATE INDEX idx_frases_capitulo ON frases(capitulo_id, ordem);
-- (+) paragrafo: sem ele é impossível reconstruir o texto com as quebras de parágrafo
--     originais (exportação, cópia do capítulo traduzido, exibição agrupada no editor).
-- (+) status_traducao: estado durável do job em lote — permite "retomar" após erro ou
--     queda do processo sem retraduzir frases prontas (ver 05-fluxos-ia.md §2).

CREATE TABLE glossario (
  id         INTEGER PRIMARY KEY,
  obra_id    INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  termo_zh   TEXT NOT NULL,
  termo_pt   TEXT NOT NULL,
  categoria  TEXT NOT NULL DEFAULT 'outro'
             CHECK (categoria IN ('local','poder-habilidade','entidade','titulo-cargo','personagem','outro')),
  nota       TEXT,
  origem     TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','sugerido-ia')), -- (+)
  criado_em  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),              -- (+)
  UNIQUE (obra_id, termo_zh)
);
-- UNIQUE(obra_id, termo_zh): um termo chinês tem UMA tradução canônica por obra —
-- é a premissa do glossário como instrução de consistência para a IA.

CREATE TABLE termos_sugeridos (                    -- (+) tabela nova
  id          INTEGER PRIMARY KEY,
  obra_id     INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  capitulo_id INTEGER NOT NULL REFERENCES capitulos(id) ON DELETE CASCADE,
  termo_zh    TEXT NOT NULL,
  termo_pt    TEXT NOT NULL,                       -- tradução que a IA usou/propôs
  categoria   TEXT,                                -- palpite da IA, se houver
  contexto    TEXT,                                -- frase/trecho onde o termo apareceu
  status      TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aceito','rejeitado')),
  criado_em   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- A tela 4.5 do briefing pede "sugerir cadastro com um clique" para termos novos que a IA
-- reporta — essa fila de sugestões precisa persistir entre sessões até o usuário decidir.
-- Aceitar = insere em glossario (origem='sugerido-ia') e marca 'aceito'.

CREATE TABLE banco_testes (
  id                 INTEGER PRIMARY KEY,
  frase_id           INTEGER NOT NULL REFERENCES frases(id) ON DELETE CASCADE,
  obra_id            INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE, -- redundante p/ filtro (briefing)
  trecho_zh          TEXT NOT NULL,                -- trecho chinês citado pela IA
  pergunta           TEXT NOT NULL,
  veredito           TEXT NOT NULL CHECK (veredito IN ('correto','incorreto')),
  justificativa      TEXT NOT NULL,                -- texto da justificativa
  secao_regra        TEXT,                         -- (+) identificador da seção/passo do prompt citado
  correcao_proposta  TEXT,                         -- NULL se veredito = correto
  status             TEXT NOT NULL DEFAULT 'pendente'
                     CHECK (status IN ('confirmado','corrigido','pendente','regra-nova-necessaria')),
  provedor           TEXT NOT NULL,                -- (+) qual IA respondeu
  modelo             TEXT NOT NULL,                -- (+)
  resposta_bruta     TEXT NOT NULL,                -- (+) JSON bruto retornado, p/ auditoria
  criado_em          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_testes_obra_status ON banco_testes(obra_id, status);
CREATE INDEX idx_testes_secao ON banco_testes(obra_id, secao_regra);
-- (+) secao_regra como campo próprio (a IA é obrigada a preenchê-lo na saída estruturada):
--     o filtro e o contador "2+ casos da mesma seção" da tela 4.4 não funcionam sobre
--     justificativa em texto livre.
-- Regras de status na criação: veredito 'correto' → 'confirmado'; 'incorreto' → 'pendente';
-- usuário aceita a correção → 'corrigido' (e frases.texto_pt é atualizado);
-- 'regra-nova-necessaria' é sempre marcação manual.

CREATE TABLE configuracoes (                       -- (+) tabela nova, chave-valor
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
-- Guarda: provedor/modelo padrão globais, tamanho do bloco de tradução, nº de frases
-- vizinhas na revisão, cauda de contexto entre blocos, modo de guarda de chaves,
-- e a tabela de preços por modelo (precos_modelos, doc 11 §3).
-- CHAVES DE API NÃO FICAM AQUI (ver 05-fluxos-ia.md §6).

-- Livro-caixa das chamadas de IA (doc 11, migração 010): uma linha por chamada que
-- devolveu `usage`. Complementa uso_ia, que conta TENTATIVAS por dia — a diferença
-- entre as duas é o desperdício (retries, 429, truncamento).
CREATE TABLE eventos_ia (
  id                   INTEGER PRIMARY KEY,
  em                   TEXT NOT NULL DEFAULT (datetime('now')),   -- UTC
  data                 TEXT NOT NULL,                             -- dia LOCAL, como uso_ia
  obra_id              INTEGER REFERENCES obras(id)     ON DELETE SET NULL,
  capitulo_id          INTEGER REFERENCES capitulos(id) ON DELETE SET NULL,
  papel                TEXT NOT NULL,   -- traducao|revisao|qa|extracao|refinamento|titulo|comparador
  provedor             TEXT NOT NULL,
  modelo               TEXT NOT NULL,
  tokens_entrada       INTEGER,         -- NULL = a API não expõe o campo (≠ 0)
  tokens_saida         INTEGER,
  tokens_cache_leitura INTEGER,
  tokens_cache_criacao INTEGER,
  custo_estimado       REAL             -- USD; NULL = modelo sem preço cadastrado
);
-- SET NULL e não CASCADE de propósito: apagar um capítulo não desfaz o dinheiro que
-- ele custou — a linha só deixa de ser atribuível a ele.
```

## Regras de integridade que ficam na aplicação (não no banco)

1. **Retradução de capítulo:** retraduzir um capítulo que já tem frases exige escolha explícita do usuário na interface — *sobrescrever tudo* ou *preservar frases com `editado_manualmente = 1`* (só as não editadas voltam a `pendente`). Nunca silencioso, porque destrói trabalho manual.
2. **Reimportação do texto de origem** (colar o capítulo de novo): recria a segmentação e portanto **invalida** frases existentes e os casos de teste ligados a elas (cascade). A interface avisa em destaque antes.
3. **Edição de `texto_pt`** marca `editado_manualmente = 1` e nunca toca `texto_pt_original_ia`. Aceitar correção do Protocolo de Revisão também atualiza `texto_pt`, mas mantém `editado_manualmente` distinguível pelo caso de teste `corrigido` vinculado.
4. **Mesclar/dividir frases (Fase 2):** operação transacional que renumera `ordem` do capítulo inteiro; casos de teste apontando para frases mescladas são religados à frase resultante.
5. **Exclusões:** excluir obra/capítulo pede confirmação com a contagem do que será perdido em cascata (frases, casos de teste, sugestões).

## Formato de exportação (decisão T5)

- **JSON por obra** (`dao-tale-export-v1`): `{ versao_schema, exportado_em, obra, prompts[], capitulos[{...capitulo, frases[]}], glossario[], banco_testes[], termos_sugeridos[] }`. Ids internos são preservados apenas como referências relativas dentro do arquivo; a reimportação (Fase 2) cria ids novos.
- **CSV avulso:** `glossario.csv` e `banco_testes.csv` com cabeçalho, UTF-8 com BOM (o BOM é necessário para o Excel no Windows abrir chinês corretamente).
