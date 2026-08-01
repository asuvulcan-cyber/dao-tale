import { cabecalhoPt, remontarParagrafos, type CapituloComTitulo, type Frase } from '@dao-tale/shared';

// Formatos de texto plano do download por capítulo. A remontagem de parágrafos e
// o cabeçalho vivem em shared/src/livro.ts, porque o modo leitura usa as mesmas
// regras (doc 12 §5); aqui fica só a formatação dos arquivos.

export type FormatoTexto = 'txt' | 'md' | 'bilingue';

export function textoCapitulo(capitulo: CapituloComTitulo, frases: Frase[], formato: FormatoTexto): string {
  const paragrafos = remontarParagrafos(frases);
  const cabecalho = cabecalhoPt(capitulo);

  if (formato === 'bilingue') {
    const abertura = capitulo.titulo && capitulo.titulo_pt ? `${capitulo.titulo}\n${cabecalho}` : cabecalho;
    return `${abertura}\n\n` + paragrafos.map((p) => `${p.zh}\n${p.pt || '(pendente de tradução)'}`).join('\n\n');
  }

  // md preserva a formatação (itálico/negrito) que a tradução usar; txt é texto puro.
  const corpo = paragrafos
    .map((p) => p.pt)
    .filter(Boolean)
    .join('\n\n');
  return formato === 'md' ? `# ${cabecalho}\n\n${corpo}` : `${cabecalho}\n\n${corpo}`;
}
