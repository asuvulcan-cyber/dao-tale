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
  custo_estimado       REAL,
  -- Migração 018: modelo que DE FATO atendeu a chamada (apelidos como
  -- "gemini-flash-latest" resolvem para um concreto). Faltava aqui no rebuild
  -- perderia essa coluna e todo o histórico de modelo_resolvido junto.
  modelo_resolvido     TEXT
);

INSERT INTO eventos_ia_novo
  (id, em, data, obra_id, capitulo_id, papel, provedor, modelo,
   tokens_entrada, tokens_saida, tokens_cache_leitura, tokens_cache_criacao, custo_estimado,
   modelo_resolvido)
  SELECT id, em, data, obra_id, capitulo_id, papel, provedor, modelo,
         tokens_entrada, tokens_saida, tokens_cache_leitura, tokens_cache_criacao, custo_estimado,
         modelo_resolvido
  FROM eventos_ia;

DROP TABLE eventos_ia;
ALTER TABLE eventos_ia_novo RENAME TO eventos_ia;

CREATE INDEX idx_eventos_ia_obra     ON eventos_ia(obra_id, em);
CREATE INDEX idx_eventos_ia_capitulo ON eventos_ia(capitulo_id);
CREATE INDEX idx_eventos_ia_dia      ON eventos_ia(data, provedor);

ALTER TABLE frases ADD COLUMN origem_edicao TEXT;
