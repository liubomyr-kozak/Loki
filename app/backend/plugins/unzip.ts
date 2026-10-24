import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

/*
 * Minimal ZIP extractor.
 *
 * Replaces `execFileSync('unzip', ...)`, which was a hard dependency on a
 * system binary that Windows does not ship at all and a minimal Linux image
 * often omits — on those hosts installing a plugin from a .zip failed with a
 * bare ENOENT that said nothing about the real cause.
 *
 * Only the two compression methods a ZIP file is allowed to use for ordinary
 * content are supported: stored (0) and deflate (8). Anything else is
 * rejected by name rather than silently written as garbage.
 *
 * Reading the central directory (rather than streaming local headers) is
 * deliberate: local headers may carry zeroed sizes with the real values in a
 * trailing data descriptor, while the central directory always has them.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;

// The end-of-central-directory record is at the very end of the file, after a
// comment of up to 64 KiB, so it has to be searched for backwards.
const MAX_EOCD_SEARCH = 0xffff + 22;

const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

type Entry = {
  fileName: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

function findEndOfCentralDirectory(buf: Buffer): number {
  const start = Math.max(0, buf.length - MAX_EOCD_SEARCH);
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  throw new Error('not a zip file: end-of-central-directory record not found');
}

function readCentralDirectory(buf: Buffer): Entry[] {
  const eocd = findEndOfCentralDirectory(buf);
  const entryCount = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);

  const entries: Entry[] = [];
  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(offset) !== CENTRAL_FILE_SIGNATURE) {
      throw new Error('corrupt zip: bad central directory entry');
    }
    const nameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    entries.push({
      method: buf.readUInt16LE(offset + 10),
      compressedSize: buf.readUInt32LE(offset + 20),
      uncompressedSize: buf.readUInt32LE(offset + 24),
      localHeaderOffset: buf.readUInt32LE(offset + 42),
      fileName: buf.toString('utf-8', offset + 46, offset + 46 + nameLength),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

// The local header repeats the name/extra lengths, and they can differ from
// the central directory's — the payload starts after the LOCAL copy.
function dataOffset(buf: Buffer, entry: Entry): number {
  const at = entry.localHeaderOffset;
  if (buf.readUInt32LE(at) !== LOCAL_FILE_SIGNATURE) {
    throw new Error(`corrupt zip: bad local header for ${entry.fileName}`);
  }
  return at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28);
}

/**
 * Resolve an archive member's path inside `dest`, refusing anything that would
 * escape it. `unzip` needed `-o` and still happily honoured `../` traversal
 * and absolute names; this is the "zip slip" class of bug, and it is cheaper
 * to make impossible here than to audit every plugin package.
 */
function safeJoin(dest: string, fileName: string): string {
  const normalized = fileName.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    throw new Error(`refusing absolute path in zip: ${fileName}`);
  }
  const target = path.resolve(dest, normalized);
  const root = path.resolve(dest) + path.sep;
  if (!target.startsWith(root)) {
    throw new Error(`refusing path outside archive root: ${fileName}`);
  }
  return target;
}

export function extractZipTo(zipPath: string, dest: string): void {
  const buf = fs.readFileSync(zipPath);

  for (const entry of readCentralDirectory(buf)) {
    // Directory entries are recorded with a trailing slash and no payload.
    if (entry.fileName.endsWith('/')) {
      fs.mkdirSync(safeJoin(dest, entry.fileName), { recursive: true });
      continue;
    }

    const target = safeJoin(dest, entry.fileName);
    const start = dataOffset(buf, entry);
    const raw = buf.subarray(start, start + entry.compressedSize);

    let contents: Buffer;
    if (entry.method === METHOD_STORED) {
      contents = raw;
    } else if (entry.method === METHOD_DEFLATE) {
      contents = zlib.inflateRawSync(raw);
    } else {
      throw new Error(
        `unsupported zip compression method ${entry.method} for ${entry.fileName}`
      );
    }

    if (contents.length !== entry.uncompressedSize) {
      throw new Error(`corrupt zip: size mismatch for ${entry.fileName}`);
    }

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
}
