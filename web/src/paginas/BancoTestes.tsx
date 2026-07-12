import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CapituloResumo, CasoTeste, StatusCasoTeste } from '@dao-tale/shared';
import { api } from '../api';
import { Aviso, Botao, Etiqueta, STATUS_CASO_ROTULO } from '../App';

const POR_PAGINA = 25;

interface PaginaTestes {
  casos: CasoTeste[];
  total: number;
  pagina: number;
  limite: number;
}

export function BancoTestes() {
  const { obraId } = useParams();
  const clienteQuery = useQueryClient();
  const [status, setStatus] = useState('');
  const [veredito, setVeredito] = useState('');
  const [secao, setSecao] = useState('');
  const [capitulo, setCapitulo] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [pagina, setPagina] = useState(1);
  const [erro, setErro] = useState('');

  const { data: capitulos } = useQuery({
    queryKey: ['capitulos', obraId],
    queryFn: () => api<CapituloResumo[]>('GET', `/obras/${obraId}/capitulos`),
  });

  const { data } = useQuery({
    queryKey: ['testes', obraId, status, veredito, secao, capitulo, de, ate, pagina],
    queryFn: () =>
      api<PaginaTestes>(
        'GET',
        `/obras/${obraId}/testes?status=${status}&veredito=${veredito}&secao_regra=${encodeURIComponent(secao)}` +
          `&capitulo=${capitulo}&de=${de}&ate=${ate}&pagina=${pagina}&limite=${POR_PAGINA}`,
      ),
  });
  const casos = data?.casos;
  const totalPaginas = data ? Math.max(1, Math.ceil(data.total / POR_PAGINA)) : 1;

  const mudarFiltro = <T,>(setter: (v: T) => void) => (valor: T) => {
    setter(valor);
    setPagina(1);
  };

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
            <button key={r.secao_regra} onClick={() => mudarFiltro(setSecao)(r.secao_regra)} className="mr-2 underline">
              {r.secao_regra} ({r.casos})
            </button>
          ))}
          — considere revisar o prompt mãe.
        </Aviso>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={status} onChange={(e) => mudarFiltro(setStatus)(e.target.value)} className="rounded border border-stone-300 px-2 py-1.5 text-sm">
          <option value="">Todos os status</option>
          {Object.entries(STATUS_CASO_ROTULO).map(([valor, r]) => (
            <option key={valor} value={valor}>
              {r.texto}
            </option>
          ))}
        </select>
        <select value={veredito} onChange={(e) => mudarFiltro(setVeredito)(e.target.value)} className="rounded border border-stone-300 px-2 py-1.5 text-sm">
          <option value="">Todos os vereditos</option>
          <option value="correto">Correto</option>
          <option value="incorreto">Incorreto</option>
        </select>
        <select value={capitulo} onChange={(e) => mudarFiltro(setCapitulo)(e.target.value)} className="rounded border border-stone-300 px-2 py-1.5 text-sm">
          <option value="">Todos os capítulos</option>
          {capitulos?.map((c) => (
            <option key={c.id} value={c.id}>
              Capítulo {c.numero}
            </option>
          ))}
        </select>
        <input
          value={secao}
          onChange={(e) => mudarFiltro(setSecao)(e.target.value)}
          placeholder="Filtrar por seção/regra…"
          className="rounded border border-stone-300 px-2 py-1.5 text-sm"
        />
        <label className="flex items-center gap-1 text-xs text-stone-500">
          de
          <input type="date" value={de} onChange={(e) => mudarFiltro(setDe)(e.target.value)} className="rounded border border-stone-300 px-2 py-1 text-sm" />
        </label>
        <label className="flex items-center gap-1 text-xs text-stone-500">
          até
          <input type="date" value={ate} onChange={(e) => mudarFiltro(setAte)(e.target.value)} className="rounded border border-stone-300 px-2 py-1 text-sm" />
        </label>
        {(status || veredito || secao || capitulo || de || ate) && (
          <button
            onClick={() => { setStatus(''); setVeredito(''); setSecao(''); setCapitulo(''); setDe(''); setAte(''); setPagina(1); }}
            className="text-xs text-stone-500 underline"
          >
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
          Nenhum caso encontrado. Os casos são criados automaticamente quando você pergunta sobre uma frase no
          editor.
        </p>
      )}
      {data && data.total > 0 && (
        <p className="mb-2 text-xs text-stone-500">
          {data.total} caso{data.total === 1 ? '' : 's'} · página {pagina} de {totalPaginas}
        </p>
      )}

      <div className="space-y-3">
        {casos?.map((caso) => {
          const rotulo = STATUS_CASO_ROTULO[caso.status];
          return (
            <div key={caso.id} className="rounded-lg border border-stone-300 bg-white p-4 text-sm">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Etiqueta cor={rotulo.cor}>{rotulo.texto}</Etiqueta>
                <Etiqueta cor={caso.veredito === 'correto' ? 'jade' : 'selo'}>{caso.veredito}</Etiqueta>
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

      {totalPaginas > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Botao variante="secundario" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
            ← Anterior
          </Botao>
          <span className="text-sm text-stone-600">
            {pagina} / {totalPaginas}
          </span>
          <Botao variante="secundario" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>
            Próxima →
          </Botao>
        </div>
      )}
    </div>
  );
}
