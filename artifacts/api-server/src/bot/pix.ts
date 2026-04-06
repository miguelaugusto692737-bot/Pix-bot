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

export interface PixOptions {
  key: string;
  name: string;
  city: string;
  amount?: number;
  description?: string;
  txid?: string;
}

export function generatePixPayload(opts: PixOptions): string {
  const name = opts.name.slice(0, 25).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const city = opts.city.slice(0, 15).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const txid = (opts.txid ?? "***").slice(0, 25);

  const gui = tlv("00", "br.gov.bcb.pix");
  const chave = tlv("01", opts.key);
  const descricao = opts.description ? tlv("02", opts.description.slice(0, 72)) : "";
  const merchantAccountInfo = tlv("26", gui + chave + descricao);

  const additionalData = tlv("62", tlv("05", txid));

  let payload =
    tlv("00", "01") +
    merchantAccountInfo +
    tlv("52", "0000") +
    tlv("53", "986");

  if (opts.amount !== undefined && opts.amount > 0) {
    payload += tlv("54", opts.amount.toFixed(2));
  }

  payload +=
    tlv("58", "BR") +
    tlv("59", name) +
    tlv("60", city) +
    additionalData +
    "6304";

  const crc = crc16(payload);
  return payload + crc;
}
