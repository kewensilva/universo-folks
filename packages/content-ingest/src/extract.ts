/**
 * Extrai JSON de um texto colado do chat: blocos ```json```, JSON puro ou o
 * primeiro objeto/array balanceado. Retorna todos os blocos encontrados.
 */
export function extractJsonBlocks(text: string): { values: unknown[]; errors: string[] } {
  const values: unknown[] = [];
  const errors: string[] = [];
  const trimmed = text.trim();
  const tryParse = (s: string, where: string) => {
    try {
      values.push(JSON.parse(s));
      return true;
    } catch (e: any) {
      // tolera vírgula sobrando antes de ] ou } (erro comum em JSON gerado/colado)
      try {
        values.push(JSON.parse(s.replace(/,\s*([\]}])/g, '$1')));
        return true;
      } catch {
        errors.push(`${where}: JSON inválido (${String(e?.message ?? e).slice(0, 120)})`);
        return false;
      }
    }
  };
  let wholeError: string | undefined;
  if (/^[[{]/.test(trimmed)) {
    if (tryParse(trimmed, 'conteúdo')) return { values, errors };
    wholeError = errors.pop(); // guarda: se nada mais for achado, este é o motivo real
  }

  const fence = /```(?:json|JSON|jsonc)?\s*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = fence.exec(text))) {
    const body = m[1].trim();
    if (/^[[{]/.test(body)) tryParse(body, `bloco ${++i}`);
  }
  if (values.length) return { values, errors };

  // primeiro objeto/array balanceado no texto
  const start = text.search(/[[{]/);
  if (start >= 0) {
    const open = text[start];
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inStr = false;
    for (let j = start; j < text.length; j++) {
      const c = text[j];
      if (inStr) { if (c === '\\') j++; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === open) depth++;
      else if (c === close && --depth === 0) { tryParse(text.slice(start, j + 1), 'trecho JSON'); break; }
    }
  }
  if (!values.length && wholeError) errors.unshift(`${wholeError}. O JSON parece incompleto (resposta do Claude cortada?)`);
  return { values, errors };
}

/** O texto parece ser JSON (ou contém blocos JSON)? */
export function looksLikeJson(text: string): boolean {
  const t = text.trim();
  return /^[[{]/.test(t) || /```(?:json|jsonc)/i.test(text);
}
