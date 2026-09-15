export function NotaInline({ texto, numero }: { texto: string; numero?: number }) {
  const rotulo = numero ? String(numero) : 'nota';
  return (
    <span
      role="note"
      tabIndex={0}
      title={texto}
      aria-label={`Nota ${rotulo}: ${texto}`}
      className="group relative mx-0.5 inline-block cursor-help align-super text-[0.62em] font-semibold leading-none text-jade-forte outline-none"
    >
      <span className="rounded-sm px-0.5 underline decoration-dotted underline-offset-2">[{rotulo}]</span>
      <span
        role="tooltip"
        className="invisible absolute bottom-full left-1/2 z-50 mb-2 w-72 max-w-[80vw] -translate-x-1/2 rounded border border-linha bg-papel px-3 py-2 text-left font-corpo text-xs font-normal leading-relaxed text-tinta opacity-0 shadow-xl transition-opacity group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100"
      >
        {texto}
      </span>
    </span>
  );
}
