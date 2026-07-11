-- Obras: sinopse, tags (JSON array em texto) e capa (imagem pequena, BLOB —
-- app local e mono-usuário, dispensa arquivos soltos no disco).
ALTER TABLE obras ADD COLUMN sinopse TEXT;
ALTER TABLE obras ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
ALTER TABLE obras ADD COLUMN capa BLOB;
ALTER TABLE obras ADD COLUMN capa_mime TEXT;

-- Contagem local de requisições à IA por dia (data local YYYY-MM-DD), para o
-- indicador de cota gratuita — os provedores não expõem o consumo via API.
CREATE TABLE uso_ia (
  data        TEXT NOT NULL,
  provedor    TEXT NOT NULL,
  modelo      TEXT NOT NULL,
  requisicoes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (data, provedor, modelo)
);
