import { NavLink, Outlet, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Obra, TermoSugerido } from '@dao-tale/shared';
import { api } from '../api';

export function ObraLayout() {
  const { obraId } = useParams();

  const { data: obra } = useQuery({
    queryKey: ['obra', obraId],
    queryFn: () => api<Obra>('GET', `/obras/${obraId}`),
  });

  const { data: sugestoes } = useQuery({
    queryKey: ['termos-sugeridos', obraId, 'pendente'],
    queryFn: () => api<TermoSugerido[]>('GET', `/obras/${obraId}/termos-sugeridos?status=pendente`),
    refetchInterval: 30_000,
  });

  const abas = [
    { rota: `/obras/${obraId}`, texto: 'Capítulos', exato: true },
    { rota: `/obras/${obraId}/glossario`, texto: 'Glossário' },
    { rota: `/obras/${obraId}/termos`, texto: `Termos sugeridos${sugestoes?.length ? ` (${sugestoes.length})` : ''}` },
    { rota: `/obras/${obraId}/prompt`, texto: 'Prompt mãe' },
    { rota: `/obras/${obraId}/testes`, texto: 'Banco de testes' },
  ];

  return (
    <div>
      <div className="mb-2 flex items-baseline gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{obra?.titulo ?? '…'}</h1>
        {obra?.titulo_original && <span className="texto-zh text-tinta-2">{obra.titulo_original}</span>}
      </div>
      <nav className="mb-5 flex flex-wrap gap-1 border-b border-linha">
        {abas.map((aba) => (
          <NavLink
            key={aba.rota}
            to={aba.rota}
            end={aba.exato}
            className={({ isActive }) =>
              `-mb-px rounded-t border-b-2 px-3 py-1.5 text-sm ${
                isActive
                  ? 'border-jade font-semibold text-tinta'
                  : 'border-transparent text-tinta-2 hover:text-tinta'
              }`
            }
          >
            {aba.texto}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
