import { useQuery } from '@tanstack/react-query';
import type { EstadoSessao } from '@dao-tale/shared';
import { api } from './api';

// Estado de sessão (doc 13 §3), em módulo próprio para o portão e a casca
// compartilharem o mesmo cache sem import circular.

export const CHAVE_SESSAO = ['sessao'] as const;

export function usarSessao() {
  return useQuery({
    queryKey: CHAVE_SESSAO,
    queryFn: () => api<EstadoSessao>('GET', '/sessao'),
    staleTime: 5 * 60_000,
    retry: 0,
  });
}
