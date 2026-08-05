-- Ocorrências de consistência de glossário dispensadas pelo revisor.
--
-- A varredura acusa termo do glossário presente no chinês cuja forma catalogada
-- não aparece no português. Isso é útil, mas nem toda ausência é erro: quando o
-- referente já está estabelecido, o português OMITE em vez de repetir — em
-- 夜闯庄园 ("invadiram a propriedade à noite") a tradução "daqueles invasores"
-- está certa, e forçar "propriedade" ali pioraria a prosa.
--
-- Sem um lugar para registrar "esta eu já olhei e está certa", o indicador fica
-- aceso para sempre e o revisor aprende a ignorá-lo — que é o pior desfecho
-- possível para um aviso.
--
-- Dispensa é por PAR (frase, termo): não desliga o termo na obra inteira, e
-- some junto com a frase se ela for apagada.
CREATE TABLE consistencia_ignorada (
  frase_id   INTEGER NOT NULL REFERENCES frases(id) ON DELETE CASCADE,
  termo_zh   TEXT NOT NULL,
  criado_em  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (frase_id, termo_zh)
);
