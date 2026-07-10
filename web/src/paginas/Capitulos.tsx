import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Capitulo, CapituloResumo } from '@dao-tale/shared';
import { api } from '../api';
import { Aviso, Botao, Etiqueta, STATUS_CAPITULO_ROTULO } from '../App';

export function Capitulos() {
  const { obraId } = useParams();
  const navegar = useNavigate();
  const clienteQuery = useQueryClient();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [erro, setErro] = useState('');
  const [avisosSegmentacao, setAvisosSegmentacao] = useState<string[]>([]);

  const { data: capitulos, isLoading } = useQuery({
    queryKey: ['capitulos', obraId],
    queryFn: () => api<CapituloResumo[]>('GET', `/obras/${obraId}/capitulos`),
  });

  const criar = useMutation({
    mutationFn: (dados: { numero: number; titulo?: string; texto_origem: string }) =>
      api<{ capitulo: Capitulo; frases_total: number; avisos: string[] }>(
        'POST',
        `/obras/${obraId}/capitulos`,
        dados,
      ),
    onSuccess: (resultado) => {
      clienteQuery.invalidateQueries({ queryKey: ['capitulos', obraId] });
      setErro('');
      if (resultado.avisos.length > 0) {
        setAvisosSegmentacao(resultado.avisos);
      } else {
        navegar(`/obras/${obraId}/capitulos/${resultado.capitulo.id}`);
      }
      setMostrarFormulario(false);
    },
    onError: (e) => setErro((e as Error).message),
  });

  const excluir = useMutation({
    mutationFn: async (cap: CapituloResumo) => {
      const impacto = await api<Record<string, number>>('DELETE', `/capitulos/${cap.id}?simular=1`);
      const detalhe = Object.entries(impacto)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${n} ${k.replace('_', ' ')}`)
        .join(', ');
      if (!window.confirm(`Excluir o capítulo ${cap.numero}?${detalhe ? `\n\nSerão perdidos: ${detalhe}.` : ''}`)) return;
      await api('DELETE', `/capitulos/${cap.id}`);
    },
    onSuccess: () => clienteQuery.invalidateQueries({ queryKey: ['capitulos', obraId] }),
    onError: (e) => setErro((e as Error).message),
  });

  const proximoNumero = capitulos && capitulos.length > 0 ? Math.max(...capitulos.map((c) => c.numero)) + 1 : 1;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Capítulos</h2>
        <Botao onClick={() => setMostrarFormulario((v) => !v)}>
          {mostrarFormulario ? 'Cancelar' : 'Novo capítulo'}
        </Botao>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {avisosSegmentacao.length > 0 && (
        <Aviso tipo="info">
          Capítulo criado, mas a segmentação encontrou pontos de atenção:
          <ul className="list-inside list-disc">
            {avisosSegmentacao.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </Aviso>
      )}

      {mostrarFormulario && (
        <FormularioNovoCapitulo
          numeroSugerido={proximoNumero}
          enviando={criar.isPending}
          aoEnviar={(dados) => criar.mutate(dados)}
        />
      )}

      {isLoading && <p className="text-stone-500">Carregando…</p>}
      {capitulos?.length === 0 && !mostrarFormulario && (
        <p className="text-stone-500">Nenhum capítulo ainda. Cole o texto chinês em “Novo capítulo”.</p>
      )}

      <div className="space-y-2">
        {capitulos?.map((cap) => {
          const rotulo = STATUS_CAPITULO_ROTULO[cap.status];
          return (
            <div key={cap.id} className="flex items-center justify-between rounded-lg border border-stone-300 bg-white px-4 py-3">
              <Link to={`/obras/${obraId}/capitulos/${cap.id}`} className="flex-1 hover:underline">
                <span className="font-semibold">Capítulo {cap.numero}</span>
                {cap.titulo && <span className="ml-2 text-stone-600">{cap.titulo}</span>}
              </Link>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-stone-500">
                  {cap.frases_traduzidas}/{cap.frases_total} frases
                  {cap.frases_erro > 0 && <span className="text-red-600"> · {cap.frases_erro} com erro</span>}
                </span>
                <Etiqueta cor={rotulo.cor}>{rotulo.texto}</Etiqueta>
                <Botao variante="perigo" onClick={() => excluir.mutate(cap)}>
                  Excluir
                </Botao>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FormularioNovoCapitulo({
  numeroSugerido,
  aoEnviar,
  enviando,
}: {
  numeroSugerido: number;
  aoEnviar: (dados: { numero: number; titulo?: string; texto_origem: string }) => void;
  enviando: boolean;
}) {
  const [numero, setNumero] = useState(numeroSugerido);
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const inputArquivo = useRef<HTMLInputElement>(null);

  async function carregarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (arquivo) setTexto(await arquivo.text());
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        aoEnviar({ numero, titulo: titulo.trim() || undefined, texto_origem: texto });
      }}
      className="mb-6 space-y-3 rounded-lg border border-stone-300 bg-white p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Número*
          <input
            type="number"
            required
            value={numero}
            onChange={(e) => setNumero(Number(e.target.value))}
            className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5"
          />
        </label>
        <label className="block text-sm">
          Título (opcional)
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5"
          />
        </label>
      </div>
      <label className="block text-sm">
        Texto chinês* (cole aqui ou carregue um .txt)
        <textarea
          required
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={10}
          className="texto-zh mt-1 w-full rounded border border-stone-300 px-2 py-1.5"
        />
      </label>
      <div className="flex items-center gap-3">
        <Botao type="submit" disabled={enviando || !texto.trim()}>
          {enviando ? 'Segmentando…' : 'Criar e segmentar'}
        </Botao>
        <input ref={inputArquivo} type="file" accept=".txt" onChange={carregarArquivo} className="hidden" />
        <Botao type="button" variante="secundario" onClick={() => inputArquivo.current?.click()}>
          Carregar .txt
        </Botao>
      </div>
    </form>
  );
}
