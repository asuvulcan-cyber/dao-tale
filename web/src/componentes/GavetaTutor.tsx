// Gaveta do modo tutor (doc 29). Ocupa o lugar da gaveta de revisão quando o
// editor está no modo Tutor: você tenta traduzir a frase, pede dica quando
// trava (palavras → estrutura → tradução sugerida) e pede correção da tentativa.
// As três dicas vêm de UMA explicação, guardada no servidor — reabrir a frase
// não gasta de novo.
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ROTULO_PROBLEMA_TUTOR,
  segmentosCobremFrase,
  type EstadoTutorFrase,
  type Frase,
  type PalavraVocabulario,
  type SegmentoTutor,
  type VereditoTutor,
} from '@dao-tale/shared';
import { api, mensagemDeErro } from '../api';
import { Aviso, Botao, Etiqueta, type CorEtiqueta } from '../App';
import { usePerfilObra } from '../perfilObra';
import { useVoz } from '../util/voz';
import { DetalheDicionario } from './DicionarioFrase';

const VEREDITO: Record<VereditoTutor, { texto: string; cor: CorEtiqueta }> = {
  certo: { texto: 'sentido certo', cor: 'jade' },
  quase: { texto: 'quase lá', cor: 'ocre' },
  errado: { texto: 'sentido errado', cor: 'selo' },
};

const NOMES_DICA = ['Palavras', 'Estrutura', 'Tradução sugerida'];

interface PalavraNova {
  termo: string;
  leitura: string | null;
  significado: string;
  nota?: string | null;
}

const ehPontuacao = (s: SegmentoTutor) => s.classe === 'pontuação' || /^\p{P}+$/u.test(s.texto);

/** Arrasto pelo cabeçalho, com a posição lembrada (como a gaveta de revisão). */
function useArrastavel(chave: string) {
  const [posicao, setPosicao] = useState<{ x: number; y: number } | null>(() => {
    try {
      const salvo = localStorage.getItem(chave);
      return salvo ? (JSON.parse(salvo) as { x: number; y: number }) : null;
    } catch {
      return null;
    }
  });
  const arrasto = useRef<{ dx: number; dy: number } | null>(null);
  const ultima = useRef(posicao);

  return {
    estilo: posicao
      ? { left: posicao.x, top: posicao.y, maxHeight: `calc(100vh - ${posicao.y + 12}px)` }
      : { top: '4rem', right: '0.75rem', maxHeight: 'calc(100vh - 5rem)' },
    alca: {
      onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
        if ((e.target as Element).closest('button')) return;
        const alvo = e.currentTarget.closest('aside');
        if (!alvo) return;
        const r = alvo.getBoundingClientRect();
        arrasto.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
        if (!arrasto.current) return;
        const x = Math.min(Math.max(4, e.clientX - arrasto.current.dx), window.innerWidth - 80);
        const y = Math.min(Math.max(4, e.clientY - arrasto.current.dy), window.innerHeight - 60);
        ultima.current = { x, y };
        setPosicao(ultima.current);
      },
      onPointerUp() {
        if (!arrasto.current) return;
        arrasto.current = null;
        if (ultima.current) localStorage.setItem(chave, JSON.stringify(ultima.current));
      },
    },
  };
}

export function GavetaTutor({
  frase,
  referencia,
  obraId,
  capituloId,
  anterior,
  proxima,
  aoIrPara,
  aoFechar,
}: {
  frase: Frase;
  referencia: string;
  obraId: string;
  capituloId: string;
  anterior: Frase | null;
  proxima: Frase | null;
  aoIrPara: (fraseId: number) => void;
  aoFechar: () => void;
}) {
  const perfil = usePerfilObra();
  const falar = useVoz(perfil.bcp47);
  const clienteQuery = useQueryClient();
  const chave = ['tutor', frase.id];
  const { estilo: arrastavel, alca } = useArrastavel('dao-tale-gaveta-tutor-pos');

  const { data: estado } = useQuery({
    queryKey: chave,
    queryFn: () => api<EstadoTutorFrase>('GET', `/frases/${frase.id}/tutor`),
  });

  const [tentativa, setTentativa] = useState('');
  const [dicas, setDicas] = useState(0);
  const [erro, setErro] = useState('');
  const [adicionadas, setAdicionadas] = useState<Set<string>>(() => new Set());
  const iniciado = useRef(false);

  // O pai remonta a gaveta por frase (key), então isto roda uma vez por frase:
  // retoma a última tentativa e as dicas que você já tinha aberto.
  useEffect(() => {
    if (!estado || iniciado.current) return;
    iniciado.current = true;
    setTentativa(estado.tentativa ?? (frase.origem_edicao === 'tutor' ? frase.texto_pt : ''));
    setDicas(estado.dicas_vistas);
  }, [estado, frase]);

  const atualizar = (novo: EstadoTutorFrase) => clienteQuery.setQueryData(chave, novo);
  const falhou = (e: unknown) => setErro(mensagemDeErro(e));

  const explicar = useMutation({
    mutationFn: (refazer: boolean) => api<EstadoTutorFrase>('POST', `/frases/${frase.id}/tutor/explicar`, { refazer }),
    onSuccess: (r) => {
      atualizar(r);
      setErro('');
    },
    onError: falhou,
  });

  const registrarDicas = useMutation({
    mutationFn: (n: number) => api<EstadoTutorFrase>('POST', `/frases/${frase.id}/tutor/dicas`, { dicas: n }),
    onSuccess: atualizar,
  });

  async function pedirDica() {
    if (!estado?.explicacao) {
      try {
        await explicar.mutateAsync(false);
      } catch {
        return;
      }
    }
    const nova = Math.min(3, dicas + 1);
    setDicas(nova);
    registrarDicas.mutate(nova);
  }

  const corrigir = useMutation({
    mutationFn: () => api<EstadoTutorFrase>('POST', `/frases/${frase.id}/tutor/corrigir`, { tentativa }),
    onSuccess: (r) => {
      atualizar(r);
      setErro('');
    },
    onError: falhou,
  });

  const salvar = useMutation({
    mutationFn: (texto_pt: string) =>
      api<{ frase: Frase; estado: EstadoTutorFrase }>('POST', `/frases/${frase.id}/tutor/salvar`, { texto_pt }),
    onSuccess: (r) => {
      atualizar(r.estado);
      setTentativa(r.frase.texto_pt);
      clienteQuery.invalidateQueries({ queryKey: ['capitulo', capituloId] });
      clienteQuery.invalidateQueries({ queryKey: ['tutor-capitulo', capituloId] });
      setErro('');
    },
    onError: falhou,
  });

  const adicionar = useMutation({
    mutationFn: (p: PalavraNova) =>
      api<{ palavra: PalavraVocabulario; nova: boolean }>('POST', '/vocabulario', {
        idioma: perfil.id,
        termo: p.termo,
        leitura: p.leitura,
        significado: p.significado || '(sem significado)',
        nota: p.nota ?? null,
        exemplo_origem: frase.texto_zh,
        exemplo_pt: estado?.explicacao?.traducao ?? (frase.texto_pt || null),
        obra_id: Number(obraId),
        frase_id: frase.id,
      }),
    onSuccess: (_r, p) => {
      setAdicionadas((s) => new Set(s).add(p.termo));
      clienteQuery.invalidateQueries({ queryKey: ['vocabulario'] });
      clienteQuery.invalidateQueries({ queryKey: ['vocabulario-resumo'] });
    },
    onError: falhou,
  });

  const explicacao = estado?.explicacao ?? null;
  const correcao = estado?.correcao ?? null;
  const ruby =
    perfil.id === 'zh' && dicas >= 1 && !!explicacao && segmentosCobremFrase(frase.texto_zh, explicacao.segmentos);
  const ocupado = explicar.isPending || corrigir.isPending || salvar.isPending;
  // Pinyin que não bate com o dicionário local (doc 30), por índice de segmento.
  const divergencia = new Map((estado?.divergencias ?? []).map((d) => [d.indice, d]));
  const avisoLeitura = (i: number) => {
    const d = divergencia.get(i);
    return d ? `O dicionário lê ${d.leituras_dicionario.join(' ou ')} — confira antes de memorizar.` : undefined;
  };

  const botaoVocab = (p: PalavraNova) =>
    adicionadas.has(p.termo) ? (
      <span className="shrink-0 text-xs text-jade-forte" title="Está no seu vocabulário">
        ✓
      </span>
    ) : (
      <button
        type="button"
        onClick={() => adicionar.mutate(p)}
        disabled={adicionar.isPending}
        className="shrink-0 rounded border border-linha px-1.5 text-xs text-tinta-2 hover:border-jade hover:text-jade-forte"
        title="Adicionar ao vocabulário (revisão com repetição espaçada)"
      >
        +
      </button>
    );

  return (
    <aside className="fixed z-20 w-[28rem] max-w-[calc(100vw-1.5rem)]" style={arrastavel}>
      <div className="cartao max-h-[inherit] space-y-3 overflow-y-auto p-4 shadow-xl shadow-tinta/10">
        <div
          className="-m-4 mb-0 flex cursor-grab touch-none items-start justify-between rounded-t-[9px] border-b border-linha bg-papel-fundo/60 px-4 py-2.5 active:cursor-grabbing"
          title="Arraste para mover a gaveta"
          {...alca}
        >
          <h3 className="font-display font-semibold">
            Tutor <span className="font-mono text-xs font-normal text-tinta-2">[{referencia}]</span>
            {estado?.salva_em && (
              <span className="ml-2 align-middle">
                <Etiqueta cor="jade">salva na frase</Etiqueta>
              </span>
            )}
          </h3>
          <button onClick={aoFechar} aria-label="Fechar tutor" className="text-tinta-2 hover:text-tinta">
            ✕
          </button>
        </div>

        {/* O original — com pinyin por cima de cada palavra depois da 1ª dica. */}
        <div className="rounded bg-papel-fundo/60 px-3 py-2">
          {ruby ? (
            <p className="texto-zh text-lg leading-[2.4]">
              {explicacao!.segmentos.map((s, i) =>
                ehPontuacao(s) || !s.leitura ? (
                  <span key={i}>{s.texto}</span>
                ) : (
                  <ruby key={i} className="mx-px" title={avisoLeitura(i) ?? s.significado}>
                    {s.texto}
                    <rt className={`text-[0.55em] ${divergencia.has(i) ? 'text-ocre-forte underline decoration-wavy' : 'text-tinta-2'}`}>
                      {s.leitura}
                    </rt>
                  </ruby>
                ),
              )}
            </p>
          ) : (
            <p className="texto-zh text-base leading-relaxed">{frase.texto_zh}</p>
          )}
          {falar && (
            <button
              type="button"
              onClick={() => falar(frase.texto_zh)}
              className="mt-1 text-xs text-jade-forte hover:underline"
            >
              Ouvir a frase
            </button>
          )}
        </div>

        {/* A sua tentativa. */}
        <label className="block text-sm">
          <span className="olho">Sua tradução</span>
          <textarea
            value={tentativa}
            onChange={(e) => setTentativa(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && tentativa.trim()) {
                e.preventDefault();
                corrigir.mutate();
              }
            }}
            rows={Math.max(3, Math.ceil(tentativa.length / 50))}
            placeholder="Escreva aqui como você entendeu a frase — mesmo incompleto. Ctrl+Enter pede a correção."
            className="mt-1 w-full resize-none rounded border border-linha bg-papel-alto px-2 py-1.5 text-sm leading-relaxed focus:border-jade focus:outline-none"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Botao onClick={() => corrigir.mutate()} disabled={!tentativa.trim() || ocupado}>
            {corrigir.isPending ? 'Corrigindo…' : 'Corrigir minha tradução'}
          </Botao>
          {dicas < 3 && (
            <Botao variante="secundario" onClick={() => void pedirDica()} disabled={ocupado}>
              {explicar.isPending ? 'Preparando dicas…' : `Dica ${dicas + 1}: ${NOMES_DICA[dicas].toLowerCase()}`}
            </Botao>
          )}
          <Botao
            variante="secundario"
            onClick={() => salvar.mutate(tentativa.trim())}
            disabled={!tentativa.trim() || ocupado || tentativa.trim() === frase.texto_pt}
            title="Grava a sua tradução na frase do capítulo"
          >
            {salvar.isPending ? 'Salvando…' : 'Salvar na frase'}
          </Botao>
        </div>

        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        {/* Correção da última tentativa. */}
        {correcao && (
          <section className="space-y-2 border-t border-linha pt-3 text-sm">
            <div className="flex items-center gap-2">
              <h4 className="olho">Correção</h4>
              <Etiqueta cor={VEREDITO[correcao.veredito].cor}>{VEREDITO[correcao.veredito].texto}</Etiqueta>
              {estado && estado.tentativas > 1 && (
                <span className="text-xs text-tinta-2">{estado.tentativas}ª tentativa</span>
              )}
            </div>
            {estado?.tentativa && estado.tentativa !== tentativa && (
              <p className="text-xs text-tinta-2">Sobre a tentativa: “{estado.tentativa}”</p>
            )}
            {correcao.acertos && <p>{correcao.acertos}</p>}
            {correcao.problemas.length > 0 && (
              <ul className="space-y-2">
                {correcao.problemas.map((p, i) => (
                  <li key={i} className="rounded border border-linha/70 px-2 py-1.5">
                    <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                      <Etiqueta cor="ocre">{ROTULO_PROBLEMA_TUTOR[p.tipo]}</Etiqueta>
                      {p.trecho && <span className="text-tinta-2 line-through">{p.trecho}</span>}
                      {p.sugestao && <span className="text-jade-forte">→ {p.sugestao}</span>}
                    </div>
                    <p className="text-tinta-2">{p.explicacao}</p>
                  </li>
                ))}
              </ul>
            )}
            <div className="rounded border border-jade/40 bg-jade-tint/30 px-2 py-1.5">
              <p className="mb-1 text-xs uppercase tracking-wide text-tinta-2">Sua versão, corrigida</p>
              <p>{correcao.versao_corrigida}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Botao
                  onClick={() => salvar.mutate(correcao.versao_corrigida)}
                  disabled={ocupado || correcao.versao_corrigida === frase.texto_pt}
                >
                  Salvar esta versão
                </Botao>
                <Botao
                  variante="secundario"
                  onClick={() => setTentativa(correcao.versao_corrigida)}
                  disabled={ocupado || correcao.versao_corrigida === tentativa}
                  title="Copia para o campo, para você ajustar antes de salvar"
                >
                  Editar a partir dela
                </Botao>
              </div>
            </div>
            {correcao.palavras_para_estudar.length > 0 && (
              <div>
                <p className="mb-1 text-xs uppercase tracking-wide text-tinta-2">Palavras para estudar</p>
                <ul className="space-y-1">
                  {correcao.palavras_para_estudar.map((p, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="texto-zh font-medium">{p.texto}</span>
                        {p.leitura && <span className="ml-1.5 text-tinta-2">{p.leitura}</span>} — {p.significado}
                      </span>
                      {botaoVocab({ termo: p.texto, leitura: p.leitura, significado: p.significado })}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Dicas reveladas, na ordem. */}
        {explicacao && dicas >= 1 && (
          <section>
            <h4 className="olho mb-1">Dica 1 · Palavras</h4>
            <ul className="space-y-1.5">
              {explicacao.segmentos
                .map((s, i) => ({ s, i }))
                .filter(({ s }) => !ehPontuacao(s))
                .map(({ s, i }) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => falar?.(s.texto)}
                        className={`texto-zh font-medium ${falar ? 'hover:text-jade-forte' : 'cursor-text'}`}
                        title={falar ? 'Ouvir' : undefined}
                      >
                        {s.texto}
                      </button>
                      {s.leitura && <span className="ml-1.5 text-tinta-2">{s.leitura}</span>}
                      <span> — {s.significado}</span>
                      {s.classe && (
                        <span className="ml-1.5 text-[10px] uppercase tracking-wide text-tinta-2">{s.classe}</span>
                      )}
                      {s.nota && <p className="text-xs text-tinta-2">{s.nota}</p>}
                      {divergencia.has(i) && <p className="text-xs text-ocre-forte">⚠ {avisoLeitura(i)}</p>}
                    </div>
                    {botaoVocab({ termo: s.texto, leitura: s.leitura, significado: s.significado, nota: s.nota })}
                  </li>
                ))}
            </ul>
          </section>
        )}

        {explicacao && dicas >= 2 && (
          <section className="space-y-1.5 text-sm">
            <h4 className="olho">Dica 2 · Estrutura</h4>
            <p>{explicacao.estrutura}</p>
            {explicacao.literal && (
              <p className="text-tinta-2">
                <span className="text-xs uppercase tracking-wide">Palavra por palavra:</span>{' '}
                <em>{explicacao.literal}</em>
              </p>
            )}
            {explicacao.armadilhas.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-tinta-2">
                {explicacao.armadilhas.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            )}
          </section>
        )}

        {explicacao && dicas >= 3 && (
          <section className="space-y-1.5 text-sm">
            <h4 className="olho">Dica 3 · Tradução sugerida</h4>
            <p className="rounded border border-jade/40 bg-jade-tint/30 px-2 py-1.5">{explicacao.traducao}</p>
            {frase.texto_pt && frase.origem_edicao !== 'tutor' && frase.texto_pt !== explicacao.traducao && (
              <p className="text-xs text-tinta-2">
                Tradução que já estava no capítulo: <span className="text-tinta">{frase.texto_pt}</span>
              </p>
            )}
          </section>
        )}

        {/* Conferência sem IA (doc 30). Fechado por padrão: aberto, entrega as
            palavras de bandeja — é a ferramenta para quando a dica não basta. */}
        {perfil.id === 'zh' && <DetalheDicionario fraseId={frase.id} titulo="Dicionário (sem IA)" />}

        {/* Navegação: seguir o capítulo sem fechar a gaveta. */}
        <div className="flex items-center justify-between border-t border-linha pt-2 text-sm">
          <button
            type="button"
            disabled={!anterior}
            onClick={() => anterior && aoIrPara(anterior.id)}
            className="text-jade-forte hover:underline disabled:text-tinta-2/50 disabled:no-underline"
          >
            ‹ Frase anterior
          </button>
          {explicacao && (
            <button
              type="button"
              onClick={() => explicar.mutate(true)}
              disabled={ocupado}
              className="text-xs text-tinta-2 hover:text-tinta"
              title="Pede uma explicação nova (gasta uma chamada)"
            >
              Refazer explicação
            </button>
          )}
          <button
            type="button"
            disabled={!proxima}
            onClick={() => proxima && aoIrPara(proxima.id)}
            className="text-jade-forte hover:underline disabled:text-tinta-2/50 disabled:no-underline"
          >
            Próxima frase ›
          </button>
        </div>
      </div>
    </aside>
  );
}
