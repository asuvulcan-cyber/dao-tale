-- Doc 11 — telemetria de custo e qualidade (B8 da auditoria). Uma linha por
-- chamada de IA que devolveu `usage`: tokens reais, cache e custo em dinheiro.
--
-- `uso_ia` (migração 003) NÃO muda: continua contando TENTATIVAS por dia, antes
-- da chamada, que é o que a cota do provedor debita. Logo
-- requisicoes(uso_ia) >= chamadas(eventos_ia), e a diferença é o desperdício
-- (retries, 429, truncamento) — visível sem coluna nova.
--
-- ON DELETE SET NULL, não CASCADE: isto é livro-caixa. Apagar um capítulo não
-- desfaz o dinheiro que ele custou; a linha só deixa de ser atribuível a ele.

CREATE TABLE eventos_ia (
  id                   INTEGER PRIMARY KEY,
  -- UTC, ordena o histórico.
  em                   TEXT NOT NULL DEFAULT (datetime('now')),
  -- Data LOCAL YYYY-MM-DD: mesma chave de uso_ia, porque cota renova por dia-calendário.
  data                 TEXT NOT NULL,
  obra_id              INTEGER REFERENCES obras(id)     ON DELETE SET NULL,
  capitulo_id          INTEGER REFERENCES capitulos(id) ON DELETE SET NULL,
  papel                TEXT NOT NULL CHECK (papel IN
                         ('traducao','revisao','qa','extracao','refinamento','titulo','comparador')),
  provedor             TEXT NOT NULL,
  modelo               TEXT NOT NULL,
  -- NULL = a API do provedor não expõe o campo (≠ 0, que é medição).
  tokens_entrada       INTEGER,
  tokens_saida         INTEGER,
  tokens_cache_leitura INTEGER,
  tokens_cache_criacao INTEGER,
  -- USD calculado na gravação com a tabela de preços vigente; NULL = modelo sem
  -- preço cadastrado. Mudar preço não reescreve o histórico (há recálculo explícito).
  custo_estimado       REAL
);

CREATE INDEX idx_eventos_ia_obra     ON eventos_ia(obra_id, em);
CREATE INDEX idx_eventos_ia_capitulo ON eventos_ia(capitulo_id);
CREATE INDEX idx_eventos_ia_dia      ON eventos_ia(data, provedor);
