-- Violações de estilo dispensadas pelo revisor.
--
-- A varredura de estilo é heurística por sufixo: acusa `-ara/-era/-ira/-ora` e
-- desconta uma lista de não-verbos. O que escapa da lista vira alerta que o
-- revisor olha, julga desnecessário — e não tem como tirar da tela.
--
-- Mesmo desfecho que a consistência já resolveu: aviso que não se apaga é aviso
-- que se aprende a ignorar, e aí some junto o que era de verdade.
--
-- Quando o falso positivo for a PALAVRA (romãzeira, embora, prepara), o lugar
-- certo continua sendo a lista de exceções do scanner — conserta para todas as
-- obras de uma vez. Esta tabela é para o resto: o caso que depende da frase, e
-- a ocorrência que o revisor simplesmente decidiu manter.
--
-- Por TRINCA (frase, regra, trecho): não desliga a regra no capítulo inteiro, e
-- some junto com a frase se ela for apagada.
CREATE TABLE estilo_ignorado (
  frase_id   INTEGER NOT NULL REFERENCES frases(id) ON DELETE CASCADE,
  regra      TEXT NOT NULL,
  trecho     TEXT NOT NULL,
  criado_em  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (frase_id, regra, trecho)
);
