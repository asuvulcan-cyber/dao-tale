import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PortaoSessao } from './PortaoSessao';

const { usarSessao } = vi.hoisted(() => ({ usarSessao: vi.fn() }));

vi.mock('../sessao', async (importOriginal) => {
  const original = await importOriginal<typeof import('../sessao')>();
  return { ...original, usarSessao };
});

function renderizar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <PortaoSessao vitrine={<p>Vitrine pública</p>}>
        <p>Bancada privada</p>
      </PortaoSessao>
    </QueryClientProvider>,
  );
}

describe('PortaoSessao', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra carregamento enquanto consulta a sessão', () => {
    usarSessao.mockReturnValue({ isPending: true, isError: false });

    renderizar();

    expect(screen.getByText('Carregando…')).toBeInTheDocument();
  });

  it('mantém visitantes sem sessão na vitrine', () => {
    usarSessao.mockReturnValue({ data: { autenticado: false }, isPending: false, isError: false });

    renderizar();

    expect(screen.getByText('Vitrine pública')).toBeInTheDocument();
    expect(screen.queryByText('Bancada privada')).not.toBeInTheDocument();
  });

  it('libera a bancada para uma sessão autenticada', () => {
    usarSessao.mockReturnValue({ data: { autenticado: true }, isPending: false, isError: false });

    renderizar();

    expect(screen.getByText('Bancada privada')).toBeInTheDocument();
    expect(screen.queryByText('Vitrine pública')).not.toBeInTheDocument();
  });
});
