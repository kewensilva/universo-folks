import { File, Paths } from 'expo-file-system';

/** Grava o WAV sintetizado no cache do aparelho (uma vez por sequência) e devolve o endereço para tocar. */
const made = new Map<string, string>();
export async function wavUri(key: string, bytes: () => Uint8Array): Promise<string> {
  const hit = made.get(key);
  if (hit) return hit;
  const f = new File(Paths.cache, `folks-som-${key}.wav`);
  if (!f.exists) {
    f.create({ overwrite: true });
    await f.write(bytes());
  }
  made.set(key, f.uri);
  return f.uri;
}
