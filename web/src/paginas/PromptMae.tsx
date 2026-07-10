import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PromptMae as Prompt } from '@dao-tale/shared';
import { api } from '../api';
import { Aviso, Botao, Etiqueta } from '../App';
import { diffLinhas } from '../util/diff';

export function PromptMae() {
  const { obraId } = useParams();
  const clienteQuery = useQueryClient();
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [mostrarNova, setMostrarNova] = useState(false);
  const [comparando, setComparando] = useState(false);
  const [erro, setErro] = useState('');

  const { data: versoes } = useQuery({
    queryKey: ['prompts', obraId],
    queryFn: () => api<Prompt[]>('GET', `/obras/${obraId}/prompts`),
  });

  const invalidar = () => clienteQuery.invalidateQueries({ queryKey: ['prompts', obraId] });

  const ativar = useMutation({
    mutationFn: (id: number) => api('POST', `/prompts/${id}/ativar`),
    onSuccess: invalidar,
    onError: (e) => setErro((e as Error).message),
  });

  const criar = useMutation({
    mutationFn: (dados: { versao: string; conteudo: string; notas_versao?: string; ativar: boolean }) =>
      api('POST', `/obras/${obraId}/prompts`, dados),
    onSuccess: () => {
      invalidar();
      setMostrarNova(false);
      setErro('');
    },
    onError: (e) => setErro((e as Error).message),
  });

  const ativo = versoes?.find((v) => v.ativo);
  const exibido = versoes?.find((v) => v.id === (selecionado ?? ativo?.id));

  return (
    <div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {versoes?.length === 0 && !mostrarNova && (
        <Aviso tipo="info">
          Esta obra ainda não tem prompt mãe — a tradução fica bloqueada até cadastrar um. Crie a primeira versão
          abaixo.
        </Aviso>
      )}

      <div className="flex gap-4">
        {/* Histórico de versões */}
        <div className="w-64 shrink-0 space-y-2">
          <Botao className="w-full" onClick={() => { setMostrarNova((v) => !v); setComparando(false); }}>
            {mostrarNova ? 'Cancelar' : 'Nova versão'}
          </Botao>
          {(versoes?.length ?? 0) >= 2 && (
            <Botao variante="secundario" className="w-full" onClick={() => { setComparando((v) => !v); setMostrarNova(false); }}>
              {comparando ? 'Fechar comparação' : 'Comparar versões'}
            </Botao>
          )}
          {versoes?.map((v) => (
            <div
              key={v.id}
              onClick={() => setSelecionado(v.id)}
              className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${
                exibido?.id === v.id ? 'border-stone-800 bg-white' : 'border-stone-300 bg-white hover:border-stone-500'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">v{v.versao}</span>
                {v.ativo ? (
                  <Etiqueta cor="green">ativa</Etiqueta>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      ativar.mutate(v.id);
                    }}
                    className="text-xs text-stone-500 underline hover:text-stone-800"
                  >
                    ativar
                  </button>
                )}
              </div>
              <p className="text-xs text-stone-500">{new Date(v.criado_em).toLocaleString('pt-BR')}</p>
              {v.notas_versao && <p className="mt-1 text-xs text-stone-600">{v.notas_versao}</p>}
            </div>
          ))}
        </div>

        {/* Conteúdo */}
        <div className="min-w-0 flex-1">
          {comparando && versoes ? (
            <ComparadorVersoes versoes={versoes} />
          ) : mostrarNova ? (
            <FormularioNovaVersao
              conteudoInicial={ativo?.conteudo ?? ''}
              versaoSugerida={sugerirVersao(versoes ?? [])}
              enviando={criar.isPending}
              aoEnviar={(d) => criar.mutate(d)}
            />
          ) : exibido ? (
            <div className="rounded-lg border border-stone-300 bg-white p-4">
              <div className="mb-2 flex items-center gap-2">
                <h3 className="font-semibold">Versão {exibido.versao}</h3>
                {exibido.ativo && <Etiqueta cor="green">ativa</Etiqueta>}
                <span className="text-xs text-stone-400">
                  versões são imutáveis — para alterar, crie uma nova versão
                </span>
              </div>
              <pre className="max-h-[36rem] overflow-auto text-xs leading-relaxed whitespace-pre-wrap">
                {exibido.conteudo}
              </pre>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ComparadorVersoes({ versoes }: { versoes: Prompt[] }) {
  // Ordem cronológica: por padrão compara a penúltima com a mais recente.
  const cronologicas = [...versoes].sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  const [deId, setDeId] = useState(cronologicas[cronologicas.length - 2].id);
  const [paraId, setParaId] = useState(cronologicas[cronologicas.length - 1].id);
  const de = versoes.find((v) => v.id === deId)!;
  const para = versoes.find((v) => v.id === paraId)!;
  const diff = diffLinhas(de.conteudo, para.conteudo);
  const mudancas = diff.filter((l) => l.tipo !== 'igual').length;

  const estiloLinha = {
    igual: 'text-stone-600',
    adicionada: 'bg-green-50 text-green-900',
    removida: 'bg-red-50 text-red-800 line-through decoration-red-300',
  } as const;
  const marcador = { igual: '  ', adicionada: '+ ', removida: '- ' } as const;

  return (
    <div className="rounded-lg border border-stone-300 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span>Comparar</span>
        <select value={deId} onChange={(e) => setDeId(Number(e.target.value))} className="rounded border border-stone-300 px-2 py-1">
          {cronologicas.map((v) => (
            <option key={v.id} value={v.id}>
              v{v.versao}
            </option>
          ))}
        </select>
        <span>→</span>
        <select value={paraId} onChange={(e) => setParaId(Number(e.target.value))} className="rounded border border-stone-300 px-2 py-1">
          {cronologicas.map((v) => (
            <option key={v.id} value={v.id}>
              v{v.versao}
            </option>
          ))}
        </select>
        <span className="text-xs text-stone-500">
          {mudancas === 0 ? 'conteúdos idênticos' : `${mudancas} linha${mudancas === 1 ? '' : 's'} alterada${mudancas === 1 ? '' : 's'}`}
        </span>
      </div>
      {para.notas_versao && (
        <p className="mb-2 rounded bg-stone-50 px-2 py-1 text-xs text-stone-600">
          Notas da v{para.versao}: {para.notas_versao}
        </p>
      )}
      <pre className="max-h-[36rem] overflow-auto text-xs leading-relaxed">
        {diff.map((l, i) => (
          <div key={i} className={`px-1 whitespace-pre-wrap ${estiloLinha[l.tipo]}`}>
            {marcador[l.tipo]}
            {l.texto || ' '}
          </div>
        ))}
      </pre>
    </div>
  );
}

function sugerirVersao(versoes: Prompt[]): string {
  const numeros = versoes
    .map((v) => parseFloat(v.versao))
    .filter((n) => !Number.isNaN(n));
  if (numeros.length === 0) return '1.0';
  return (Math.floor(Math.max(...numeros) * 10 + 1) / 10).toFixed(1);
}

function FormularioNovaVersao({
  conteudoInicial,
  versaoSugerida,
  aoEnviar,
  enviando,
}: {
  conteudoInicial: string;
  versaoSugerida: string;
  aoEnviar: (d: { versao: string; conteudo: string; notas_versao?: string; ativar: boolean }) => void;
  enviando: boolean;
}) {
  const [versao, setVersao] = useState(versaoSugerida);
  const [conteudo, setConteudo] = useState(conteudoInicial);
  const [notas, setNotas] = useState('');
  const [ativarNova, setAtivarNova] = useState(true);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        aoEnviar({ versao: versao.trim(), conteudo, notas_versao: notas.trim() || undefined, ativar: ativarNova });
      }}
      className="space-y-3 rounded-lg border border-stone-300 bg-white p-4"
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          Versão*
          <input required value={versao} onChange={(e) => setVersao(e.target.value)} className="mt-1 w-24 rounded border border-stone-300 px-2 py-1.5" />
        </label>
        <label className="block flex-1 text-sm">
          Notas da versão (o que mudou e por quê)
          <input value={notas} onChange={(e) => setNotas(e.target.value)} className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5" />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={ativarNova} onChange={(e) => setAtivarNova(e.target.checked)} />
          Ativar ao criar
        </label>
      </div>
      <textarea
        required
        value={conteudo}
        onChange={(e) => setConteudo(e.target.value)}
        rows={20}
        className="w-full rounded border border-stone-300 px-2 py-1.5 font-mono text-xs"
        placeholder="Conteúdo completo do prompt mãe (pré-preenchido com a versão ativa)"
      />
      <Botao type="submit" disabled={enviando}>
        {enviando ? 'Salvando…' : 'Criar versão'}
      </Botao>
    </form>
  );
}
