import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NotaInline } from './NotaInline';

describe('NotaInline', () => {
  it('mostra apenas a chamada no fluxo e conserva a explicação no tooltip acessível', () => {
    render(<NotaInline texto="Explicação cultural longa." numero={1} />);
    expect(screen.getByText('[1]')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveAttribute('title', 'Explicação cultural longa.');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Explicação cultural longa.');
  });
});
