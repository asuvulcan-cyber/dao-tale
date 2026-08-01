import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  cabecalhoPt,
  ESCOPO_PADRAO,
  filtrarPorEscopo,
  partirInline,
  remontarParagrafos,
  STATUS_LEGIVEIS,
  type CapituloResumo,
  type Frase,
  type Obra,
} from '@dao-tale/shared';
import { api } from '../api';
import { BotaoTema } from '../App';

// Modo leitura (doc 12 §7): o payoff da máquina de tradução. Página read-only,
// FORA da casca de trabalho — nenhuma aba de bancada, nenhuma ação que escreva no
// banco, nenhuma marcação de glossário. Só GET: a lista de capítulos da obra e o
// capítulo aberto, os dois endpoints que já existiam.

const CHAVE_CORPO = 'dao-tale-leitor-corpo';
const CHAVE_MEDIDA = 'dao-tale-leitor-medida';
const CHAVE_BILINGUE = 'dao-tale-leitor-bilingue';

const CORPOS = [1, 2, 3, 4, 5];
const MEDIDAS = [1, 2, 3];

function lerPreferencia(chave: string, padrao: number, maximo: number): number {
  const salvo = Number(localStorage.getItem(chave));
  return Number.isInteger(salvo) && salvo >= 1 && salvo <= maximo ? salvo : padrao;
}

export function Leitor() {
  const { obraId, numero } = useParams();
  const navegar = useNavigate();

  const [corpo, setCorpo] = useState(() => lerPreferencia(CHAVE_CORPO, 3, CORPOS.length));
  const [medida, setMedida] = useState(() => lerPreferencia(CHAVE_MEDIDA, 2, MEDIDAS.length));
  const [bilingue, setBilingue] = useState(() => localStorage.getItem(CHAVE_BILINGUE) === '1');
  const [sumarioAberto, setSumarioAberto] = useState(false);

  // Corpo em bloco de propósito: um useEffect que DEVOLVE valor faz o React tentar
  // chamá-lo como cleanup ("destroy is not a function").
  useEffect(() => {
    localStorage.setItem(CHAVE_CORPO, String(corpo));
  }, [corpo]);
  useEffect(() => {
    localStorage.setItem(CHAVE_MEDIDA, String(medida));
  }, [medida]);
  useEffect(() => {
    localStorage.setItem(CHAVE_BILINGUE, bilingue ? '1' : '0');
  }, [bilingue]);

  const { data: obra } = useQuery({
    queryKey: ['obra', obraId],
    queryFn: () => api<Obra>('GET', `/obras/${obraId}`),
  });
  const { data: capitulos, isPending: carregandoCapitulos } = useQuery({
    queryKey: ['capitulos', obraId],
    queryFn: () => api<CapituloResumo[]>('GET', `/obras/${obraId}/capitulos`),
  });

  const todos = [...(capitulos ?? [])].sort((a, b) => a.numero - b.numero);
  const legiveis = filtrarPorEscopo(todos, ESCOPO_PADRAO);
  const atual = numero ? legiveis.find((c) => c.numero === Number(numero)) : legiveis[0];
  const posicao = atual ? legiveis.findIndex((c) => c.id === atual.id) : -1;
  const anterior = posicao > 0 ? legiveis[posicao - 1] : undefined;
  const proximo = posicao >= 0 && posicao < legiveis.length - 1 ? legiveis[posicao + 1] : undefined;

  const { data: detalhe } = useQuery({
    queryKey: ['capitulo', atual?.id],
    queryFn: () => api<{ frases: Frase[] }>('GET', `/capitulos/${atual!.id}`),
    enabled: !!atual,
  });

  const irPara = (cap: CapituloResumo | undefined) => {
    if (cap) navegar(`/ler/${obraId}/${cap.numero}`);
  };

  // Setas do teclado viram páginas do livro. Ignora quando há modificador (atalho
  // do navegador) ou foco em campo de texto.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return;
      if (e.key === 'ArrowLeft') irPara(anterior);
      if (e.key === 'ArrowRight') irPara(proximo);
      if (e.key === 'Escape') setSumarioAberto(false);
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  });

  // Capítulo novo começa do começo.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [atual?.id]);

  const paragrafos = remontarParagrafos(detalhe?.frases ?? []).filter((p) => bilingue || p.pt);

  return (
    <div
      className="min-h-screen bg-papel text-tinta"
      style={{ ['--leitor-corpo' as string]: `var(--leitor-txt-${corpo})`, ['--leitor-medida' as string]: `var(--leitor-medida-${medida})` }}
    >
      {/* Barra ÚNICA e discreta: a bancada usa barra dupla; o leitor não é bancada. */}
      <header className="sticky top-0 z-20 border-b border-linha bg-papel-alto/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2">
          <Link
            to={`/obras/${obraId}`}
            className="ferramenta shrink-0"
            title="Voltar para a bancada desta obra"
          >
            ‹ Obra
          </Link>
          <span className="min-w-0 flex-1 truncate font-display text-sm text-tinta-2">
            {obra?.titulo ?? '…'}
            {atual && ` · ${cabecalhoPt(atual)}`}
          </span>
          <button
            type="button"
            className="ferramenta shrink-0"
            aria-pressed={sumarioAberto}
            onClick={() => setSumarioAberto((v) => !v)}
            title="Sumário"
          >
            ☰
          </button>
          <div className="seg shrink-0">
            <button type="button" onClick={() => setCorpo((v) => Math.max(1, v - 1))} title="Diminuir a letra">
              A−
            </button>
            <button type="button" onClick={() => setCorpo((v) => Math.min(CORPOS.length, v + 1))} title="Aumentar a letra">
              A+
            </button>
          </div>
          <button
            type="button"
            className="ferramenta shrink-0"
            onClick={() => setMedida((v) => (v % MEDIDAS.length) + 1)}
            title="Largura da coluna de texto"
          >
            largura
          </button>
          <button
            type="button"
            className="ferramenta shrink-0 font-zh"
            aria-pressed={bilingue}
            onClick={() => setBilingue((v) => !v)}
            title="Leitura bilíngue: chinês acima do português"
          >
            中
          </button>
          <BotaoTema />
        </div>
      </header>

      {sumarioAberto && (
        <Sumario
          obraId={obraId!}
          capitulos={todos}
          atualId={atual?.id}
          aoEscolher={() => setSumarioAberto(false)}
        />
      )}

      <main className="px-4 py-10">
        {carregandoCapitulos ? (
          // Sem isto, o primeiro quadro anuncia "nenhum capítulo pronto" antes de
          // a lista chegar — um susto para quem tem a obra traduzida.
          <p className="leitor-folha text-tinta-2">Carregando…</p>
        ) : legiveis.length === 0 ? (
          <p className="leitor-folha text-tinta-2">
            Nenhum capítulo pronto para leitura ainda. O modo leitura mostra capítulos com status{' '}
            {STATUS_LEGIVEIS.join(', ')} — traduza um capítulo na bancada e volte.
          </p>
        ) : !atual ? (
          <p className="leitor-folha text-tinta-2">
            O capítulo {numero} não está pronto para leitura.{' '}
            <Link to={`/ler/${obraId}`} className="text-jade-forte underline">
              Ir para o primeiro capítulo disponível
            </Link>
            .
          </p>
        ) : (
          <article className="leitor-folha">
            <h1 className="font-display text-2xl font-semibold">{cabecalhoPt(atual)}</h1>
            <div className="leitor-ornamento" aria-hidden />
            {atual.titulo && atual.titulo_pt && <p className="leitor-zh">{atual.titulo}</p>}

            {!detalhe ? (
              <p className="text-tinta-2">Carregando…</p>
            ) : (
              paragrafos.map((p, i) => (
                <div key={i} className="leitor-bloco">
                  {bilingue && <p className="leitor-zh">{p.zh}</p>}
                  <p>{p.pt ? <TextoLeitura texto={p.pt} /> : <span className="text-tinta-2 italic">(pendente)</span>}</p>
                </div>
              ))
            )}

            <nav className="mt-12 flex items-center justify-between gap-3 border-t border-linha pt-4">
              {anterior ? (
                <Link to={`/ler/${obraId}/${anterior.numero}`} className="ferramenta">
                  ‹ {anterior.numero}
                </Link>
              ) : (
                <span />
              )}
              {proximo ? (
                <Link to={`/ler/${obraId}/${proximo.numero}`} className="ferramenta">
                  {proximo.numero} ›
                </Link>
              ) : (
                <span className="text-sm text-tinta-2">Fim do que está traduzido.</span>
              )}
            </nav>
          </article>
        )}
      </main>
    </div>
  );
}

/** Texto com a formatação inline da tradução (mesmo conversor do EPUB). Sem
    marcação de glossário: no leitor o texto é o protagonista. */
function TextoLeitura({ texto }: { texto: string }) {
  return (
    <>
      {partirInline(texto).map((s, i) =>
        s.tipo === 'negrito' ? <strong key={i}>{s.texto}</strong> : s.tipo === 'italico' ? <em key={i}>{s.texto}</em> : s.texto,
      )}
    </>
  );
}

function Sumario({
  obraId,
  capitulos,
  atualId,
  aoEscolher,
}: {
  obraId: string;
  capitulos: CapituloResumo[];
  atualId?: number;
  aoEscolher: () => void;
}) {
  const legivel = (c: CapituloResumo) => STATUS_LEGIVEIS.includes(c.status);
  return (
    <div className="border-b border-linha bg-papel-fundo/60">
      <div className="mx-auto max-h-[60vh] max-w-6xl overflow-y-auto px-4 py-3">
        <p className="olho mb-2">Sumário</p>
        <ol className="grid gap-0.5 sm:grid-cols-2">
          {capitulos.map((c) =>
            legivel(c) ? (
              <li key={c.id}>
                <Link
                  to={`/ler/${obraId}/${c.numero}`}
                  onClick={aoEscolher}
                  className={`block truncate rounded px-2 py-1 text-sm hover:bg-papel-alto ${
                    c.id === atualId ? 'font-semibold text-jade-forte' : 'text-tinta'
                  }`}
                >
                  {cabecalhoPt(c)}
                </Link>
              </li>
            ) : (
              <li
                key={c.id}
                className="truncate px-2 py-1 text-sm text-tinta-2/70"
                title="Ainda não traduzido — aparece aqui quando ficar pronto"
              >
                {cabecalhoPt(c)} · ainda não traduzido
              </li>
            ),
          )}
        </ol>
      </div>
    </div>
  );
}
