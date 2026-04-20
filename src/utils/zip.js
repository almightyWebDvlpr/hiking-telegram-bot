const CRC32_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function uint16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value & 0xFFFF, 0);
  return buffer;
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0, 0);
  return buffer;
}

export function createStoredZip(entries = []) {
  const normalizedEntries = entries.map((entry) => ({
    name: String(entry.name || ""),
    data: Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data || "", "utf8")
  }));

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of normalizedEntries) {
    const nameBuffer = Buffer.from(entry.name, "utf8");
    const dataBuffer = entry.data;
    const checksum = crc32(dataBuffer);

    const localHeader = Buffer.concat([
      uint32(0x04034B50),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(checksum),
      uint32(dataBuffer.length),
      uint32(dataBuffer.length),
      uint16(nameBuffer.length),
      uint16(0),
      nameBuffer
    ]);

    localParts.push(localHeader, dataBuffer);

    const centralHeader = Buffer.concat([
      uint32(0x02014B50),
      uint16(20),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(checksum),
      uint32(dataBuffer.length),
      uint32(dataBuffer.length),
      uint16(nameBuffer.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(offset),
      nameBuffer
    ]);

    centralParts.push(centralHeader);
    offset += localHeader.length + dataBuffer.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.concat([
    uint32(0x06054B50),
    uint16(0),
    uint16(0),
    uint16(normalizedEntries.length),
    uint16(normalizedEntries.length),
    uint32(centralDirectory.length),
    uint32(offset),
    uint16(0)
  ]);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}
