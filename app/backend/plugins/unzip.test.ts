import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { extractZipTo } from './unzip';

/*
 * The fixture is a REAL archive, produced by the system `zip` tool, not by a
 * writer living in this repo — otherwise the test would only prove that our
 * reader agrees with our writer, which is exactly the bug class a hand-rolled
 * ZIP parser is prone to. It holds a stored (empty) directory entry, two
 * deflated files, and a nested directory:
 *
 *   plug/manifest.json      {"id":"demo","name":"Demo"}
 *   plug/index.ts           4000-char comment + one export (forces deflate)
 *   plug/nested/deep.txt    "deep"
 */
const FIXTURE_ZIP_BASE64 =
  "UEsDBAoAAAAAAIhWEV0AAAAAAAAAAAAAAAAFABwAcGx1Zy9VVAkAA7C9gmqwvYJqdXgLAAEE9QEA" +
  "AAQAAAAAUEsDBBQAAAAIAIhWEV09R1J5GgAAABwAAAASABwAcGx1Zy9tYW5pZmVzdC5qc29uVVQJ" +
  "AAOwvYJqsL2CanV4CwABBPUBAAAEAAAAAKtWykxRslJKSc3NV9JRykvMTQXyXEC8Wi4AUEsDBBQA" +
  "AAAIAIhWEV1hdmQHNAAAAL4PAAANABwAcGx1Zy9pbmRleC50c1VUCQADsL2CarC9gmp1eAsAAQT1" +
  "AQAABAAAAADtwbERABAURMFcFTcaUIBRDQIB3yBQvjIkbzcEXQAAAAAA8J2rd9o6yjb2UStK8qV2" +
  "89E9UEsDBAoAAAAAAIhWEV0AAAAAAAAAAAAAAAAMABwAcGx1Zy9uZXN0ZWQvVVQJAAOwvYJqsL2C" +
  "anV4CwABBPUBAAAEAAAAAFBLAwQKAAAAAACIVhFdgrieJwUAAAAFAAAAFAAcAHBsdWcvbmVzdGVk" +
  "L2RlZXAudHh0VVQJAAOwvYJqsL2CanV4CwABBPUBAAAEAAAAAGRlZXAKUEsBAh4DCgAAAAAAiFYR" +
  "XQAAAAAAAAAAAAAAAAUAGAAAAAAAAAAQAO1BAAAAAHBsdWcvVVQFAAOwvYJqdXgLAAEE9QEAAAQA" +
  "AAAAUEsBAh4DFAAAAAgAiFYRXT1HUnkaAAAAHAAAABIAGAAAAAAAAQAAAKSBPwAAAHBsdWcvbWFu" +
  "aWZlc3QuanNvblVUBQADsL2CanV4CwABBPUBAAAEAAAAAFBLAQIeAxQAAAAIAIhWEV1hdmQHNAAA" +
  "AL4PAAANABgAAAAAAAEAAACkgaUAAABwbHVnL2luZGV4LnRzVVQFAAOwvYJqdXgLAAEE9QEAAAQA" +
  "AAAAUEsBAh4DCgAAAAAAiFYRXQAAAAAAAAAAAAAAAAwAGAAAAAAAAAAQAO1BIAEAAHBsdWcvbmVz" +
  "dGVkL1VUBQADsL2CanV4CwABBPUBAAAEAAAAAFBLAQIeAwoAAAAAAIhWEV2CuJ4nBQAAAAUAAAAU" +
  "ABgAAAAAAAEAAACkgWYBAABwbHVnL25lc3RlZC9kZWVwLnR4dFVUBQADsL2CanV4CwABBPUBAAAE" +
  "AAAAAFBLBQYAAAAABQAFAKIBAAC5AQAAAAA=";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loki-unzip-test-'));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function writeFixture(): string {
  const zipPath = path.join(tmp, 'fixture.zip');
  fs.writeFileSync(zipPath, Buffer.from(FIXTURE_ZIP_BASE64, 'base64'));
  return zipPath;
}

/**
 * Builds a one-entry archive by hand so a specific malicious or unsupported
 * field can be planted. Only used for the rejection cases — the happy path
 * runs against the real `zip` output above.
 */
function buildZip(fileName: string, contents: Buffer, method = 0): Buffer {
  const name = Buffer.from(fileName, 'utf-8');
  const payload = method === 8 ? zlib.deflateRawSync(contents) : contents;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(payload.length, 18);
  local.writeUInt32LE(contents.length, 22);
  local.writeUInt16LE(name.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(payload.length, 20);
  central.writeUInt32LE(contents.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);

  const centralOffset = local.length + name.length + payload.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + name.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);

  return Buffer.concat([local, name, payload, central, name, eocd]);
}

function writeRaw(buf: Buffer): string {
  const zipPath = path.join(tmp, 'hand.zip');
  fs.writeFileSync(zipPath, buf);
  return zipPath;
}

describe('extractZipTo', () => {
  it('extracts a real archive produced by the system zip tool', () => {
    const dest = path.join(tmp, 'out');
    fs.mkdirSync(dest);
    extractZipTo(writeFixture(), dest);

    expect(JSON.parse(fs.readFileSync(path.join(dest, 'plug', 'manifest.json'), 'utf-8'))).toEqual({
      id: 'demo',
      name: 'Demo',
    });
    // Deflated entry — proves the inflate path, not just stored copies.
    const indexTs = fs.readFileSync(path.join(dest, 'plug', 'index.ts'), 'utf-8');
    expect(indexTs).toContain('export const id = "demo";');
    expect(indexTs.length).toBeGreaterThan(4000);
    // Nested directories are recreated even though only the leaf carries data.
    expect(fs.readFileSync(path.join(dest, 'plug', 'nested', 'deep.txt'), 'utf-8')).toBe('deep\n');
  });

  it('refuses a member that would escape the destination (zip slip)', () => {
    const dest = path.join(tmp, 'out');
    fs.mkdirSync(dest);
    const zipPath = writeRaw(buildZip('../escaped.txt', Buffer.from('pwned')));

    expect(() => extractZipTo(zipPath, dest)).toThrow(/outside archive root/);
    expect(fs.existsSync(path.join(tmp, 'escaped.txt'))).toBe(false);
  });

  it('refuses an absolute member path', () => {
    const dest = path.join(tmp, 'out');
    fs.mkdirSync(dest);
    const zipPath = writeRaw(buildZip('/etc/passwd', Buffer.from('pwned')));

    expect(() => extractZipTo(zipPath, dest)).toThrow(/absolute path/);
  });

  it('names the unsupported compression method instead of writing garbage', () => {
    const dest = path.join(tmp, 'out');
    fs.mkdirSync(dest);
    // 12 = bzip2: structurally valid, and not something we decompress.
    const zipPath = writeRaw(buildZip('a.txt', Buffer.from('hello'), 12));

    expect(() => extractZipTo(zipPath, dest)).toThrow(/unsupported zip compression method 12/);
  });

  it('rejects a file that is not a zip at all', () => {
    const dest = path.join(tmp, 'out');
    fs.mkdirSync(dest);
    const zipPath = writeRaw(Buffer.from('this is not a zip archive, not even close'));

    expect(() => extractZipTo(zipPath, dest)).toThrow(/not a zip file/);
  });
});
