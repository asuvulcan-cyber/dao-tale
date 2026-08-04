-- Categoria de glossário passa a ser texto livre, como o tipo em shared sempre
-- descreveu ("o usuário cria as suas; CATEGORIAS_GLOSSARIO são sugestão").
--
-- O CHECK com seis valores contradizia isso desde sempre: cadastrar um termo com
-- categoria nova devolvia HTTP 500 com "CHECK constraint failed" vazando SQL
-- para a tela. Apareceu ao catalogar 刀/剑/枪 como 'objeto' — uma categoria que
-- faz todo sentido num wuxia e que o aplicativo não tinha como aceitar.
--
-- SQLite não remove CHECK com ALTER: recria a tabela. `origem` mantém o CHECK
-- dela (é vocabulário do próprio aplicativo, não do usuário). PRAGMA
-- foreign_keys já vem desligado durante as migrações, e o foreign_key_check
-- roda ao final.
CREATE TABLE glossario_novo (
  id         INTEGER PRIMARY KEY,
  obra_id    INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  termo_zh   TEXT NOT NULL,
  termo_pt   TEXT NOT NULL,
  categoria  TEXT NOT NULL DEFAULT 'outro',
  nota       TEXT,
  origem     TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','sugerido-ia')),
  criado_em  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  principal_id INTEGER REFERENCES glossario(id) ON DELETE SET NULL,
  UNIQUE (obra_id, termo_zh)
);

INSERT INTO glossario_novo (id, obra_id, termo_zh, termo_pt, categoria, nota, origem, criado_em, principal_id)
  SELECT id, obra_id, termo_zh, termo_pt, categoria, nota, origem, criado_em, principal_id FROM glossario;

DROP TABLE glossario;
ALTER TABLE glossario_novo RENAME TO glossario;

CREATE INDEX idx_glossario_principal ON glossario(principal_id);
