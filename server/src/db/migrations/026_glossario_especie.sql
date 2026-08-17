-- Espécie do termo, nota de caixa e pertencimento (spec 2026-08-16).
--
-- O glossário guardava duas coisas diferentes sob a mesma lei: nome próprio,
-- onde a FORMA é a resposta (金鹏堡 → Fortaleza do Peng Dourado), e escolha
-- lexical, onde a PALAVRA é a resposta e a forma tem de flexionar livremente
-- (刀 → sabre). Medido na obra 1: 杀手 saiu 57× em minúscula e 25× em maiúscula,
-- porque nada dizia quando ele é o posto da Fortaleza e quando é substantivo
-- comum.
--
-- `especie` é ANULÁVEL de propósito, e não NOT NULL DEFAULT 'identidade': o NULL
-- distingue "nunca classificado" de "classificado como identidade", e é isso que
-- permite a tela pedir a classificação dos 116 termos antigos sem incomodar quem
-- já respondeu. Sem backfill por heurística — os 41 termos em minúscula são
-- convenção do revisor, não dado, e chutar 116 vezes gera o falso positivo que
-- treina a ignorar a tela.
--
-- `termo_pai_id` é PERTENCIMENTO (西堡 fica dentro de 金鹏堡), distinto de
-- `principal_id`, que já existe e diz variante do MESMO referente (芊芊 = 林芊).
-- Um termo pode ter os dois.
ALTER TABLE glossario ADD COLUMN especie TEXT;
ALTER TABLE glossario ADD COLUMN nota_uso TEXT;
ALTER TABLE glossario ADD COLUMN ambiguo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE glossario ADD COLUMN termo_pai_id INTEGER REFERENCES glossario(id);
