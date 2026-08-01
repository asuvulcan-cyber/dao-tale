-- Doc 12 — autor da obra. Faltava um campo que o EPUB precisa: sem dc:creator a
-- obra entra na estante do e-reader como "Unknown author". É metadado do original
-- (o autor chinês), não do tradutor — este último vai fixo como dc:contributor.
ALTER TABLE obras ADD COLUMN autor TEXT;
