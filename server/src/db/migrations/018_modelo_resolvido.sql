-- Modelo que DE FATO atendeu a chamada, quando o provedor informa.
--
-- Pedir `gemini-flash-latest` é pedir um APELIDO: o Google resolve para um modelo
-- concreto (3.5 Flash, 3.6 Flash…) e contabiliza a cota naquele modelo. Como só
-- guardávamos o apelido, era impossível cruzar o nosso consumo com o painel do
-- provedor — e os limites gratuitos são POR MODELO (3.5 Flash: 20 req/dia;
-- 3.1 Flash Lite: 500).
--
-- NULL nas linhas antigas e nos provedores que não informam.
ALTER TABLE eventos_ia ADD COLUMN modelo_resolvido TEXT;
