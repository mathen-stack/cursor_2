import { concatBytes, uint16le, uint32le, utf8 } from "../utils/binary";
import { crc32 } from "./crc32";

export interface ZipEntry {
  path: string;
  data: Uint8Array | string;
}

interface CentralEntry {
  pathBytes: Uint8Array;
  crc: number;
  size: number;
  offset: number;
}

export function createStoredZip(entries: ZipEntry[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralEntries: CentralEntry[] = [];
  let offset = 0;

  for (const entry of entries) {
    const pathBytes = utf8(entry.path);
    const data = typeof entry.data === "string" ? utf8(entry.data) : entry.data;
    const crc = crc32(data);
    const header = concatBytes([
      uint32le(0x04034b50),
      uint16le(20),
      uint16le(0x0800),
      uint16le(0),
      uint16le(0),
      uint16le(0x0021),
      uint32le(crc),
      uint32le(data.length),
      uint32le(data.length),
      uint16le(pathBytes.length),
      uint16le(0),
      pathBytes,
    ]);
    localParts.push(header, data);
    centralEntries.push({ pathBytes, crc, size: data.length, offset });
    offset += header.length + data.length;
  }

  const centralOffset = offset;
  const centralParts: Uint8Array[] = [];
  for (const entry of centralEntries) {
    const header = concatBytes([
      uint32le(0x02014b50),
      uint16le(20),
      uint16le(20),
      uint16le(0x0800),
      uint16le(0),
      uint16le(0),
      uint16le(0x0021),
      uint32le(entry.crc),
      uint32le(entry.size),
      uint32le(entry.size),
      uint16le(entry.pathBytes.length),
      uint16le(0),
      uint16le(0),
      uint16le(0),
      uint16le(0),
      uint32le(0),
      uint32le(entry.offset),
      entry.pathBytes,
    ]);
    centralParts.push(header);
    offset += header.length;
  }
  const centralDirectory = concatBytes(centralParts);
  const end = concatBytes([
    uint32le(0x06054b50),
    uint16le(0),
    uint16le(0),
    uint16le(centralEntries.length),
    uint16le(centralEntries.length),
    uint32le(centralDirectory.length),
    uint32le(centralOffset),
    uint16le(0),
  ]);
  return concatBytes([...localParts, centralDirectory, end]);
}
