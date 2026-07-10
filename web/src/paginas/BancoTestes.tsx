import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CasoTeste, StatusCasoTeste } from '@dao-tale/shared';
import { api } from '../api';
import { Aviso, Botao, Etiqueta, STATUS_CASO_ROTULO } from '../App';

export function BancoTestes() {
  const { obraId } = useParams();
  const clienteQuery = useQueryClient();
  const [status, setStatus] = useState('');
  const [veredito, setVeredito] = useState('');
  const [secao, setSecao] = useState('');
  const [erro, setErro] = useState('');

  const { data: casos } = useQuery({
    queryKey: ['testes', obraId, status, veredito, secao],
    queryFn: () =>
      api<CasoTeste[]>(
        'GET',
        `/obras/${obraId}/testes?status=${status}&veredito=${veredito}&secao_regra=${encodeURIComponent(secao)}`,
      ),
  });

  const { data: recorrencias } = useQuery({
    queryKey: ['recorrencias', obraId],
    queryFn: () => api<{ secao_regra: string; casos: number }[]>('GET', `/obras/${obraId}/testes/recorrencias`),
  });

  const invalidar = () => {
    clienteQuery.invalidateQueries({ queryKey: ['testes', obraId] });
    clienteQuery.invalidateQueries({ queryKey: ['recorrencias', obraId] });
  };

  const mudarStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: StatusCasoTeste }) =>
      api('PATCH', `/testes/${id}`, { status }),
    onSuccess: invalidar,
    onError: (e) => setErro((e as Error).message),
  });

  const aplicar = useMutation({
    mutationFn: (id: number) => api('POST', `/testes/${id}/aplicar-correcao`),
    onSuccess: invalidar,
    onError: (e) => setErro((e as Error).message),
  });

  return (
    <div>
      {recorrencias && recorrencias.length > 0 && (
        <Aviso tipo="info">
          <strong>Padrões recorrentes:</strong> há 2+ casos não confirmados nas regras{' '}
          {recorrencias.map((r) => (
            <button key={r.secao_regra} onClick={() => setSecao(r.secao_regra)} className="mr-2 underline">
              {r.secao_regra} ({r.casos})
            </button>
          ))}
          — considere revisar o prompt mãe.
        </Aviso>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border border-stone-300 px-2 py-1.5 text-sm">
          <option value="">Todos os status</option>
          {Object.entries(STATUS_CASO_ROTULO).map(([valor, r]) => (
            <option key={valor} value={valor}>
              {r.texto}
            </option>
          ))}
        </select>
        <select value={veredito} onChange={(e) => setVeredito(e.target.value)} className="rounded border border-stone-300 px-2 py-1.5 text-sm">
          <option value="">Todos os vereditos</option>
          <option value="correto">Correto</option>
          <option value="incorreto">Incorreto</option>
        </select>
        <input
          value={secao}
          onChange={(e) => setSecao(e.target.value)}
          placeholder="Filtrar por seção/regra…"
          className="rounded border border-stone-300 px-2 py-1.5 text-sm"
        />
        {(status || veredito || secao) && (
          <button onClick={() => { setStatus(''); setVeredito(''); setSecao(''); }} className="text-xs text-stone-500 underline">
            limpar filtros
          </button>
        )}
        <a className="ml-auto" href={`/api/obras/${obraId}/testes/exportar`} download>
          <Botao variante="secundario">Exportar CSV</Botao>
        </a>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {casos?.length === 0 && (
        <p className="text-stone-500">
          Nenhum caso registrado ainda. Os casos são criados automaticamente quando você pergunta sobre uma frase no
          editor.
        </p>
      )}

      <div className="space-y-3">
        {casos?.map((caso) => {
          const rotulo = STATUS_CASO_ROTULO[caso.status];
          return (
            <div key={caso.id} className="rounded-lg border border-stone-300 bg-white p-4 text-sm">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Etiqueta cor={rotulo.cor}>{rotulo.texto}</Etiqueta>
                <Etiqueta cor={caso.veredito === 'correto' ? 'green' : 'red'}>{caso.veredito}</Etiqueta>
                {caso.secao_regra && <Etiqueta>{caso.secao_regra}</Etiqueta>}
                <span className="text-xs text-stone-400">
                  #{caso.id} · {caso.provedor}/{caso.modelo} · {new Date(caso.criado_em).toLocaleString('pt-BR')}
                </span>
              </div>
              <p className="texto-zh mb-1 rounded bg-stone-50 px-2 py-1">{caso.trecho_zh}</p>
              <p className="mb-1">
                <span className="font-medium">Pergunta:</span> {caso.pergunta}
              </p>
              <p className="mb-1 text-stone-700">
                <span className="font-medium">Justificativa:</span> {caso.justificativa}
              </p>
              {caso.correcao_proposta && (
                <p className="mb-2 rounded border border-amber-200 bg-amber-50 px-2 py-1">
                  <span className="font-medium">Correção proposta:</span> {caso.correcao_proposta}
                </p>
              )}
              <div className="flex gap-2">
                {caso.status === 'pendente' && caso.correcao_proposta && (
                  <Botao onClick={() => aplicar.mutate(caso.id)} disabled={aplicar.isPending}>
                    Aplicar correção
                  </Botao>
                )}
                {caso.status === 'pendente' && (
                  <Botao
                    variante="secundario"
                    onClick={() => mudarStatus.mutate({ id: caso.id, status: 'regra-nova-necessaria' })}
                  >
                    Marcar “regra nova necessária”
                  </Botao>
                )}
                {caso.status === 'regra-nova-necessaria' && (
                  <Botao
                    variante="secundario"
                    onClick={() => mudarStatus.mutate({ id: caso.id, status: 'pendente' })}
                  >
                    Voltar para pendente
                  </Botao>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
