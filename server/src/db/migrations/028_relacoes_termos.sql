-- Grafo narrativo do Gama. Não substitui principal_id (mesmo referente) nem
-- termo_pai_id (pertencimento/localização estritos).
CREATE TABLE relacoes_termos (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  obra_id           INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  origem_termo_id   INTEGER NOT NULL REFERENCES glossario(id) ON DELETE CASCADE,
  destino_termo_id  INTEGER NOT NULL REFERENCES glossario(id) ON DELETE CASCADE,
  tipo              TEXT NOT NULL,
  nota              TEXT,
  capitulo_inicio   INTEGER,
  capitulo_fim      INTEGER,
  confirmado_por    TEXT NOT NULL DEFAULT 'humano',
  criado_em         TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (origem_termo_id <> destino_termo_id),
  CHECK (capitulo_inicio IS NULL OR capitulo_inicio >= 0),
  CHECK (capitulo_fim IS NULL OR capitulo_fim >= 0),
  CHECK (capitulo_inicio IS NULL OR capitulo_fim IS NULL OR capitulo_fim >= capitulo_inicio),
  UNIQUE (obra_id, origem_termo_id, destino_termo_id, tipo)
);

CREATE INDEX idx_relacoes_termos_obra ON relacoes_termos(obra_id);
CREATE INDEX idx_relacoes_termos_origem ON relacoes_termos(origem_termo_id);
CREATE INDEX idx_relacoes_termos_destino ON relacoes_termos(destino_termo_id);
