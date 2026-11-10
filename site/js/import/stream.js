// @ts-check
/**
 * Alimente l'analyseur avec un fichier export.zip (dézippé en flux) ou export.xml.
 * Seul apple_health_export/export.xml est lu ; les autres fichiers du zip (ECG, tracés GPS,
 * export_cda.xml) sont ignorés sans être décompressés.
 */
import { Unzip, UnzipInflate } from '../vendor/fflate.js';

/**
 * @param {AsyncIterable<Uint8Array>} chunks morceaux bruts du fichier
 * @param {{ zip: boolean, onText: (text: string) => void, afterChunk?: (bytesRead: number) => Promise<void> }} opts
 * @returns {Promise<{ found: boolean, bytesRead: number }>}
 */
export async function streamExport(chunks, opts) {
  const decoder = new TextDecoder('utf-8');
  let found = !opts.zip;
  let bytesRead = 0;
  /** @type {Error | null} */
  let failure = null;

  /** @type {Unzip | null} */
  let unzip = null;
  if (opts.zip) {
    unzip = new Unzip();
    unzip.register(UnzipInflate);
    unzip.onfile = (file) => {
      const name = file.name.split('/').pop() ?? '';
      if (name !== 'export.xml' && name !== 'exportation.xml') return;
      found = true;
      file.ondata = (err, data, final) => {
        if (err) { failure = err; return; }
        opts.onText(decoder.decode(data, { stream: !final }));
      };
      file.start();
    };
  }

  for await (const chunk of chunks) {
    bytesRead += chunk.length;
    if (unzip) unzip.push(chunk, false);
    else opts.onText(decoder.decode(chunk, { stream: true }));
    if (failure) throw failure;
    if (opts.afterChunk) await opts.afterChunk(bytesRead);
  }
  if (unzip) unzip.push(new Uint8Array(0), true);
  else opts.onText(decoder.decode());
  if (failure) throw failure;
  return { found, bytesRead };
}

/**
 * Lit un File/Blob morceau par morceau.
 * @param {Blob} blob
 * @param {number} [chunkSize]
 * @returns {AsyncIterable<Uint8Array>}
 */
export async function* blobChunks(blob, chunkSize = 1 << 20) {
  for (let offset = 0; offset < blob.size; offset += chunkSize) {
    const buf = await blob.slice(offset, offset + chunkSize).arrayBuffer();
    yield new Uint8Array(buf);
  }
}
