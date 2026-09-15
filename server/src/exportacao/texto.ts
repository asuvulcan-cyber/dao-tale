import { cabecalhoPt, remontarParagrafos, type CapituloComTitulo, type Frase } from '@dao-tale/shared';

// Formatos de texto plano do download por capítulo. A remontagem de parágrafos e
// o cabeçalho vivem em shared/src/livro.ts, porque o modo leitura usa as mesmas
// regras (doc 12 §5); aqui fica só a formatação dos arquivos.

export type FormatoTexto = 'txt' | 'md' | 'bilingue';

function separarNotas(textos: string[]): { textos: string[]; notas: string[] } {
  const notas: string[] = [];
  return {
    textos: textos.map((texto) =>
      texto.replace(/\(\(([\s\S]*?)\)\)/g, (_trecho, nota: string) => {
        notas.push(nota.trim());
        return `[${notas.length}]`;
      }),
    ),
    notas,
  };
}

export function textoCapitulo(capitulo: CapituloComTitulo, frases: Frase[], formato: FormatoTexto): string {
  const paragrafos = remontarParagrafos(frases);
  const cabecalho = cabecalhoPt(capitulo);

  if (formato === 'bilingue') {
    const abertura = capitulo.titulo && capitulo.titulo_pt ? `${capitulo.titulo}\n${cabecalho}` : cabecalho;
    const separados = separarNotas(paragrafos.map((p) => p.pt));
    const corpo = paragrafos.map((p, i) => `${p.zh}\n${separados.textos[i] || '(pendente de tradução)'}`).join('\n\n');
    const rodape = separados.notas.length
      ? `\n\nNotas\n${separados.notas.map((nota, i) => `[${i + 1}] ${nota}`).join('\n')}`
      : '';
    return `${abertura}\n\n${corpo}${rodape}`;
  }

  // md preserva a formatação (itálico/negrito) que a tradução usar; txt é texto puro.
  const separados = separarNotas(paragrafos
    .map((p) => p.pt)
    .filter(Boolean));
  const corpo = separados.textos.join('\n\n');
  const rodape = separados.notas.length
    ? formato === 'md'
      ? `\n\n${separados.notas.map((nota, i) => `[^${i + 1}]: ${nota}`).join('\n')}`
      : `\n\nNotas\n${separados.notas.map((nota, i) => `[${i + 1}] ${nota}`).join('\n')}`
    : '';
  return formato === 'md' ? `# ${cabecalho}\n\n${corpo}${rodape}` : `${cabecalho}\n\n${corpo}${rodape}`;
}
