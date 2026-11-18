import type { Dispatch, ReactNode, SetStateAction } from 'react';

export const MODOS_EDITOR = [
  { id: 'segmentado', rotulo: 'Segmentado' },
  { id: 'bilingue', rotulo: 'Bilíngue' },
  { id: 'leitura', rotulo: 'Leitura' },
] as const;
export type ModoEditor = (typeof MODOS_EDITOR)[number]['id'];

export const TAMANHO_PADRAO = 1.06;
export const LARGURAS = {
  estreita: { rotulo: 'Estreita', css: '42rem' },
  media: { rotulo: 'Média', css: '56rem' },
  cheia: { rotulo: 'Cheia', css: '' },
} as const;
export type LarguraLeitura = keyof typeof LARGURAS;

function RotuloHover({ lado, children }: { lado: 'direita' | 'esquerda'; children: ReactNode }) {
  const posicao = lado === 'direita' ? 'left-full ml-2' : 'right-full mr-2';
  return (
    <span
      className={`pointer-events-none absolute top-1/2 z-30 hidden -translate-y-1/2 rounded-md border border-linha bg-papel-alto px-2 py-1 text-xs whitespace-nowrap text-tinta shadow-md group-hover:block ${posicao}`}
    >
      {children}
    </span>
  );
}

function BotaoTrilho({
  rotulo,
  ladoRotulo = 'direita',
  ativo = false,
  corAtiva = 'bg-marca text-papel-alto',
  onClick,
  children,
}: {
  rotulo: string;
  ladoRotulo?: 'direita' | 'esquerda';
  ativo?: boolean;
  corAtiva?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      aria-label={rotulo}
      className={`group relative grid size-9 place-items-center rounded-lg border ${
        ativo ? `border-transparent ${corAtiva}` : 'border-transparent text-tinta-2 hover:border-linha hover:text-tinta'
      }`}
    >
      {children}
      <RotuloHover lado={ladoRotulo}>{rotulo}</RotuloHover>
    </button>
  );
}

const ICONE_MODO: Record<ModoEditor, ReactNode> = {
  segmentado: (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <line x1="8" y1="2.5" x2="8" y2="13.5" />
    </svg>
  ),
  bilingue: <span className="selo-cjk text-[11px] leading-none">文A</span>,
  leitura: (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  ),
};

function IconeLargura({ nivel }: { nivel: number }) {
  const meia = 4 + nivel * 2.2;
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.3">
      <line x1={8 - meia} y1="8" x2={8 + meia} y2="8" />
      <line x1={8 - meia} y1="5.5" x2={8 - meia} y2="10.5" />
      <line x1={8 + meia} y1="5.5" x2={8 + meia} y2="10.5" />
    </svg>
  );
}

const POSICAO_TRILHO_ESQ = 'left-[max(0.25rem,calc(50vw-38.5rem))]';
const POSICAO_TRILHO_DIR = 'right-[max(0.25rem,calc(50vw-38.5rem))]';

export function PaletaEditor({
  modo,
  aoMudarModo,
  marcarTermos,
  aoAlternarTermos,
  consistenciaDisponivel,
  aoAbrirConsistencia,
  aoAbrirEstilo,
  tamanho,
  aoMudarTamanho,
  largura,
  aoMudarLargura,
}: {
  modo: ModoEditor;
  aoMudarModo: (m: ModoEditor) => void;
  marcarTermos: boolean;
  aoAlternarTermos: () => void;
  consistenciaDisponivel: boolean;
  aoAbrirConsistencia: () => void;
  aoAbrirEstilo: () => void;
  tamanho: number;
  aoMudarTamanho: Dispatch<SetStateAction<number>>;
  largura: LarguraLeitura;
  aoMudarLargura: (l: LarguraLeitura) => void;
}) {
  const diminuir = () => aoMudarTamanho((t) => Math.max(0.8, Number((t - 0.08).toFixed(2))));
  const aumentar = () => aoMudarTamanho((t) => Math.min(1.6, Number((t + 0.08).toFixed(2))));
  const pctTexto = `${Math.round((tamanho / TAMANHO_PADRAO) * 100)}%`;
  const mostrarTexto = modo !== 'segmentado';
  const ordemLarguras = Object.keys(LARGURAS) as LarguraLeitura[];
  const nivelLargura = ordemLarguras.indexOf(largura);
  const proximaLargura = ordemLarguras[(nivelLargura + 1) % ordemLarguras.length];

  return (
    <>
      <div className={`fixed top-1/2 z-20 hidden -translate-y-1/2 xl:block ${POSICAO_TRILHO_ESQ}`}>
        <div className="cartao flex flex-col items-center gap-1 p-1.5 shadow-lg shadow-tinta/10">
          {MODOS_EDITOR.map((m) => (
            <BotaoTrilho key={m.id} rotulo={m.rotulo} ativo={modo === m.id} onClick={() => aoMudarModo(m.id)}>
              {ICONE_MODO[m.id]}
            </BotaoTrilho>
          ))}
          <div className="my-0.5 w-6 border-t border-linha/60" />
          <BotaoTrilho
            rotulo={marcarTermos ? 'Termos do glossário: marcados' : 'Termos do glossário: ocultos'}
            ativo={marcarTermos}
            corAtiva="bg-ocre-tint text-ocre-forte"
            onClick={aoAlternarTermos}
          >
            <span className="termo-gloss text-sm leading-none">T</span>
          </BotaoTrilho>
          {consistenciaDisponivel && (
            <BotaoTrilho rotulo="Consistência do glossário" onClick={aoAbrirConsistencia}>
              <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.3">
                <circle cx="8" cy="8" r="6.2" />
                <path d="m5.2 8.2 2 2 3.6-4" />
              </svg>
            </BotaoTrilho>
          )}
          {consistenciaDisponivel && (
            <BotaoTrilho rotulo="Estilo da obra" onClick={aoAbrirEstilo}>
              <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.3">
                <path d="M3 12.5 8.5 3l2 5.5" />
                <path d="M5.5 9.5h4.2" />
                <path d="M12 12.5h1.5" />
              </svg>
            </BotaoTrilho>
          )}
        </div>
      </div>

      {mostrarTexto && (
        <div className={`fixed top-1/2 z-20 hidden -translate-y-1/2 xl:block ${POSICAO_TRILHO_DIR}`}>
          <div className="cartao flex flex-col items-center gap-1 p-1.5 shadow-lg shadow-tinta/10">
            <BotaoTrilho rotulo="Aumentar texto" ladoRotulo="esquerda" onClick={aumentar}>
              <span className="text-xs font-semibold">A+</span>
            </BotaoTrilho>
            <span className="font-mono text-[10px] text-tinta-2 tabular-nums" title="Tamanho do texto">
              {pctTexto}
            </span>
            <BotaoTrilho rotulo="Diminuir texto" ladoRotulo="esquerda" onClick={diminuir}>
              <span className="text-xs font-semibold">A−</span>
            </BotaoTrilho>
            <div className="my-0.5 w-6 border-t border-linha/60" />
            <BotaoTrilho
              rotulo={`Largura: ${LARGURAS[largura].rotulo.toLowerCase()} — clique para alternar`}
              ladoRotulo="esquerda"
              onClick={() => aoMudarLargura(proximaLargura)}
            >
              <IconeLargura nivel={nivelLargura} />
            </BotaoTrilho>
          </div>
        </div>
      )}

      <div className="cartao mb-4 flex flex-wrap items-center gap-2 px-3 py-2 xl:hidden">
        <div className="seg" role="group" aria-label="Modo de visualização">
          {MODOS_EDITOR.map((m) => (
            <button key={m.id} type="button" onClick={() => aoMudarModo(m.id)} aria-pressed={modo === m.id}>
              {m.rotulo}
            </button>
          ))}
        </div>
        <button type="button" className="ferramenta" onClick={aoAlternarTermos} aria-pressed={marcarTermos} title="Marcar termos do glossário no texto">
          Termos
        </button>
        {consistenciaDisponivel && <button type="button" className="ferramenta" onClick={aoAbrirConsistencia}>Consistência</button>}
        {consistenciaDisponivel && <button type="button" className="ferramenta" onClick={aoAbrirEstilo}>Estilo</button>}
        {mostrarTexto && (
          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" className="ferramenta" onClick={diminuir} aria-label="Diminuir texto">A−</button>
            <span className="font-mono text-[11px] text-tinta-2 tabular-nums">{pctTexto}</span>
            <button type="button" className="ferramenta" onClick={aumentar} aria-label="Aumentar texto">A+</button>
            <button type="button" className="ferramenta" onClick={() => aoMudarLargura(proximaLargura)} title="Alternar largura do texto">
              Largura: {LARGURAS[largura].rotulo}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
