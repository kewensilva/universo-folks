/** Na web o WAV sintetizado vira um Blob em memória (mesma assinatura da versão do aparelho). */
const made = new Map<string, string>();
export async function wavUri(key: string, bytes: () => Uint8Array): Promise<string> {
  const hit = made.get(key);
  if (hit) return hit;
  const b = bytes();
  const url = URL.createObjectURL(new Blob([b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer], { type: 'audio/wav' }));
  made.set(key, url);
  return url;
}
