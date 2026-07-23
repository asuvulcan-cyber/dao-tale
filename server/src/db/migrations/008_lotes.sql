-- Doc 09 §5/§9: fila de tradução em lote durável (fase de cruzeiro).
-- Todo avanço de estado é gravado — reiniciar o servidor não perde progresso,
-- só interrompe a execução (lotes 'executando' viram 'interrompido' no boot).

CREATE TABLE lotes (
  id            INTEGER PRIMARY KEY,
  obra_id       INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'executando'
                CHECK (status IN ('executando','concluido','cancelado','interrompido')),
  qa_automatica INTEGER NOT NULL DEFAULT 0,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  encerrado_em  TEXT
);

-- Um lote ativo por obra (a fila é sequencial-com-paralelismo, não concorrente).
CREATE UNIQUE INDEX idx_lote_ativo ON lotes(obra_id) WHERE status = 'executando';

CREATE TABLE lote_capitulos (
  lote_id      INTEGER NOT NULL REFERENCES lotes(id) ON DELETE CASCADE,
  capitulo_id  INTEGER NOT NULL REFERENCES capitulos(id) ON DELETE CASCADE,
  posicao      INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'na_fila'
               CHECK (status IN ('na_fila','traduzindo','qa','concluido','erro','cancelado')),
  -- JSON dos pares {provedor, modelo} já tentados neste capítulo (failover 1×/par).
  provedores_tentados TEXT NOT NULL DEFAULT '[]',
  erro         TEXT,
  PRIMARY KEY (lote_id, capitulo_id)
);

CREATE INDEX idx_lote_capitulos_lote ON lote_capitulos(lote_id, posicao);
