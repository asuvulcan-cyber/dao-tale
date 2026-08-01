import zlib from 'node:zlib';
import { crc32 } from './zip.js';

// Leitor de ZIP para conferência do que zip.ts escreve. Existe porque o escritor
// é feito à mão (doc 12 §2): aqui o caminho é o inverso (percorre o diretório
// central, descomprime com zlib.inflateRawSync, confere o CRC), então um erro no
// formato binário aparece no teste e não no e-reader do usuário. Fora dos testes,
// a validação de verdade é o epubcheck (doc 12 §9).

export interface EntradaLidaZip {
  nome: string;
  /** 0 = stored, 8 = deflate. */
  metodo: number;
  conteudo: Buffer;
  /** Offset do cabeçalho local no arquivo — o OCF exige 0 para o mimetype. */
  offsetLocal: number;
}

export function lerZip(zip: Buffer): EntradaLidaZip[] {
  // Fim do diretório central: assinatura 0x06054b50, sem comentário → 22 bytes finais.
  const fim = zip.length - 22;
  if (zip.readUInt32LE(fim) !== 0x06054b50) throw new Error('Assinatura do fim do diretório central não encontrada.');
  const total = zip.readUInt16LE(fim + 10);
  let cursor = zip.readUInt32LE(fim + 16);

  const entradas: EntradaLidaZip[] = [];
  for (let i = 0; i < total; i++) {
    if (zip.readUInt32LE(cursor) !== 0x02014b50) throw new Error(`Entrada ${i}: cabeçalho central inválido.`);
    const metodo = zip.readUInt16LE(cursor + 10);
    const crcEsperado = zip.readUInt32LE(cursor + 16);
    const tamComprimido = zip.readUInt32LE(cursor + 20);
    const tamCru = zip.readUInt32LE(cursor + 24);
    const tamNome = zip.readUInt16LE(cursor + 28);
    const tamExtra = zip.readUInt16LE(cursor + 30);
    const tamComentario = zip.readUInt16LE(cursor + 32);
    const offsetLocal = zip.readUInt32LE(cursor + 42);
    const nome = zip.subarray(cursor + 46, cursor + 46 + tamNome).toString('ascii');

    if (zip.readUInt32LE(offsetLocal) !== 0x04034b50) throw new Error(`${nome}: cabeçalho local inválido.`);
    const tamNomeLocal = zip.readUInt16LE(offsetLocal + 26);
    const tamExtraLocal = zip.readUInt16LE(offsetLocal + 28);
    const nomeLocal = zip.subarray(offsetLocal + 30, offsetLocal + 30 + tamNomeLocal).toString('ascii');
    if (nomeLocal !== nome) throw new Error(`Nome divergente entre diretório (${nome}) e local (${nomeLocal}).`);

    const inicio = offsetLocal + 30 + tamNomeLocal + tamExtraLocal;
    const bruto = zip.subarray(inicio, inicio + tamComprimido);
    const conteudo = metodo === 8 ? zlib.inflateRawSync(bruto) : Buffer.from(bruto);
    if (conteudo.length !== tamCru) throw new Error(`${nome}: tamanho descomprimido diverge do declarado.`);
    if (crc32(conteudo) !== crcEsperado) throw new Error(`${nome}: CRC não bate.`);

    entradas.push({ nome, metodo, conteudo, offsetLocal });
    cursor += 46 + tamNome + tamExtra + tamComentario;
  }
  return entradas;
}

/** Mapa nome → texto UTF-8, para asserções sobre os arquivos do EPUB. */
export function textosDoZip(zip: Buffer): Map<string, string> {
  return new Map(lerZip(zip).map((e) => [e.nome, e.conteudo.toString('utf8')]));
}
