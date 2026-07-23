-- Doc 09 §6/§9: passada de QA por segunda IA. Os apontamentos são triados pelo
-- humano; a IA nunca reescreve sozinha. capitulos.qa_em distingue "QA limpo"
-- de "QA nunca rodou".

ALTER TABLE capitulos ADD COLUMN qa_em TEXT;

CREATE TABLE qa_apontamentos (
  id          INTEGER PRIMARY KEY,
  capitulo_id INTEGER NOT NULL REFERENCES capitulos(id) ON DELETE CASCADE,
  frase_id    INTEGER REFERENCES frases(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('glossario','pronome-genero','repeticao','omissao','outro')),
  severidade  TEXT NOT NULL DEFAULT 'media' CHECK (severidade IN ('alta','media','baixa')),
  trecho_zh   TEXT,
  observacao  TEXT NOT NULL,
  sugestao    TEXT,
  status      TEXT NOT NULL DEFAULT 'pendente'
              CHECK (status IN ('pendente','aceito','descartado')),
  provedor    TEXT NOT NULL,
  modelo      TEXT NOT NULL,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_qa_capitulo_status ON qa_apontamentos(capitulo_id, status);
