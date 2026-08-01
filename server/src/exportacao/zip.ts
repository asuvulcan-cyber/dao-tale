import zlib from 'node:zlib';

// Escritor de ZIP mínimo, só o que o container OCF do EPUB usa (doc 12 §2):
// métodos 0 (stored) e 8 (deflate), sem zip64, sem criptografia, sem extra fields.
//
// Por que à mão e não uma lib: o OCF exige que a PRIMEIRA entrada seja `mimetype`,
// armazenada sem compressão e sem extra field, de modo que os bytes 30..49 do
// arquivo sejam literalmente "application/epub+zip". Toda lib pede configuração
// especial justo aí e nenhuma promete ausência de extra fields. O arquivo é
// pequeno (texto + capa), então nada do que uma lib traria de bom (streaming,
// zip64) tem uso aqui. A contrapartida — formato binário escrito à mão — é coberta
// por leitores independentes: zip.test.ts relê tudo com zlib.inflateRawSync e
// scripts/validar-epub.mjs usa `python3 -m zipfile` e `unzip`.

export interface EntradaZip {
  /** Caminho dentro do zip, sempre com "/" e só ASCII. */
  nome: string;
  dados: Buffer | string;
  /** false = STORED. Use para o mimetype (exigência do OCF) e para imagens já comprimidas. */
  comprimir?: boolean;
}

// Data/hora fixas (2026-01-01 00:00), em formato MS-DOS. Saída determinística:
// exportar duas vezes o mesmo escopo dá bytes idênticos, o que os testes usam.
const DATA_DOS = ((2026 - 1980) << 9) | (1 << 5) | 1;
const HORA_DOS = 0;

const TABELA_CRC = (() => {
  const tabela = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[i] = c >>> 0;
  }
  return tabela;
})();

export function crc32(dados: Buffer): number {
  let c = 0xffffffff;
  for (const byte of dados) c = TABELA_CRC[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Monta o arquivo .zip completo, na ordem em que as entradas foram passadas. */
export function montarZip(entradas: EntradaZip[]): Buffer {
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let deslocamento = 0;

  for (const entrada of entradas) {
    if (!/^[\x20-\x7e]+$/.test(entrada.nome)) {
      // Nome não-ASCII exigiria a flag de UTF-8 (bit 11); nada no EPUB precisa disso.
      throw new Error(`Nome de entrada do zip deve ser ASCII: ${entrada.nome}`);
    }
    const nome = Buffer.from(entrada.nome, 'ascii');
    const cru = Buffer.isBuffer(entrada.dados) ? entrada.dados : Buffer.from(entrada.dados, 'utf8');
    const comprimir = entrada.comprimir !== false;
    const comprimido = comprimir ? zlib.deflateRawSync(cru, { level: 9 }) : cru;
    // Deflate que engorda (imagem já comprimida, arquivo minúsculo) volta a STORED.
    const usarDeflate = comprimir && comprimido.length < cru.length;
    const corpo = usarDeflate ? comprimido : cru;
    const metodo = usarDeflate ? 8 : 0;
    const crc = crc32(cru);

    const cabecalhoLocal = Buffer.alloc(30);
    cabecalhoLocal.writeUInt32LE(0x04034b50, 0); // assinatura
    cabecalhoLocal.writeUInt16LE(20, 4); // versão necessária (2.0)
    cabecalhoLocal.writeUInt16LE(0, 6); // flags
    cabecalhoLocal.writeUInt16LE(metodo, 8);
    cabecalhoLocal.writeUInt16LE(HORA_DOS, 10);
    cabecalhoLocal.writeUInt16LE(DATA_DOS, 12);
    cabecalhoLocal.writeUInt32LE(crc, 14);
    cabecalhoLocal.writeUInt32LE(corpo.length, 18);
    cabecalhoLocal.writeUInt32LE(cru.length, 22);
    cabecalhoLocal.writeUInt16LE(nome.length, 26);
    cabecalhoLocal.writeUInt16LE(0, 28); // extra field: nenhum
    locais.push(cabecalhoLocal, nome, corpo);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // versão do criador
    central.writeUInt16LE(20, 6); // versão necessária
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(metodo, 10);
    central.writeUInt16LE(HORA_DOS, 12);
    central.writeUInt16LE(DATA_DOS, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(corpo.length, 20);
    central.writeUInt32LE(cru.length, 24);
    central.writeUInt16LE(nome.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comentário
    central.writeUInt16LE(0, 34); // disco inicial
    central.writeUInt16LE(0, 36); // atributos internos
    central.writeUInt32LE(0, 38); // atributos externos
    central.writeUInt32LE(deslocamento, 42); // offset do cabeçalho local
    centrais.push(central, nome);

    deslocamento += cabecalhoLocal.length + nome.length + corpo.length;
  }

  const diretorio = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(0, 4); // disco atual
  fim.writeUInt16LE(0, 6); // disco do diretório central
  fim.writeUInt16LE(entradas.length, 8);
  fim.writeUInt16LE(entradas.length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(deslocamento, 16);
  fim.writeUInt16LE(0, 20); // comentário do arquivo

  return Buffer.concat([...locais, diretorio, fim]);
}
