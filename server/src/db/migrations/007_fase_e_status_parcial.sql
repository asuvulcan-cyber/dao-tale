-- Doc 09: fase do pipeline por obra (calibração → cruzeiro, decisão do usuário)
-- e status 'parcial' de capítulo (M6 — job que termina incompleto nunca mais
-- deixa o capítulo preso em 'traduzindo').

ALTER TABLE obras ADD COLUMN fase_traducao TEXT NOT NULL DEFAULT 'calibracao'
  CHECK (fase_traducao IN ('calibracao', 'cruzeiro'));

-- capitulos.status ganha 'parcial' — CHECK exige rebuild (padrão da migração 002).
CREATE TABLE capitulos_novo (
  id            INTEGER PRIMARY KEY,
  obra_id       INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  numero        INTEGER NOT NULL,
  titulo        TEXT,
  titulo_pt     TEXT,
  status        TEXT NOT NULL DEFAULT 'rascunho'
                CHECK (status IN ('rascunho','traduzindo','parcial','traduzido','revisado','finalizado')),
  texto_origem  TEXT NOT NULL,
  provedor      TEXT,
  modelo        TEXT,
  prompt_id     INTEGER REFERENCES prompts(id),
  nucleo_id     INTEGER REFERENCES prompt_padrao(id),
  -- Violações de consistência do glossário na última varredura local (D5);
  -- NULL = ainda não varrido. Atualizado ao concluir o job e sob demanda.
  consistencia_violacoes INTEGER,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (obra_id, numero)
);

INSERT INTO capitulos_novo (id, obra_id, numero, titulo, titulo_pt, status, texto_origem, provedor, modelo, prompt_id, nucleo_id, criado_em, atualizado_em)
  SELECT id, obra_id, numero, titulo, titulo_pt,
         -- Capítulo preso em 'traduzindo' de uma sessão antiga (M6): nenhum job
         -- sobrevive ao processo, então o estado real é parcial.
         CASE WHEN status = 'traduzindo' THEN 'parcial' ELSE status END,
         texto_origem, provedor, modelo, prompt_id, nucleo_id, criado_em, atualizado_em
  FROM capitulos;

DROP TABLE capitulos;
ALTER TABLE capitulos_novo RENAME TO capitulos;
