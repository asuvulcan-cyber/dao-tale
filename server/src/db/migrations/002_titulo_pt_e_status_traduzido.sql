-- Capítulos: nova coluna titulo_pt (título traduzido pela IA) e o status
-- 'traduzido' (job concluído, aguardando revisão) no CHECK — SQLite não altera
-- CHECK em ALTER TABLE, então a tabela é recriada (FKs ficam OFF no runner).

CREATE TABLE capitulos_novo (
  id            INTEGER PRIMARY KEY,
  obra_id       INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  numero        INTEGER NOT NULL,
  titulo        TEXT,
  titulo_pt     TEXT,
  status        TEXT NOT NULL DEFAULT 'rascunho'
                CHECK (status IN ('rascunho','traduzindo','traduzido','revisado','finalizado')),
  texto_origem  TEXT NOT NULL,
  provedor      TEXT,
  modelo        TEXT,
  prompt_id     INTEGER REFERENCES prompts(id),
  criado_em     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (obra_id, numero)
);

INSERT INTO capitulos_novo (id, obra_id, numero, titulo, status, texto_origem, provedor, modelo, prompt_id, criado_em, atualizado_em)
  SELECT id, obra_id, numero, titulo, status, texto_origem, provedor, modelo, prompt_id, criado_em, atualizado_em FROM capitulos;

DROP TABLE capitulos;
ALTER TABLE capitulos_novo RENAME TO capitulos;
