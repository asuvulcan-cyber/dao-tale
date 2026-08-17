import { describe, expect, it } from 'vitest';
import { montarMarcadorGlossario } from './TextoRico';

const entrada = (id: number, termo_zh: string, termo_pt: string) =>
  ({ id, obra_id: 1, termo_zh, termo_pt, categoria: 'outro', nota: null,
     origem: 'manual', principal_id: null, criado_em: '' }) as never;

const GLOSSARIO = [
  entrada(1, '杀手', 'Assassino'),
  entrada(2, '刀手', 'Homem de Sabre'),
  entrada(3, '刀', 'sabre'),
  entrada(4, '主子', 'senhor'),
  entrada(5, '中原', 'Planícies Centrais'),
  entrada(6, '飞鹰', 'Águia Voadora'),
];

const grifados = (texto: string) => montarMarcadorGlossario(GLOSSARIO)!.acharPt(texto).map((o) => o.trecho);

describe('grifo do glossário', () => {
  it('grifa o plural — era o buraco do relato', () => {
    expect(grifados('Os Assassinos atacaram.')).toEqual(['Assassinos']);
    expect(grifados('dois sabres')).toEqual(['sabres']);
  });

  it('grifa a variação de gênero', () => {
    expect(grifados('as Senhoras chegaram.')).toEqual(['Senhoras']);
  });

  it('a caixa continua indiferente', () => {
    expect(grifados('O assassino sorriu.')).toEqual(['assassino']);
  });

  it('o termo composto vence o termo contido nele', () => {
    // Antes desta entrega "Dois Homens de Sabre" grifava só "Sabre", e a glosa
    // apontava para 刀 — a entrada ERRADA. Grifo no lugar errado é pior que
    // grifo nenhum.
    expect(grifados('Dois Homens de Sabre entraram.')).toEqual(['Homens de Sabre']);
  });

  it('palavra curta não invade palavra maior', () => {
    const m = montarMarcadorGlossario([entrada(9, '王', 'rei')])!;
    expect(m.acharPt('o reino caiu')).toHaveLength(0);
    expect(m.acharPt('os reis caíram').map((o) => o.trecho)).toEqual(['reis']);
  });

  // O padrão é normalizado (sem acento) e o texto exibido não é. Casar um contra
  // o outro fazia "planici…" não bater em "Planícies" — e 30 dos 116 termos da
  // obra real têm acento, incluindo "Águia Voadora" e "Máscara Negra". Antes da
  // extração para shared o casamento era literal e funcionava: é regressão.
  describe('termo com acento', () => {
    it('é grifado', () => {
      expect(grifados('as Planícies Centrais ardiam')).toEqual(['Planícies Centrais']);
      expect(grifados('a Águia Voadora sumiu')).toEqual(['Águia Voadora']);
    });

    it('o trecho devolvido é o do texto ORIGINAL, com acento e caixa', () => {
      // Recortar do texto normalizado mostraria "planicies centrais" na tela.
      const [o] = montarMarcadorGlossario(GLOSSARIO)!.acharPt('as Planícies Centrais ardiam');
      expect(o.trecho).toBe('Planícies Centrais');
    });

    it('acento e flexão juntos', () => {
      expect(grifados('duas Águias Voadoras')).toEqual(['Águias Voadoras']);
    });

    it('acento FORA do termo não desloca o grifo', () => {
      // Regressão do RECORTE: o trecho tem de sair do texto original, na posição
      // certa, mesmo com acento antes dele.
      //
      // NÃO prova o mapa de índices: medido, a normalização preserva comprimento
      // para todo caractere que este app vê, então trocar o mapa por índices
      // diretos passa verde aqui. Ver o comentário de `normalizarComMapa`.
      const texto = 'o coração da órfã doía, e a Águia Voadora partiu';
      const [o] = montarMarcadorGlossario(GLOSSARIO)!.acharPt(texto);
      expect(o.trecho).toBe('Águia Voadora');
      expect(texto.slice(o.inicio, o.fim)).toBe('Águia Voadora');
    });
  });

  it('no chinês, o termo composto também vence o contido', () => {
    // 刀 é prefixo LITERAL de 刀手 — o mesmo defeito do "Homem de Sabre", do outro
    // lado. É a ordenação por tamanho que segura isto, e ela não tinha teste aqui.
    expect(montarMarcadorGlossario(GLOSSARIO)!.acharZh('两个刀手来了').map((o) => o.trecho)).toEqual(['刀手']);
  });

  it('a glosa acompanha a ocorrência, já resolvida', () => {
    // A glosa era indexada pelo termo canônico; com o trecho flexionado o
    // `Map.get` direto falhava e o revisor via grifo sem explicação no title.
    const [o] = montarMarcadorGlossario(GLOSSARIO)!.acharPt('Os Assassinos atacaram.');
    expect(o.glosa).toContain('杀手');
  });
});
