CREATE TABLE revisao_literaria_lotes (
  id          INTEGER PRIMARY KEY,
  obra_id     INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  rotulo      TEXT NOT NULL,
  criterios   TEXT,
  status      TEXT NOT NULL DEFAULT 'aberto'
              CHECK (status IN ('aberto','concluido','arquivado')),
  criado_em   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_revisao_lotes_obra ON revisao_literaria_lotes(obra_id, criado_em);

CREATE TABLE revisoes_literarias (
  id                   INTEGER PRIMARY KEY,
  lote_id              INTEGER NOT NULL REFERENCES revisao_literaria_lotes(id) ON DELETE CASCADE,
  frase_id             INTEGER NOT NULL REFERENCES frases(id) ON DELETE CASCADE,
  texto_vigente_base   TEXT NOT NULL,
  texto_revisado       TEXT NOT NULL,
  justificativa        TEXT,
  categorias           TEXT NOT NULL DEFAULT '[]',
  status               TEXT NOT NULL DEFAULT 'pendente'
                       CHECK (status IN ('pendente','aprovada','rejeitada','conflito')),
  decidido_em          TEXT,
  criado_em            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  atualizado_em        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (lote_id, frase_id)
);

CREATE INDEX idx_revisao_frase ON revisoes_literarias(frase_id, status);
CREATE INDEX idx_revisao_lote_status ON revisoes_literarias(lote_id, status);
