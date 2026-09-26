// Gera o "Pix Copia e Cola" (BR Code EMV) estático com valor.
export const PIX_KEY = "86090007536";
const MERCHANT = "NEXORA ISP";
const CITY = "SAO PAULO";

const f = (id: string, v: string) => id + String(v.length).padStart(2, "0") + v;

function crc16(s: string) {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    crc &= 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function pixPayload(amount: number, txid: string) {
  const tx = txid.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const body =
    f("00", "01") +
    f("26", f("00", "br.gov.bcb.pix") + f("01", PIX_KEY)) +
    f("52", "0000") + f("53", "986") + f("54", amount.toFixed(2)) +
    f("58", "BR") + f("59", MERCHANT) + f("60", CITY) +
    f("62", f("05", tx)) + "6304";
  return body + crc16(body);
}
