import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Frase, RevisaoLiteraria } from '@dao-tale/shared';
import { ComparacaoRevisaoLiteraria } from './ComparacaoRevisaoLiteraria';

const frase = (id: number, ordem: number, paragrafo: number, pt: string): Frase => ({
  id, capitulo_id: 1, ordem, paragrafo, texto_zh: `中${ordem}`, texto_pt: pt,
  texto_pt_original_ia: `IA ${ordem}.`, editado_manualmente: false,
  status_traducao: 'traduzida', origem_edicao: null,
});

describe('comparação literária integral', () => {
  it('renderiza todas as frases em ordem, inclusive as que não têm proposta', () => {
    const frases = [frase(2, 1, 0, 'Segunda.'), frase(1, 0, 0, 'Primeira.'), frase(3, 2, 1, 'Terceira.')];
    const revisao = {
      id: 1, lote_id: 7, lote_rotulo: 'Integral', frase_id: 2, capitulo_id: 1,
      capitulo_numero: 0, ordem: 1, paragrafo: 0, texto_zh: '中1', texto_pt_original_ia: 'IA 1.',
      texto_vigente_atual: 'Segunda.', texto_vigente_base: 'Segunda.', texto_revisado: 'Segunda revisada.',
      justificativa: 'Ritmo.', categorias: ['ritmo'], status: 'pendente', decidido_em: null,
      criado_em: '', atualizado_em: '',
    } satisfies RevisaoLiteraria;
    const { container, getByText } = render(
      <QueryClientProvider client={new QueryClient()}>
        <ComparacaoRevisaoLiteraria revisoes={[revisao]} frases={frases} capituloId="1" capituloNumero={0} aoFechar={() => {}} aoIrParaFrase={() => {}} />
      </QueryClientProvider>,
    );
    const revisado = [...container.querySelectorAll('[data-coluna="revisado"] [data-ordem]')];
    expect(revisado.map((e) => e.getAttribute('data-ordem'))).toEqual(['0', '1', '2']);
    expect(revisado.map((e) => e.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining('Primeira.'), expect.stringContaining('Segunda revisada.'), expect.stringContaining('Terceira.'),
    ]));
    expect(getByText('Capítulo 0 · revisão literária em sombra')).toBeTruthy();
  });
});
