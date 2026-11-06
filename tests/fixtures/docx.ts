import { crc32, deflateRawSync } from "node:zlib";
import { Document, HeadingLevel, LevelFormat, Packer, Paragraph, Table, TableCell, TableRow } from "docx";
import { fromBufferPromise } from "yauzl";

export function syntheticDocx(text?: string): Promise<Buffer> {
  return Packer.toBuffer(new Document({
    numbering: { config: [{ reference: "steps", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1." }] }] },
    sections: [{ children: text !== undefined ? [new Paragraph(text)] : [
      new Paragraph({ text: "Synthetic Candidate", heading: HeadingLevel.HEADING_1 }),
      new Paragraph("Built reliable services & tools for a fictional team."),
      new Paragraph({ text: "Experience", heading: HeadingLevel.HEADING_2 }),
      new Paragraph({ text: "Improved synthetic test coverage", bullet: { level: 0 } }),
      new Paragraph({ text: "Documented fictional workflows", bullet: { level: 0 } }),
      new Paragraph({ text: "Plan the work", numbering: { reference: "steps", level: 0 } }),
      new Paragraph({ text: "Verify the work", numbering: { reference: "steps", level: 0 } }),
      new Table({ rows: [new TableRow({ children: [
        new TableCell({ children: [new Paragraph("Skill")] }),
        new TableCell({ children: [new Paragraph("TypeScript")] }),
      ] })] }),
    ] }],
  }));
}

export type ZipPart = {
  name: string;
  data: Buffer;
  declaredSize?: number;
  checksum?: number;
  flags?: number;
  localName?: string;
};

export async function unpackDocx(bytes: Buffer): Promise<ZipPart[]> {
  const archive = await fromBufferPromise(bytes);
  const parts: ZipPart[] = [];
  try {
    for await (const entry of archive.eachEntry()) {
      const stream = await archive.openReadStreamPromise(entry);
      const chunks: Buffer[] = [];
      for await (const value of stream) {
        const chunk: unknown = value;
        if (!Buffer.isBuffer(chunk)) throw new Error("Unexpected fixture stream value");
        chunks.push(chunk);
      }
      parts.push({ name: entry.fileName, data: Buffer.concat(chunks) });
    }
  } finally { archive.close(); }
  return parts;
}

/** Tiny ZIP writer makes intentionally invalid headers possible without disk fixtures. */
export function zipParts(parts: ZipPart[]): Buffer {
  const files: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const part of parts) {
    const name = Buffer.from(part.name);
    const localName = Buffer.from(part.localName ?? part.name);
    const compressed = deflateRawSync(part.data);
    const checksum = part.checksum ?? crc32(part.data);
    const size = part.declaredSize ?? part.data.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(part.flags ?? 0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(localName.length, 26);
    files.push(local, localName, compressed);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(part.flags ?? 0, 8);
    header.writeUInt16LE(8, 10);
    header.writeUInt32LE(checksum, 16);
    header.writeUInt32LE(compressed.length, 20);
    header.writeUInt32LE(size, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(offset, 42);
    central.push(header, name);
    offset += local.length + localName.length + compressed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...files, directory, end]);
}
