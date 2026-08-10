import { NavLink, Outlet, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Obra, TermoSugerido } from '@dao-tale/shared';
import { api } from '../api';

/** Só os campos que a contagem da aba precisa — o corpo inteiro de
 *  `GET /obras/:id/consistencia` está tipado em `ConsistenciaObra.tsx`. */
interface RelatorioConsistenciaResumo {
  por_termo: { violacoes: unknown[] }[];
}

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

  // Mesmo motivo da aba vizinha: sem contagem, a aba não distingue "12 frases
  // contradizem o termo que você acabou de cadastrar" de "nada aqui" — e é
  // exatamente essa distinção que o app precisa avisar da próxima vez (spec).
  // A rota calcula ao vivo (~6 ms medido), então não há custo em consultar
  // aqui só para o número da aba. Mesma `queryKey` de `ConsistenciaObra.tsx`
  // de propósito: com a aba aberta, os dois componentes dividem a mesma
  // entrada de cache em vez de disparar duas chamadas para o mesmo relatório.
  const { data: consistencia } = useQuery({
    queryKey: ['consistencia-obra', obraId],
    queryFn: () => api<RelatorioConsistenciaResumo>('GET', `/obras/${obraId}/consistencia`),
    refetchInterval: 30_000,
  });
  const totalViolacoes = consistencia?.por_termo.reduce((n, g) => n + g.violacoes.length, 0) ?? 0;

  const abas = [
    { rota: `/obras/${obraId}`, texto: 'Capítulos', exato: true },
    { rota: `/obras/${obraId}/glossario`, texto: 'Glossário' },
    // Colada no glossário: é a prestação de contas dele — o que o texto já
    // traduzido faz com os termos cadastrados. Longe daqui, viraria mais uma
    // tela que ninguém abre depois de cadastrar um termo tarde demais.
    { rota: `/obras/${obraId}/consistencia`, texto: `Consistência${totalViolacoes > 0 ? ` (${totalViolacoes})` : ''}` },
    { rota: `/obras/${obraId}/termos`, texto: `Termos sugeridos${sugestoes?.length ? ` (${sugestoes.length})` : ''}` },
    { rota: `/obras/${obraId}/prompt`, texto: 'Prompt mãe' },
    { rota: `/obras/${obraId}/testes`, texto: 'Banco de testes' },
    // Vizinha do banco de testes de propósito: são os dois canais de aprendizado
    // da obra, e o de baixo é o que o app ignorou por mais tempo — 146 edições
    // manuais contra 25 casos no canal oficial.
    { rota: `/obras/${obraId}/edicoes`, texto: 'Edições manuais' },
    { rota: `/obras/${obraId}/comparar`, texto: 'Comparar modelos' },
    { rota: `/obras/${obraId}/custos`, texto: 'Custos' },
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
