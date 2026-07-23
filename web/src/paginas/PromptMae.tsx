import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PromptComposto, PromptPadrao, TipoPrompt } from '@dao-tale/shared';
import { api } from '../api';
import { Aviso, Botao, CabecalhoPagina, Etiqueta } from '../App';
import { diffLinhas } from '../util/diff';

// A tela é a mesma para o prompt da obra (delta) e o núcleo universal (prompt
// padrão global) — só mudam endpoints, estado vazio e os recursos de camadas
// (prévia composta, conversão de legado, refinamento por IA), exclusivos da obra.

type VersaoPrompt = PromptPadrao & { tipo?: TipoPrompt; nucleo_id?: number | null };

export function PromptMae() {
  const { obraId } = useParams();
  const clienteQuery = useQueryClient();
  const chave = ['prompts', obraId];
  const [erroAdotar, setErroAdotar] = useState('');

  const adotar = useMutation({
    mutationFn: () => api('POST', `/obras/${obraId}/prompts/adotar-padrao`),
    onSuccess: () => clienteQuery.invalidateQueries({ queryKey: chave }),
    onError: (e) => setErroAdotar((e as Error).message),
  });

  return (
    <GerenciadorPrompts
      titulo="Prompt da obra"
      descricao="As diretrizes específicas desta obra (o delta, Seção 6); o texto enviado à IA é o núcleo universal + este delta. Versões são imutáveis."
      chave={chave}
      urlLista={`/obras/${obraId}/prompts`}
      urlCriar={`/obras/${obraId}/prompts`}
      urlAtivar={(id) => `/prompts/${id}/ativar`}
      obraId={obraId}
      estadoVazio={
        <Aviso tipo="info">
          <div className="space-y-2">
            <p>
              Esta obra ainda não tem prompt próprio. Ao traduzir, um <strong>delta vazio</strong> é criado
              automaticamente: a obra passa a usar o núcleo universal, e você registra aqui só o que é
              exclusivo dela (vícios de fala, tom, exceções) — melhorias no núcleo valem para todas as obras.
            </p>
            <Botao variante="secundario" onClick={() => adotar.mutate()} disabled={adotar.isPending}>
              {adotar.isPending ? 'Criando…' : 'Criar delta agora'}
            </Botao>
            {erroAdotar && <p className="text-sm text-selo-forte">{erroAdotar}</p>}
          </div>
        </Aviso>
      }
    />
  );
}

export function PaginaPromptPadrao() {
  return (
    <GerenciadorPrompts
      titulo="Núcleo universal"
      descricao={
        'As regras zh→pt-BR comuns a todas as obras (prompt padrão global). O delta de cada obra é inserido no marcador {{DELTA_OBRA}}; uma versão nova aqui vale imediatamente para todas as obras em camadas. Versões são imutáveis.'
      }
      chave={['prompt-padrao']}
      urlLista="/prompt-padrao"
      urlCriar="/prompt-padrao"
      urlAtivar={(id) => `/prompt-padrao/${id}/ativar`}
      estadoVazio={
        <Aviso tipo="info">
          Não há nenhuma versão do núcleo — sem ele, obras em camadas ficam bloqueadas para tradução. Crie a
          primeira versão abaixo.
        </Aviso>
      }
    />
  );
}

function GerenciadorPrompts({
  titulo,
  descricao,
  chave,
  urlLista,
  urlCriar,
  urlAtivar,
  estadoVazio,
  obraId,
}: {
  titulo: string;
  descricao: string;
  chave: (string | undefined)[];
  urlLista: string;
  urlCriar: string;
  urlAtivar: (id: number) => string;
  estadoVazio: ReactNode;
  /** Presente na tela da obra: liga prévia composta, conversão e refinamento. */
  obraId?: string;
}) {
  const clienteQuery = useQueryClient();
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [painel, setPainel] = useState<'ver' | 'nova' | 'comparar' | 'converter' | 'refinar'>('ver');
  const [rascunhoInicial, setRascunhoInicial] = useState<string | null>(null);
  const [erro, setErro] = useState('');

  const { data: versoes } = useQuery({
    queryKey: chave,
    queryFn: () => api<VersaoPrompt[]>('GET', urlLista),
  });

  const invalidar = () => clienteQuery.invalidateQueries({ queryKey: chave });

  const ativar = useMutation({
    mutationFn: (id: number) => api('POST', urlAtivar(id)),
    onSuccess: invalidar,
    onError: (e) => setErro((e as Error).message),
  });

  const criar = useMutation({
    mutationFn: (dados: { versao: string; conteudo: string; notas_versao?: string; ativar: boolean; tipo?: TipoPrompt }) =>
      api('POST', urlCriar, dados),
    onSuccess: () => {
      invalidar();
      setPainel('ver');
      setRascunhoInicial(null);
      setErro('');
    },
    onError: (e) => setErro((e as Error).message),
  });

  const ativo = versoes?.find((v) => v.ativo);
  const exibido = versoes?.find((v) => v.id === (selecionado ?? ativo?.id));
  const ehDelta = ativo?.tipo === 'delta';
  const ehLegado = !!obraId && !!ativo && ativo.tipo !== 'delta';

  const abrir = (novo: typeof painel) => {
    setPainel((atual) => (atual === novo ? 'ver' : novo));
    if (novo !== 'nova') setRascunhoInicial(null);
  };

  return (
    <div>
      <CabecalhoPagina titulo={titulo} descricao={descricao}>
        {obraId && ehDelta && (
          <Botao variante="secundario" onClick={() => abrir('refinar')}>
            {painel === 'refinar' ? 'Fechar refinamento' : 'Refinar com IA'}
          </Botao>
        )}
        {(versoes?.length ?? 0) >= 2 && (
          <Botao variante="secundario" onClick={() => abrir('comparar')}>
            {painel === 'comparar' ? 'Fechar comparação' : 'Comparar versões'}
          </Botao>
        )}
        <Botao onClick={() => abrir('nova')}>{painel === 'nova' ? 'Cancelar' : 'Nova versão'}</Botao>
      </CabecalhoPagina>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {versoes?.length === 0 && painel !== 'nova' && estadoVazio}

      {ehLegado && painel !== 'converter' && (
        <Aviso tipo="info">
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex-1">
              Esta obra usa um <strong>prompt completo</strong> (formato antigo): melhorias no núcleo universal
              não chegam até ela. A conversão separa o que é da obra (Seção 6 → delta) do que é regra geral.
            </p>
            <Botao variante="secundario" onClick={() => setPainel('converter')}>
              Converter para camadas
            </Botao>
          </div>
        </Aviso>
      )}

      <div className="flex gap-4">
        {/* Linha do tempo de versões (guia §五.6): ativa com filete jade */}
        <div className="cartao h-fit w-64 shrink-0">
          {versoes?.map((v) => (
            <div
              key={v.id}
              onClick={() => {
                setSelecionado(v.id);
                setPainel('ver');
              }}
              className={`cursor-pointer border-b border-linha/50 border-l-3 px-3 py-2 text-sm last:border-b-0 ${
                v.ativo ? 'border-l-jade' : 'border-l-transparent'
              } ${exibido?.id === v.id ? 'bg-papel-fundo/60' : 'hover:bg-papel-fundo/40'}`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-display font-semibold">v{v.versao}</span>
                <span className="flex items-center gap-1">
                  {obraId && v.tipo && v.tipo !== 'delta' && <Etiqueta>formato antigo</Etiqueta>}
                  {v.ativo ? (
                    <Etiqueta cor="jade">ativa</Etiqueta>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        ativar.mutate(v.id);
                      }}
                      className="text-xs text-tinta-2 underline hover:text-tinta"
                    >
                      ativar
                    </button>
                  )}
                </span>
              </div>
              <p className="font-mono text-xs text-tinta-2">{new Date(v.criado_em).toLocaleDateString('pt-BR')}</p>
              {v.notas_versao && <p className="mt-1 text-xs text-tinta-2">{v.notas_versao}</p>}
            </div>
          ))}
        </div>

        {/* Conteúdo */}
        <div className="min-w-0 flex-1">
          {painel === 'comparar' && versoes ? (
            <ComparadorVersoes versoes={versoes} />
          ) : painel === 'converter' && obraId ? (
            <ConversorCamadas
              obraId={obraId}
              versaoSugerida={sugerirVersao(versoes ?? [])}
              enviando={criar.isPending}
              aoConverter={(d) => criar.mutate({ ...d, tipo: 'delta', ativar: true })}
              aoCancelar={() => setPainel('ver')}
            />
          ) : painel === 'refinar' && obraId ? (
            <RefinadorIA
              obraId={obraId}
              aoUsarRascunho={(texto) => {
                setRascunhoInicial(`${(ativo?.conteudo ?? '').trim()}\n\n${texto}`.trim());
                setPainel('nova');
              }}
            />
          ) : painel === 'nova' ? (
            <FormularioNovaVersao
              conteudoInicial={rascunhoInicial ?? ativo?.conteudo ?? ''}
              versaoSugerida={sugerirVersao(versoes ?? [])}
              delta={!!obraId && (ativo ? ehDelta : true)}
              enviando={criar.isPending}
              aoEnviar={(d) => criar.mutate(d)}
            />
          ) : exibido ? (
            <div className="cartao p-4">
              <div className="mb-2 flex items-center gap-2">
                <h3 className="font-semibold">Versão {exibido.versao}</h3>
                {exibido.ativo && <Etiqueta cor="jade">ativa</Etiqueta>}
                {obraId && exibido.tipo === 'delta' && <Etiqueta cor="indigo">delta</Etiqueta>}
                <span className="text-xs text-tinta-2">
                  versões são imutáveis — para alterar, crie uma nova versão
                </span>
              </div>
              {obraId && exibido.tipo === 'delta' ? (
                <VisualizadorDelta obraId={obraId} delta={exibido.conteudo} ativo={exibido.ativo} />
              ) : (
                <pre className="max-h-[36rem] overflow-auto text-xs leading-relaxed whitespace-pre-wrap">
                  {exibido.conteudo}
                </pre>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Delta da obra com alternância para o prompt composto (núcleo + delta) que a IA recebe. */
function VisualizadorDelta({ obraId, delta, ativo }: { obraId: string; delta: string; ativo: boolean }) {
  const [verComposto, setVerComposto] = useState(false);

  const { data: composto } = useQuery({
    queryKey: ['prompt-composto', obraId],
    queryFn: () => api<PromptComposto>('GET', `/obras/${obraId}/prompt-composto`),
    enabled: verComposto && ativo,
  });

  return (
    <div>
      {ativo && (
        <label className="mb-2 flex items-center gap-2 text-xs text-tinta-2">
          <input type="checkbox" checked={verComposto} onChange={(e) => setVerComposto(e.target.checked)} />
          Ver o prompt composto (núcleo{composto?.nucleo ? ` v${composto.nucleo.versao}` : ''} + este delta) — é o
          texto que a IA recebe
        </label>
      )}
      <pre className="max-h-[36rem] overflow-auto text-xs leading-relaxed whitespace-pre-wrap">
        {verComposto && ativo
          ? (composto?.texto ?? 'Carregando…')
          : delta.trim() || '(delta vazio — a obra usa só o núcleo universal por enquanto)'}
      </pre>
    </div>
  );
}

/** Conversão assistida (doc 08 §4): Seção 6 vira rascunho de delta; o restante é
    comparado ao núcleo global para o usuário decidir o que promover/absorver. */
function ConversorCamadas({
  obraId,
  versaoSugerida,
  enviando,
  aoConverter,
  aoCancelar,
}: {
  obraId: string;
  versaoSugerida: string;
  enviando: boolean;
  aoConverter: (d: { versao: string; conteudo: string; notas_versao?: string }) => void;
  aoCancelar: () => void;
}) {
  const { data: previa, error } = useQuery({
    queryKey: ['previa-conversao', obraId],
    queryFn: () =>
      api<{
        convertivel: boolean;
        delta_rascunho: string;
        nucleo_da_obra: string;
        nucleo_global: string;
        nucleo_global_versao: string | null;
      }>('GET', `/obras/${obraId}/prompts/previa-conversao`),
  });
  const [deltaEditado, setDeltaEditado] = useState<string | null>(null);
  const [versao, setVersao] = useState(versaoSugerida);
  const [mostrarDiff, setMostrarDiff] = useState(true);

  if (error) return <Aviso tipo="erro">{(error as Error).message}</Aviso>;
  if (!previa) return <p className="text-tinta-2">Carregando prévia…</p>;

  const delta = deltaEditado ?? previa.delta_rascunho;
  const diff = diffLinhas(previa.nucleo_global, previa.nucleo_da_obra);
  const divergencias = diff.filter((l) => l.tipo !== 'igual').length;

  const estiloLinha = {
    igual: 'text-tinta-2',
    adicionada: 'bg-jade-tint text-jade-forte',
    removida: 'bg-selo-tint text-selo-forte line-through decoration-red-300',
  } as const;
  const marcador = { igual: '  ', adicionada: '+ ', removida: '- ' } as const;

  return (
    <div className="space-y-3">
      <div className="cartao space-y-2 p-4">
        <h3 className="font-semibold">1 · Delta da obra (extraído da Seção 6)</h3>
        {!previa.convertivel && (
          <Aviso tipo="info">
            Não encontrei um cabeçalho "## 6" para ancorar a extração — copie manualmente para o campo abaixo o
            que é específico da obra.
          </Aviso>
        )}
        <p className="text-sm text-tinta-2">
          Revise: só o que é exclusivo desta obra fica aqui. O que for regra geral, leve para o núcleo universal
          (tela Núcleo universal) antes de confirmar.
        </p>
        <textarea
          value={delta}
          onChange={(e) => setDeltaEditado(e.target.value)}
          rows={10}
          className="entrada w-full font-mono text-xs"
          placeholder="(vazio — a obra passa a usar só o núcleo)"
        />
      </div>

      <div className="cartao p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">2 · Restante do prompt vs. núcleo global{previa.nucleo_global_versao ? ` (v${previa.nucleo_global_versao})` : ''}</h3>
          <span className="text-xs text-tinta-2">
            {divergencias === 0
              ? 'idênticos — nada se perde na conversão'
              : `${divergencias} linha${divergencias === 1 ? '' : 's'} divergente${divergencias === 1 ? '' : 's'} — o que estiver só na obra (+) deixará de valer, a menos que vá para o delta ou para o núcleo`}
          </span>
          <button className="text-xs text-tinta-2 underline" onClick={() => setMostrarDiff((v) => !v)}>
            {mostrarDiff ? 'ocultar' : 'mostrar'}
          </button>
        </div>
        {mostrarDiff && (
          <pre className="max-h-[24rem] overflow-auto text-xs leading-relaxed">
            {diff.map((l, i) => (
              <div key={i} className={`px-1 whitespace-pre-wrap ${estiloLinha[l.tipo]}`}>
                {marcador[l.tipo]}
                {l.texto || ' '}
              </div>
            ))}
          </pre>
        )}
      </div>

      <div className="cartao flex flex-wrap items-end gap-3 p-4">
        <label className="block text-sm">
          Versão do delta*
          <input required value={versao} onChange={(e) => setVersao(e.target.value)} className="mt-1 w-24 entrada" />
        </label>
        <Botao
          onClick={() =>
            aoConverter({
              versao: versao.trim(),
              conteudo: delta,
              notas_versao: 'Conversão para camadas: Seção 6 extraída como delta; núcleo passa a ser o global.',
            })
          }
          disabled={enviando || !versao.trim()}
        >
          {enviando ? 'Convertendo…' : 'Criar delta e ativar'}
        </Botao>
        <Botao variante="secundario" onClick={aoCancelar}>
          Cancelar
        </Botao>
        <p className="w-full text-xs text-tinta-2">
          A versão completa atual permanece no histórico, imutável — dá para reativá-la se algo sair errado.
        </p>
      </div>
    </div>
  );
}

/** Refinamento semiautomático (doc 08 §7): recorrências do banco de testes →
    propostas de regra para o delta; nada é gravado sem aprovação. */
function RefinadorIA({ obraId, aoUsarRascunho }: { obraId: string; aoUsarRascunho: (texto: string) => void }) {
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());

  const sugerir = useMutation({
    mutationFn: () =>
      api<{
        propostas: { secao_regra: string; regra_proposta: string; justificativa: string }[];
        recorrencias: { secao_regra: string; casos: number }[];
        provedor: string;
        modelo: string;
      }>('POST', `/obras/${obraId}/prompts/sugerir-refinamento`),
    onSuccess: (r) => setSelecionadas(new Set(r.propostas.map((_, i) => i))),
  });

  return (
    <div className="cartao space-y-3 p-4">
      <div>
        <h3 className="font-semibold">Refinar diretrizes com IA</h3>
        <p className="text-sm text-tinta-2">
          Busca no banco de testes as seções/regras com 2 ou mais casos não-confirmados (lacunas sistemáticas) e
          pede ao modelo de revisão propostas de regra para o delta. Você escolhe o que entra — nada é gravado
          sem aprovação.
        </p>
      </div>
      <Botao onClick={() => sugerir.mutate()} disabled={sugerir.isPending}>
        {sugerir.isPending ? 'Analisando recorrências…' : 'Buscar propostas'}
      </Botao>
      {sugerir.error && <Aviso tipo="erro">{(sugerir.error as Error).message}</Aviso>}
      {sugerir.data && (
        <div className="space-y-2">
          <p className="text-xs text-tinta-2">
            {sugerir.data.recorrencias.map((r) => `${r.secao_regra} (${r.casos})`).join(' · ')} — analisado por{' '}
            {sugerir.data.provedor} · {sugerir.data.modelo}
          </p>
          {sugerir.data.propostas.length === 0 && (
            <Aviso tipo="info">O modelo não viu regra nova sustentada pelos casos.</Aviso>
          )}
          {sugerir.data.propostas.map((p, i) => (
            <label key={i} className="flex items-start gap-2 rounded border border-linha/60 p-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={selecionadas.has(i)}
                onChange={(e) => {
                  const novo = new Set(selecionadas);
                  if (e.target.checked) novo.add(i);
                  else novo.delete(i);
                  setSelecionadas(novo);
                }}
              />
              <span>
                <span className="font-medium">{p.regra_proposta}</span>
                <span className="mt-0.5 block text-xs text-tinta-2">
                  {p.secao_regra} — {p.justificativa}
                </span>
              </span>
            </label>
          ))}
          {sugerir.data.propostas.length > 0 && (
            <Botao
              variante="secundario"
              disabled={selecionadas.size === 0}
              onClick={() =>
                aoUsarRascunho(
                  sugerir.data.propostas
                    .filter((_, i) => selecionadas.has(i))
                    .map((p) => `- ${p.regra_proposta}`)
                    .join('\n'),
                )
              }
            >
              Usar {selecionadas.size} proposta{selecionadas.size === 1 ? '' : 's'} num rascunho de nova versão
            </Botao>
          )}
        </div>
      )}
    </div>
  );
}

function ComparadorVersoes({ versoes }: { versoes: VersaoPrompt[] }) {
  // Ordem cronológica: por padrão compara a penúltima com a mais recente.
  const cronologicas = [...versoes].sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  const [deId, setDeId] = useState(cronologicas[cronologicas.length - 2].id);
  const [paraId, setParaId] = useState(cronologicas[cronologicas.length - 1].id);
  const de = versoes.find((v) => v.id === deId)!;
  const para = versoes.find((v) => v.id === paraId)!;
  const diff = diffLinhas(de.conteudo, para.conteudo);
  const mudancas = diff.filter((l) => l.tipo !== 'igual').length;

  const estiloLinha = {
    igual: 'text-tinta-2',
    adicionada: 'bg-jade-tint text-jade-forte',
    removida: 'bg-selo-tint text-selo-forte line-through decoration-red-300',
  } as const;
  const marcador = { igual: '  ', adicionada: '+ ', removida: '- ' } as const;

  return (
    <div className="cartao p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span>Comparar</span>
        <select value={deId} onChange={(e) => setDeId(Number(e.target.value))} className="rounded border border-linha px-2 py-1">
          {cronologicas.map((v) => (
            <option key={v.id} value={v.id}>
              v{v.versao}
            </option>
          ))}
        </select>
        <span>→</span>
        <select value={paraId} onChange={(e) => setParaId(Number(e.target.value))} className="rounded border border-linha px-2 py-1">
          {cronologicas.map((v) => (
            <option key={v.id} value={v.id}>
              v{v.versao}
            </option>
          ))}
        </select>
        <span className="text-xs text-tinta-2">
          {mudancas === 0 ? 'conteúdos idênticos' : `${mudancas} linha${mudancas === 1 ? '' : 's'} alterada${mudancas === 1 ? '' : 's'}`}
        </span>
      </div>
      {para.notas_versao && (
        <p className="mb-2 rounded bg-papel-fundo/60 px-2 py-1 text-xs text-tinta-2">
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

function sugerirVersao(versoes: VersaoPrompt[]): string {
  const numeros = versoes
    .map((v) => parseFloat(v.versao))
    .filter((n) => !Number.isNaN(n));
  if (numeros.length === 0) return '1.0';
  return (Math.floor(Math.max(...numeros) * 10 + 1) / 10).toFixed(1);
}

function FormularioNovaVersao({
  conteudoInicial,
  versaoSugerida,
  delta,
  aoEnviar,
  enviando,
}: {
  conteudoInicial: string;
  versaoSugerida: string;
  /** true na tela da obra em camadas: o campo edita só o delta e pode ficar vazio. */
  delta: boolean;
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
      className="space-y-3 cartao p-4"
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          Versão*
          <input required value={versao} onChange={(e) => setVersao(e.target.value)} className="mt-1 w-24 entrada" />
        </label>
        <label className="block flex-1 text-sm">
          Notas da versão (o que mudou e por quê)
          <input value={notas} onChange={(e) => setNotas(e.target.value)} className="entrada mt-1 w-full" />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={ativarNova} onChange={(e) => setAtivarNova(e.target.checked)} />
          Ativar ao criar
        </label>
      </div>
      <textarea
        required={!delta}
        value={conteudo}
        onChange={(e) => setConteudo(e.target.value)}
        rows={delta ? 12 : 20}
        className="entrada w-full font-mono text-xs"
        placeholder={
          delta
            ? 'Só o que é específico desta obra (Seção 6): vícios de fala, tratamento entre personagens, tom, exceções às regras do núcleo. Pode ficar vazio.'
            : 'Conteúdo completo do prompt (pré-preenchido com a versão ativa)'
        }
      />
      <Botao type="submit" disabled={enviando}>
        {enviando ? 'Salvando…' : 'Criar versão'}
      </Botao>
    </form>
  );
}
