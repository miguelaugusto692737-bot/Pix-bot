function crc16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function tlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

function normalizeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizePixKey(raw: string): string {
  const key = raw.trim();

  // EVP (chave aleatória) — UUID com hífens
  const evpRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (evpRegex.test(key)) return key.toLowerCase();

  // E-mail
  if (key.includes("@")) return key.toLowerCase();

  // Telefone: aceita vários formatos, normaliza para +55XXXXXXXXXXX
  const phoneClean = key.replace(/[\s()\-]/g, "");
  if (/^\+?\d{10,13}$/.test(phoneClean)) {
    if (phoneClean.startsWith("+")) return phoneClean;
    if (phoneClean.startsWith("55") && phoneClean.length >= 12) return `+${phoneClean}`;
    if (phoneClean.length === 11 || phoneClean.length === 10) return `+55${phoneClean}`;
    return `+${phoneClean}`;
  }

  // CPF: remove . e -
  const cpfClean = key.replace(/[.\-]/g, "");
  if (/^\d{11}$/.test(cpfClean)) return cpfClean;

  // CNPJ: remove . / e -
  const cnpjClean = key.replace(/[.\-\/]/g, "");
  if (/^\d{14}$/.test(cnpjClean)) return cnpjClean;

  // Retorna sem alteração se não reconheceu o tipo
  return key;
}

export interface PixOptions {
  key: string;
  name: string;
  city: string;
  amount: number;
  description: string;
  txid?: string;
}

export function generatePixPayload(opts: PixOptions): string {
  const key = normalizePixKey(opts.key);
  const name = normalizeAccents(opts.name).slice(0, 25).toUpperCase();
  const city = normalizeAccents(opts.city).slice(0, 15).toUpperCase();
  const txid = "***";

  // Campo 26: Merchant Account Information
  const gui = tlv("00", "br.gov.bcb.pix");
  const chave = tlv("01", key);

  // A descrição vai no sub-campo 02 do campo 26 conforme spec BCB
  // Limitamos para não ultrapassar 99 chars no campo 26 total
  const innerBase = gui + chave;
  const maxDescLen = 99 - innerBase.length - 4; // 4 = "02" + 2 dígitos de tamanho
  let descricao = "";
  if (opts.description && maxDescLen > 0) {
    const descClean = normalizeAccents(opts.description).slice(0, Math.min(72, maxDescLen));
    descricao = tlv("02", descClean);
  }

  const merchantAccountInfo = tlv("26", innerBase + descricao);
  const additionalData = tlv("62", tlv("05", txid));

  let payload =
    tlv("00", "01") +
    merchantAccountInfo +
    tlv("52", "0000") +
    tlv("53", "986") +
    tlv("54", opts.amount.toFixed(2)) +
    tlv("58", "BR") +
    tlv("59", name) +
    tlv("60", city) +
    additionalData +
    "6304";

  const crc = crc16(payload);
  return payload + crc;
}
