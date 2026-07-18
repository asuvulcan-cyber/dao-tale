-- Variantes de termo: uma entrada pode apontar para outra (a canônica) como
-- forma alternativa do mesmo referente — ex.: 芊芊 (Qianqian) é variante de
-- 林芊 (Lin Qian); 云秦 (Yunqin) é variante de 云秦帝国 (Império Yunqin).
-- Cada variante mantém a própria tradução; o vínculo só registra que são a
-- mesma pessoa/lugar. ON DELETE SET NULL: apagar a canônica solta as variantes
-- (viram canônicas de novo), nunca as apaga junto.
ALTER TABLE glossario ADD COLUMN principal_id INTEGER REFERENCES glossario(id) ON DELETE SET NULL;
CREATE INDEX idx_glossario_principal ON glossario(principal_id);
