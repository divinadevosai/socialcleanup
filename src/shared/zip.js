// Minimal ZIP reader for data archives. Reads only the central directory and
// the entries asked for, so multi-GB archives full of media never get loaded
// into memory. Supports stored + deflated entries and ZIP64.

const EOCD = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_EOCD = 0x06064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX_U32 = 0xffffffff;
// Far above any real post file (a 100k-post archive's tweets.js is ~150 MB),
// but stops a crafted "zip bomb" from exhausting memory.
export const MAX_ENTRY_BYTES = 400 * 1024 * 1024;

async function read(blob, start, length) {
  return new DataView(await blob.slice(start, start + length).arrayBuffer());
}
const u64 = (v, o) => Number(v.getBigUint64(o, true));

async function findDirectory(blob) {
  const tailLen = Math.min(blob.size, 65557);
  const tail = await read(blob, blob.size - tailLen, tailLen);
  let pos = -1;
  for (let i = tailLen - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === EOCD) {
      pos = i;
      break;
    }
  }
  if (pos < 0) throw new Error("This doesn't look like a .zip file");

  let count = tail.getUint16(pos + 10, true);
  let size = tail.getUint32(pos + 12, true);
  let offset = tail.getUint32(pos + 16, true);

  if (offset === MAX_U32 || size === MAX_U32 || count === 0xffff) {
    const locatorPos = blob.size - tailLen + pos - 20;
    const locator = await read(blob, locatorPos, 20);
    if (locator.getUint32(0, true) !== ZIP64_LOCATOR) throw new Error('Damaged ZIP64 archive');
    const z = await read(blob, u64(locator, 8), 56);
    if (z.getUint32(0, true) !== ZIP64_EOCD) throw new Error('Damaged ZIP64 archive');
    count = u64(z, 32);
    size = u64(z, 40);
    offset = u64(z, 48);
  }
  return { count, size, offset };
}

/** Lists entries: [{ name, method, compressedSize, size, localOffset }] */
export async function listZip(blob) {
  const { count, size, offset } = await findDirectory(blob);
  const dir = await read(blob, offset, size);
  const decoder = new TextDecoder();
  const entries = [];
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (dir.getUint32(p, true) !== CENTRAL) throw new Error('Damaged ZIP directory');
    const method = dir.getUint16(p + 10, true);
    let compressedSize = dir.getUint32(p + 20, true);
    let size = dir.getUint32(p + 24, true);
    const nameLen = dir.getUint16(p + 28, true);
    const extraLen = dir.getUint16(p + 30, true);
    const commentLen = dir.getUint16(p + 32, true);
    let localOffset = dir.getUint32(p + 42, true);
    const name = decoder.decode(new Uint8Array(dir.buffer, dir.byteOffset + p + 46, nameLen));

    // ZIP64 extra field holds the real values for any field set to 0xFFFFFFFF.
    let e = p + 46 + nameLen;
    const extraEnd = e + extraLen;
    while (e + 4 <= extraEnd) {
      const id = dir.getUint16(e, true);
      const len = dir.getUint16(e + 2, true);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === MAX_U32) (size = u64(dir, q)), (q += 8);
        if (compressedSize === MAX_U32) (compressedSize = u64(dir, q)), (q += 8);
        if (localOffset === MAX_U32) localOffset = u64(dir, q);
      }
      e += 4 + len;
    }
    entries.push({ name, method, compressedSize, size, localOffset });
    p = extraEnd + commentLen;
  }
  return entries;
}

// Reads a stream to text, refusing to go past `limit` bytes whatever the
// archive claims about its own size.
async function textWithLimit(stream, limit, name) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error(`${name} is too large to be a real archive file`);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(await new Blob(chunks).arrayBuffer());
}

export async function readZipEntryText(blob, entry, limit = MAX_ENTRY_BYTES) {
  if (entry.size > limit) throw new Error(`${entry.name} is too large to be a real archive file`);
  const local = await read(blob, entry.localOffset, 30);
  if (local.getUint32(0, true) !== LOCAL) throw new Error(`Damaged entry: ${entry.name}`);
  const start = entry.localOffset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
  const data = blob.slice(start, start + entry.compressedSize);
  if (entry.method === 0) return textWithLimit(data.stream(), limit, entry.name);
  if (entry.method === 8) return textWithLimit(data.stream().pipeThrough(new DecompressionStream('deflate-raw')), limit, entry.name);
  throw new Error(`Unsupported compression in ${entry.name}`);
}
