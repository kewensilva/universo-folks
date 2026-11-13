import { KNOWN_CATEGORIES, SCHEMA_VERSION } from '../schema';
import type { Bundle, Course, Exam, GeneratorSpec, Lesson, Planet, Question, Slide, Unit } from '../schema';
import { Reporter } from '../report';
import { clean, keyNorm, parseVimeo, slugify } from '../text';

/**
 * Adaptador TOLERANTE: aceita o JSON que o Claude costuma gerar em conversas
 * (chaves em português ou inglês, aninhamentos diferentes, resposta correta
 * por índice/letra/texto) e também o formato do MCP (create_planet_tree).
 * Produz o formato canônico folks.content/v1 + avisos de tudo que foi inferido.
 */

// ------------------------------------------------------------ dicionário
const A = {
  planets: ['planets', 'planetas', 'temas', 'themes'],
  planet: ['planet', 'planeta', 'tema', 'theme'],
  courses: ['courses', 'cursos', 'curso', 'course'],
  units: ['units', 'unidades', 'unidade', 'trilha', 'trilhas', 'modulos', 'modulo', 'modules', 'module', 'capitulos', 'secoes', 'sections'],
  lessons: ['lessons', 'aulas', 'etapas', 'licoes', 'steps', 'nodes', 'conteudos', 'atividades', 'itens'],
  questions: ['questions', 'perguntas', 'questoes', 'quiz', 'exercicios', 'quizz'],
  options: ['options', 'alternativas', 'opcoes', 'respostas', 'answers', 'choices'],
  name: ['name', 'nome', 'title', 'titulo'],
  title: ['title', 'titulo', 'nome', 'name', 'heading', 'cabecalho'],
  description: ['description', 'descricao', 'resumo', 'sobre', 'objetivo', 'objetivos', 'summary', 'subtitulo'],
  /** descrição sem "summary" (no curso, summary é a linha curta do card) */
  descriptionStrict: ['description', 'descricao', 'sobre', 'objetivo', 'objetivos', 'subtitulo'],
  meta: ['meta', 'summary', 'resumocurto'],
  prompt: ['prompt', 'pergunta', 'enunciado', 'question', 'questao', 'texto', 'text'],
  correct: ['correct', 'correta', 'correto', 'iscorrect', 'certa', 'certo', 'resposta', 'respostacorreta', 'gabarito', 'answer', 'correctanswer', 'correctoption', 'alternativacorreta', 'correctindex'],
  explanation: ['explanation', 'explicacao', 'justificativa', 'comentario', 'feedbackgeral'],
  feedback: ['feedback', 'retorno'],
  video: ['vimeourl', 'vimeo', 'video', 'videourl', 'urlvideo', 'urldovideo', 'linkvideo', 'linkdovideo', 'link', 'url'],
  type: ['type', 'tipo', 'kind', 'formato'],
  exam: ['exam', 'prova', 'provafinal', 'avaliacao', 'avaliacaofinal', 'certificacao', 'desafiofinal', 'desafio', 'testefinal', 'finalexam'],
  category: ['category', 'categoria', 'categoryslug', 'galaxia', 'galaxy', 'area', 'trilhaprincipal'],
  slides: ['slides', 'telas', 'paginas', 'pages', 'topicos', 'blocos'],
  content: ['content', 'conteudo', 'texto', 'text', 'body', 'corpo', 'roteiro'],
  heading: ['heading', 'titulo', 'title', 'cabecalho', 'nome'],
  duration: ['durationseconds', 'duracaosegundos', 'duracao', 'duration', 'tempo'],
  passing: ['passingscore', 'notaminima', 'mediaminima', 'media', 'passingpct', 'aprovacao'],
  key: ['key', 'id', 'codigo', 'code', 'externalid'],
  slug: ['slug'],
  tier: ['accesstier', 'acesso', 'plano', 'tier'],
  premium: ['premium', 'pago', 'paid'],
  free: ['free', 'isfree', 'gratis', 'gratuito', 'livre', 'liberada'],
  certificate: ['hascertificate', 'certificado', 'certificate', 'temcertificado', 'emitecertificado'],
  generators: ['generators', 'geradores', 'generator', 'gerador'],
  questionCount: ['questioncount', 'questionsperround', 'questoesporrodada', 'porrodada', 'quantidade', 'numerodequestoes', 'qtdquestoes', 'totalquestoes', 'n'],
  status: ['status', 'situacao'],
  color: ['themecolor', 'cor', 'color', 'corprincipal'],
  minutes: ['estimatedminutes', 'duracaominutos', 'cargahoraria', 'minutos', 'tempoestimado'],
  badge: ['badge', 'insignia'],
  transcript: ['transcript', 'transcricao', 'roteirovideo'],
  practice: ['practice', 'pratica', 'exercicio', 'quizdovideo'],
  review: ['isreview', 'revisao', 'review'],
  shortName: ['shortname', 'nomecurto', 'apelido'],
  order: ['sortorder', 'ordem', 'order', 'posicao'],
  multiple: ['multiple', 'multipla', 'multiplaescolha', 'multipleChoice'],
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

function pick(o: Obj, aliases: string[]): unknown {
  const want = aliases.map(keyNorm);
  for (const a of want) for (const k of Object.keys(o)) if (keyNorm(k) === a && o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
}
const pickStr = (o: Obj, al: string[]) => clean(pick(o, al));
const pickArr = (o: Obj, al: string[]): unknown[] | undefined => {
  const v = pick(o, al);
  if (Array.isArray(v)) return v;
  if (isObj(v)) {
    // { "1": {...}, "2": {...} } ou { a: "...", b: "..." }
    return Object.values(v);
  }
  return undefined;
};
function pickBool(o: Obj, al: string[]): boolean | undefined {
  const v = pick(o, al);
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = keyNorm(v);
    if (['sim', 'true', 'yes', 's', 'verdadeiro', '1', 'x'].includes(s)) return true;
    if (['nao', 'false', 'no', 'n', 'falso', '0'].includes(s)) return false;
  }
  if (typeof v === 'number') return v !== 0;
  return undefined;
}
function pickInt(o: Obj, al: string[]): number | undefined {
  const v = pick(o, al);
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  if (typeof v === 'string') {
    const m = v.match(/(\d+(?:[.,]\d+)?)/);
    if (m) return Math.round(Number(m[1].replace(',', '.')));
  }
  return undefined;
}
/** "2:10", "130", "2 min", "2min30s" -> segundos */
function toSeconds(v: unknown): number | undefined {
  if (typeof v === 'number') return v > 0 ? Math.round(v) : undefined;
  const s = clean(v);
  if (!s) return undefined;
  let m = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (m) return m[3] ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2];
  m = s.match(/(\d+)\s*min(?:utos?)?(?:\s*(\d+)\s*s)?/i);
  if (m) return +m[1] * 60 + (m[2] ? +m[2] : 0);
  m = s.match(/^(\d+)\s*s?(?:egundos)?$/i);
  return m ? +m[1] : undefined;
}

// --------------------------------------------------------- normalizações
export function normalizeCategory(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const k = keyNorm(raw);
  if (/vida|pessoal|life/.test(k)) return 'para-a-vida';
  if (/trabalho|profiss|corporat|empresa|carreira|work/.test(k)) return 'para-o-trabalho';
  if (/escola|escolar|school|estud/.test(k)) return 'para-a-escola';
  return slugify(raw);
}

function normalizeTier(o: Obj): 'FREE' | 'PREMIUM' | undefined {
  const t = pickStr(o, A.tier);
  if (t) {
    const k = keyNorm(t);
    // FREEMIUM = parte grátis, parte premium: o planeta fica no plano grátis e cada unidade diz se é livre
    if (/freemium|misto|parcial/.test(k)) return 'FREE';
    if (/premium|pago|paid|assinatura|biblioteca/.test(k)) return 'PREMIUM';
    if (/free|gratis|gratuito|livre/.test(k)) return 'FREE';
  }
  const p = pickBool(o, A.premium);
  if (p !== undefined) return p ? 'PREMIUM' : 'FREE';
  const f = pickBool(o, A.free);
  if (f !== undefined) return f ? 'FREE' : 'PREMIUM';
  return undefined;
}

function normalizeStatus(o: Obj): Planet['status'] {
  const s = pickStr(o, A.status);
  if (!s) return undefined;
  const k = keyNorm(s);
  if (/publicad|published|ativo|live/.test(k)) return 'PUBLISHED';
  if (/embreve|comingsoon|breve|producao|emproducao/.test(k)) return 'COMING_SOON';
  if (/arquiv|archived/.test(k)) return 'ARCHIVED';
  return 'DRAFT';
}

type LessonKind = Lesson['type'] | 'EXAM' | undefined;
function lessonKind(raw: string | undefined): LessonKind {
  if (!raw) return undefined;
  const k = keyNorm(raw);
  if (/^generatedpractice|gerad|generator/.test(k)) return 'GENERATED_PRACTICE';
  if (/provafinal|desafiofinal|certificacao|avaliacaofinal|^prova$|^exam/.test(k)) return 'EXAM';
  if (/video|videoaula|assistir/.test(k)) return 'VIDEO';
  if (/pratic|practice|quiz|exercic|questionario|revis|fixacao|teste/.test(k)) return 'PRACTICE';
  if (/interativ|scorm|xapi|cmi5|interactive/.test(k)) return 'INTERACTIVE';
  if (/aula|lesson|leitura|texto|slide|teoria|conceito|conteudo|tela|reading/.test(k)) return 'LESSON';
  return undefined;
}

// ------------------------------------------------------------ questões
export interface AdapterCtx {
  rep: Reporter;
  /** base dos índices de resposta numérica detectada no documento (0 ou 1) */
  indexBase: 0 | 1 | null;
}

const LETTERS = 'abcdefgh';
const MARK_RE = /\s*(\((?:correta|certa|correct|resposta correta)\)|\[x\]|✅|✔️?|\*\*?correta\*\*?|←\s*correta)\s*/i;

function optionText(o: unknown): { text?: string; isCorrect?: boolean; feedback?: string } {
  if (typeof o === 'string' || typeof o === 'number') {
    let s = String(o).trim();
    let marked = false;
    if (MARK_RE.test(s)) { marked = true; s = s.replace(MARK_RE, ' ').trim(); }
    if (/^\*\s+/.test(s)) { marked = true; s = s.replace(/^\*\s+/, ''); }
    s = s.replace(/^\(?[a-hA-H][).:-]\s+/, '').trim(); // "a) texto", "B. texto"
    return { text: s || undefined, isCorrect: marked || undefined };
  }
  if (isObj(o)) {
    const text = pickStr(o, ['text', 'texto', 'opcao', 'alternativa', 'resposta', 'label', 'valor', 'value', 'option']);
    const ic = pickBool(o, ['iscorrect', 'correct', 'correta', 'correto', 'certa', 'certo', 'gabarito']);
    return { text: text?.replace(/^\(?[a-hA-H][).:-]\s+/, ''), isCorrect: ic, feedback: pickStr(o, A.feedback) };
  }
  return {};
}

/** Detecta, no documento inteiro, se respostas numéricas são base 0 ou base 1. */
export function detectIndexBase(root: unknown): 0 | 1 | null {
  let sawZero = false;
  let sawN = false;
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!isObj(v)) return;
    const opts = pickArr(v, A.options);
    const corr = pick(v, A.correct);
    if (opts && typeof corr === 'number') {
      if (corr === 0) sawZero = true;
      if (corr === opts.length) sawN = true;
    }
    Object.values(v).forEach(walk);
  };
  walk(root);
  if (sawZero && !sawN) return 0;
  if (sawN && !sawZero) return 1;
  return null;
}

export function adaptQuestion(raw: unknown, path: string, ctx: AdapterCtx): Question | null {
  const { rep } = ctx;
  if (!isObj(raw)) {
    rep.error(path, 'question.invalid', 'Questão em formato não reconhecido');
    return null;
  }
  const typeRaw = keyNorm(pickStr(raw, A.type) ?? '');
  const special = specialQuestion(raw, typeRaw, path, ctx);
  if (special !== undefined) return special;
  const prompt = pickStr(raw, A.prompt);
  let optsRaw = pickArr(raw, A.options);
  let type: Question['type'] = /multipl/.test(typeRaw) || pickBool(raw, A.multiple) ? 'MULTIPLE_CHOICE' : /verdadeiro|truefalse|vf|boolean/.test(typeRaw) ? 'TRUE_FALSE' : 'SINGLE_CHOICE';

  // V/F sem alternativas: { pergunta, resposta: true }
  const corrRaw = pick(raw, A.correct);
  if (!optsRaw && (type === 'TRUE_FALSE' || typeof corrRaw === 'boolean')) {
    type = 'TRUE_FALSE';
    optsRaw = ['Verdadeiro', 'Falso'];
  }
  if (!prompt) rep.error(path, 'question.prompt_missing', 'Questão sem enunciado');
  if (!optsRaw?.length) {
    rep.error(path, 'question.options_missing', 'Questão sem alternativas');
    return null;
  }
  // Se o objeto de alternativas era um mapa {a:..., b:...}, as chaves são letras
  const rawOptsField = pick(raw, A.options);
  const letterKeys = isObj(rawOptsField) ? Object.keys(rawOptsField).map((k) => keyNorm(k)) : null;

  const options = optsRaw.map((o) => optionText(o));
  const texts = options.map((o) => o.text ?? '');

  // Resposta correta indicada na própria questão
  const markCorrect = (i: number) => { if (options[i]) options[i].isCorrect = true; };
  const applyCorr = (c: unknown) => {
    if (c === undefined || c === null) return;
    if (Array.isArray(c)) return c.forEach(applyCorr);
    if (typeof c === 'boolean' && type === 'TRUE_FALSE') return markCorrect(c ? 0 : 1);
    if (typeof c === 'number') {
      let base = ctx.indexBase;
      if (base === null) {
        base = c === 0 ? 0 : c === options.length ? 1 : 0;
        if (c !== 0 && c !== options.length) rep.warn(path, 'question.ambiguous_index', `Resposta correta "${c}" pode ser índice base 0 ou 1; assumido base 0 ("${texts[c] ?? '?'}"). Confira.`);
      }
      return markCorrect(c - base);
    }
    const s = String(c).trim();
    const letter = s.match(/^\(?([a-hA-H])[).]?$/) ?? s.match(/^(?:letra|alternativa|opcao|opção)\s+([a-hA-H])\b/i);
    if (letter) {
      const L = letter[1].toLowerCase();
      const idx = letterKeys ? letterKeys.indexOf(L) : LETTERS.indexOf(L);
      return markCorrect(idx >= 0 ? idx : LETTERS.indexOf(L));
    }
    if (/^\d+$/.test(s)) return applyCorr(Number(s));
    if (type === 'TRUE_FALSE' || /^(verdadeiro|falso|true|false|v|f)$/i.test(s)) {
      const truthy = /^(verdadeiro|true|v)$/i.test(s);
      if (texts.length === 2 && /verdadeiro|true/i.test(texts[0])) return markCorrect(truthy ? 0 : 1);
    }
    const byText = texts.findIndex((t) => keyNorm(t) === keyNorm(s.replace(/^\(?[a-hA-H][).:-]\s+/, '')));
    if (byText >= 0) return markCorrect(byText);
    rep.warn(path, 'question.correct_unresolved', `Não foi possível identificar a alternativa correta a partir de "${s}"`);
  };
  applyCorr(corrRaw);

  const out = {
    type,
    prompt: prompt ?? '',
    explanation: pickStr(raw, A.explanation),
    ...questionExtras(raw),
    options: options.map((o) => ({ text: o.text ?? '', isCorrect: !!o.isCorrect, ...(o.feedback ? { feedback: o.feedback } : {}) })),
  } as Extract<Question, { options: unknown }>;
  const nCorrect = out.options.filter((o) => o.isCorrect).length;
  if (nCorrect > 1 && type === 'SINGLE_CHOICE') {
    out.type = 'MULTIPLE_CHOICE';
    rep.info(path, 'question.became_multiple', 'Mais de uma alternativa correta: questão tratada como múltipla escolha');
  }
  return out;
}

// --------------------------------------------- tipos além da escolha
const QTYPE: Record<string, Question['type']> = {
  number: 'NUMBER', numero: 'NUMBER', numeric: 'NUMBER', calc: 'NUMBER', calcnumber: 'NUMBER',
  order: 'ORDER', ordenar: 'ORDER', ordem: 'ORDER', ordersteps: 'ORDER', sequencia: 'ORDER',
  buildsentence: 'BUILD_SENTENCE', montarfrase: 'BUILD_SENTENCE', montefrase: 'BUILD_SENTENCE',
  matchpairs: 'MATCH_PAIRS', ligarpares: 'MATCH_PAIRS', pares: 'MATCH_PAIRS', associar: 'MATCH_PAIRS', match: 'MATCH_PAIRS',
  classify: 'CLASSIFY', classificar: 'CLASSIFY', sortg: 'CLASSIFY',
  simulator: 'SIMULATOR', simulador: 'SIMULATOR', adjustsimulator: 'SIMULATOR',
};
/** enunciado padrão quando o "confere rapidinho" vem sem pergunta */
const DEFAULT_PROMPT: Partial<Record<Question['type'], string>> = {
  NUMBER: 'Digite o resultado.',
  ORDER: 'Coloque na ordem certa.',
  BUILD_SENTENCE: 'Monte a frase.',
  MATCH_PAIRS: 'Ligue os pares.',
  CLASSIFY: 'Coloque cada item no grupo certo.',
  SIMULATOR: 'Ajuste o simulador.',
};

/** campos comuns a todos os tipos (formato, tempo, mídia) */
function questionExtras(raw: Obj) {
  const out: Record<string, unknown> = {};
  const methodology = pickStr(raw, ['methodology', 'metodologia', 'formato', 'format']);
  if (methodology) out.methodology = methodology;
  const ms = pick(raw, ['timelimitms', 'tempoms']);
  const secs = pick(raw, ['timelimitseconds', 'temposegundos']);
  if (typeof ms === 'number' && ms > 0) out.timeLimitMs = Math.round(ms);
  else if (typeof secs === 'number' && secs > 0) out.timeLimitMs = Math.round(secs * 1000);
  for (const k of ['visual', 'visualAfterAnswer', 'audio', 'speakAfterAnswer']) {
    const v = pick(raw, [k]);
    if (isObj(v)) out[k] = k === 'audio' && !v.kind ? { kind: Array.isArray(v.sequence) ? 'NOTES' : typeof v.url === 'string' ? 'URL' : 'TTS', ...v } : v;
  }
  return out;
}

const strList = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.map((x) => clean(x) ?? '').filter(Boolean) : undefined);

function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    // "1.900", "1.900,50", "R$ 2.000" (pt-BR) ou "1900.5"
    const s = v.replace(/[^\d.,-]/g, '');
    const n = /,\d{1,2}$/.test(s) ? Number(s.replace(/\./g, '').replace(',', '.')) : /^\d{1,3}(\.\d{3})+$/.test(s) ? Number(s.replace(/\./g, '')) : Number(s.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Questão de tipo especial (não-escolha). undefined = não é especial; null = inválida. */
function specialQuestion(raw: Obj, typeRaw: string, path: string, ctx: AdapterCtx): Question | null | undefined {
  const type = QTYPE[typeRaw];
  if (!type) return undefined;
  const { rep } = ctx;
  const prompt = pickStr(raw, A.prompt) ?? DEFAULT_PROMPT[type] ?? '';
  const base = { prompt, explanation: pickStr(raw, A.explanation), ...questionExtras(raw) };
  const answerRaw = pick(raw, ['answer', 'resposta', 'correct', 'gabarito', 'correctorder', 'ordemcorreta']);
  switch (type) {
    case 'NUMBER': {
      const answer = toNumber(answerRaw);
      if (answer === undefined) { rep.error(path, 'question.number_answer', 'Questão numérica sem resposta (campo "answer")'); return null; }
      const tolerance = toNumber(pick(raw, ['tolerance', 'tolerancia', 'margem']));
      return { ...base, type, answer, ...(tolerance !== undefined ? { tolerance } : {}) };
    }
    case 'ORDER':
    case 'BUILD_SENTENCE': {
      const pieces = strList(pick(raw, ['pieces', 'pecas', 'blocos', 'palavras', 'words', 'steps', 'passos', 'itens', 'items']));
      const answer = strList(answerRaw) ?? (type === 'ORDER' ? undefined : undefined);
      if (!pieces?.length || !answer?.length) { rep.error(path, 'question.sequence_missing', `${type === 'ORDER' ? 'Ordenar' : 'Montar frase'} precisa de "pieces" e "answer"`); return null; }
      return { ...base, type, pieces, answer } as Question;
    }
    case 'MATCH_PAIRS': {
      const list = pickArr(raw, ['pairs', 'pares', 'associacoes']) ?? [];
      const pairs = list
        .map((p) => (Array.isArray(p) ? { left: clean(p[0]), right: clean(p[1]) } : isObj(p) ? { left: pickStr(p, ['left', 'esquerda', 'a', 'termo']), right: pickStr(p, ['right', 'direita', 'b', 'definicao', 'traducao']) } : {}))
        .filter((p): p is { left: string; right: string } => !!p.left && !!p.right);
      if (pairs.length < 2) { rep.error(path, 'question.pairs_missing', 'Ligar pares precisa de pelo menos 2 pares'); return null; }
      return { ...base, type, pairs };
    }
    case 'CLASSIFY': {
      const groups = strList(pick(raw, ['groups', 'grupos', 'categorias'])) ?? [];
      const items = (pickArr(raw, ['items', 'itens']) ?? [])
        .map((it) => {
          const [text, g, feedback] = Array.isArray(it) ? [clean(it[0]), it[1], clean(it[2])] : isObj(it) ? [pickStr(it, ['text', 'texto', 'item']), pick(it, ['group', 'grupo']), pickStr(it, A.feedback)] : [undefined];
          const group = typeof g === 'number' ? g : typeof g === 'string' ? groups.findIndex((x) => keyNorm(x) === keyNorm(g)) : -1;
          return text ? { text, group, ...(feedback ? { feedback } : {}) } : null;
        })
        .filter((x): x is { text: string; group: number; feedback?: string } => !!x);
      if (items.some((i) => i.group < 0)) rep.error(path, 'question.classify_group', 'Item sem grupo válido');
      return { ...base, type, groups, items };
    }
    case 'SIMULATOR': {
      const sim = pick(raw, ['simulator', 'simulador', 'sim']);
      const simulator = isObj(sim) ? sim : typeof sim === 'string' ? { id: sim } : undefined;
      if (!simulator) { rep.error(path, 'question.simulator_missing', 'Desafio de simulador sem "simulator"'); return null; }
      return { ...base, type, simulator: simulator as { id: string }, ...(pickStr(raw, ['note', 'nota', 'observacao']) ? { note: pickStr(raw, ['note', 'nota', 'observacao']) } : {}) };
    }
  }
  return undefined;
}

/** geradores: ["t1", ...] ou [{ methodology, data }] */
function generatorSpecs(v: unknown): GeneratorSpec[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((g) => (typeof g === 'string' ? { methodology: g } : isObj(g) ? { methodology: pickStr(g, ['methodology', 'metodologia', 'id', 'type', 'tipo']) ?? '', ...(isObj(g.data) ? { data: g.data as Record<string, unknown> } : {}) } : null))
    .filter((g): g is GeneratorSpec => !!g && !!g.methodology);
  return out.length ? out : undefined;
}

function adaptQuestions(list: unknown[] | undefined, path: string, ctx: AdapterCtx): Question[] {
  return (list ?? []).map((q, i) => adaptQuestion(q, `${path}[${i}]`, ctx)).filter((q): q is Question => !!q);
}

// ------------------------------------------------------------ etapas
function slidesFrom(o: Obj, title: string, ctx?: AdapterCtx, path = ''): Slide[] {
  // formato MCP: { content: { slides: [...] } }
  const contentObj = pick(o, A.content);
  if (isObj(contentObj)) return slidesFrom(contentObj, title, ctx, path);
  const arr = pickArr(o, A.slides);
  if (arr?.length) {
    return arr
      .map((s, i) => {
        if (typeof s === 'string') return { heading: i === 0 ? title : `${title} (${i + 1})`, text: s.trim() };
        if (isObj(s)) {
          const parts = strList(pick(s, ['textparts', 'partes', 'partesdotexto']));
          const text = pickStr(s, A.content) ?? pickStr(s, A.description) ?? parts?.join(' ') ?? '';
          const visualHtml = pickStr(s, ['visualhtml', 'html', 'visual']);
          const widgetRaw = pick(s, ['widget', 'interativo', 'interacao']);
          const widget = isObj(widgetRaw) && pickStr(widgetRaw, A.type) ? { ...widgetRaw, type: (pickStr(widgetRaw, A.type) as string).toUpperCase() } : undefined;
          const checkRaw = pick(s, ['check', 'conferir', 'conferirapidinho', 'checagem']);
          const check = isObj(checkRaw) && ctx ? adaptQuestion(checkRaw, `${path}.slides[${i}].check`, ctx) : undefined;
          const out: Slide = { heading: pickStr(s, A.heading) ?? title, text };
          if (parts?.length) out.textParts = parts;
          if (visualHtml) out.visualHtml = visualHtml;
          if (widget) out.widget = widget;
          if (check) out.check = check;
          // sons da tela (aula de som): notas sintetizadas ou arquivo de áudio
          const demosRaw = pickArr(s, ['audiodemos', 'demos', 'sons', 'audios', 'sounds']);
          if (demosRaw?.length) {
            out.audioDemos = demosRaw.filter(isObj).map((d) => {
              const seq = pick(d, ['sequence', 'seq', 'sequencia', 'notas', 'notes']);
              const url = pickStr(d, ['url', 'audiourl', 'link', 'arquivo']);
              return {
                label: pickStr(d, ['label', 'titulo', 'title', 'nome', 'rotulo']) ?? 'Ouvir',
                ...(pickStr(d, ['caption', 'legenda', 'descricao', 'description']) ? { caption: pickStr(d, ['caption', 'legenda', 'descricao', 'description']) } : {}),
                ...(Array.isArray(seq) ? { sequence: seq as never } : {}),
                ...(url ? { url } : {}),
              };
            });
          }
          return out;
        }
        return null;
      })
      .filter((s): s is Slide => !!s && (!!s.text || !!s.widget));
  }
  const content = pickStr(o, A.content) ?? pickStr(o, A.description);
  if (!content) return [];
  return [{ heading: title, text: content }];
}

function adaptLessonList(list: unknown[], path: string, ctx: AdapterCtx, course: { exam?: Exam | null; examFromLessons?: boolean }): Lesson[] {
  const { rep } = ctx;
  const out: Lesson[] = [];
  list.forEach((raw, i) => {
    const p = `${path}[${i}]`;
    if (typeof raw === 'string') {
      const url = raw.match(/https?:\/\/\S*vimeo\.com\/\S+/)?.[0];
      if (url) out.push({ type: 'VIDEO', title: raw.replace(url, '').replace(/[-–:]\s*$/, '').trim() || 'Vídeo', vimeoUrl: url });
      else out.push({ type: 'LESSON', title: raw.slice(0, 120), slides: [{ heading: raw.slice(0, 120), text: raw }] });
      rep.warn(p, 'lesson.from_string', 'Etapa informada só como texto; convertida automaticamente. Confira.');
      return;
    }
    if (!isObj(raw)) return rep.error(p, 'lesson.invalid', 'Etapa em formato não reconhecido');

    const title = pickStr(raw, A.title) ?? `Etapa ${i + 1}`;
    const videoRaw = pick(raw, A.video);
    const videoUrl = typeof videoRaw === 'string' ? clean(videoRaw) : isObj(videoRaw) ? pickStr(videoRaw, ['url', 'link', 'vimeourl']) : undefined;
    const questions = pickArr(raw, A.questions);
    const generators = pick(raw, A.generators);
    let kind = lessonKind(pickStr(raw, A.type));
    const inferred = !kind;
    if (!kind) {
      if (generators) kind = 'GENERATED_PRACTICE';
      else if (questions?.length) kind = 'PRACTICE';
      else if (videoRaw !== undefined) kind = 'VIDEO';
      else if (pickStr(raw, ['interactivepackageid', 'pacote'])) kind = 'INTERACTIVE';
      else kind = 'LESSON';
      if (kind !== 'LESSON' || !pickArr(raw, A.slides)) rep.info(p, 'lesson.type_inferred', `Tipo da etapa inferido como ${kind}`);
    }

    if (kind === 'EXAM') {
      const ex: Exam = { title, questionSource: 'BANK', questions: adaptQuestions(questions, `${p}.questions`, ctx), passingScore: pickInt(raw, A.passing) };
      if (course.exam) rep.warn(p, 'exam.duplicate', 'Curso já tem prova final; esta etapa de prova foi ignorada');
      else { course.exam = ex; course.examFromLessons = true; rep.info(p, 'exam.moved', 'Prova encontrada entre as etapas: movida para a certificação do curso'); }
      return;
    }
    if (kind === 'VIDEO') {
      let url: string | null = videoUrl && /^https?:\/\//.test(videoUrl) ? videoUrl : null;
      if (!url) rep.warn(p, 'video.url_missing', `Vídeo "${title}" sem URL do Vimeo: ficará pendente (ligue depois pela pasta do Vimeo)`);
      else if (!parseVimeo(url)) { rep.warn(p, 'video.not_vimeo', `URL não é do Vimeo: ${url}`); }
      out.push({
        type: 'VIDEO',
        title,
        videoTitle: pickStr(raw, ['videotitle', 'titulovideo', 'nomevideo']) ?? (isObj(videoRaw) ? pickStr(videoRaw, A.title) : undefined) ?? title,
        description: pickStr(raw, A.description),
        vimeoUrl: url,
        durationSeconds: toSeconds(pick(raw, A.duration)),
        transcript: pickStr(raw, A.transcript),
      });
      // prática embutida no vídeo (formato MCP "practice" ou "perguntas" dentro do vídeo)
      const prac = pick(raw, A.practice);
      const pracQs = isObj(prac) ? pickArr(prac, A.questions) : Array.isArray(prac) ? prac : questions;
      if (pracQs?.length) {
        out.push({
          type: 'PRACTICE',
          title: (isObj(prac) && pickStr(prac, A.title)) || `Prática: ${title}`,
          passingPct: isObj(prac) ? pickInt(prac, A.passing) : undefined,
          questions: adaptQuestions(pracQs, `${p}.practice.questions`, ctx),
        });
      }
      return;
    }
    if (kind === 'PRACTICE') {
      if (!questions?.length) return rep.error(p, 'practice.no_questions', `Prática "${title}" sem questões`);
      const isReview = pickBool(raw, A.review) ?? (/revis/i.test(pickStr(raw, A.type) ?? '') || undefined);
      const gens = generatorSpecs(generators);
      out.push({
        type: 'PRACTICE',
        title,
        passingPct: pickInt(raw, A.passing),
        isReview,
        questionsPerRound: pickInt(raw, ['questionsperround', 'questoesporrodada', 'porrodada', 'questioncount']),
        questions: adaptQuestions(questions, `${p}.questions`, ctx),
        ...(gens ? { generators: gens } : {}),
      });
      return;
    }
    if (kind === 'GENERATED_PRACTICE') {
      const gens = (generatorSpecs(Array.isArray(generators) ? generators : [generators]) ?? []).map((g) => g.methodology);
      out.push({ type: 'GENERATED_PRACTICE', title, generators: gens, questionCount: pickInt(raw, A.questionCount) ?? 8, isReview: pickBool(raw, A.review) });
      return;
    }
    if (kind === 'INTERACTIVE') {
      out.push({ type: 'INTERACTIVE', title, interactivePackageId: pickStr(raw, ['interactivepackageid', 'pacote', 'packageid']) ?? '' });
      return;
    }
    const slides = slidesFrom(raw, title, ctx, p);
    if (!slides.length) rep.error(p, 'lesson.empty', `Aula "${title}" sem conteúdo (telas/texto)`);
    if (inferred && slides.length) rep.info(p, 'lesson.type_inferred', 'Etapa sem tipo tratada como aula (telas)');
    out.push({ type: 'LESSON', title, slides });
  });
  return out;
}

// ------------------------------------------------------------ curso
function adaptCourse(raw: unknown, path: string, ctx: AdapterCtx, planetSlug: string, index: number): Course | null {
  const { rep } = ctx;
  if (typeof raw === 'string') {
    rep.warn(path, 'course.title_only', `Curso "${raw}" informado só pelo nome, sem trilha`);
    // mesma forma de um curso completo (accessTier/exam nulos) para o hash ser estável
    return { key: `${planetSlug}.${slugify(raw)}`, slug: slugify(raw), title: raw, accessTier: null, hasCertificate: false, units: [], exam: null } as Course;
  }
  if (!isObj(raw)) { rep.error(path, 'course.invalid', 'Curso em formato não reconhecido'); return null; }
  const title = pickStr(raw, A.title) ?? `Curso ${index + 1}`;
  if (!pickStr(raw, A.title)) rep.error(path, 'course.title_missing', 'Curso sem título');
  const slug = slugify(pickStr(raw, A.slug) ?? title);
  const holder: { exam?: Exam | null } = {};

  let unitsRaw = pickArr(raw, A.units);
  const lessonsDirect = pickArr(raw, A.lessons);
  if (!unitsRaw && lessonsDirect) {
    // curso com etapas direto, sem unidades -> uma unidade
    unitsRaw = [{ titulo: title, aulas: lessonsDirect }];
    rep.info(path, 'units.wrapped', 'Curso sem unidades: etapas agrupadas numa unidade');
  }
  const units: Unit[] = (unitsRaw ?? []).map((u, ui) => {
    const up = `${path}.units[${ui}]`;
    if (!isObj(u)) { rep.error(up, 'unit.invalid', 'Unidade em formato não reconhecido'); return null; }
    const uTitle = pickStr(u, A.title) ?? `Unidade ${ui + 1}`;
    // etapas da unidade; se a unidade só tem perguntas, vira uma prática
    let lessonsRaw = pickArr(u, A.lessons);
    const unitQuestions = pickArr(u, A.questions);
    if (!lessonsRaw && unitQuestions?.length) lessonsRaw = [{ tipo: 'pratica', titulo: `Prática: ${uTitle}`, perguntas: unitQuestions }];
    const lessons = adaptLessonList(lessonsRaw ?? [], `${up}.lessons`, ctx, holder);
    if (!lessons.length) rep.error(up, 'unit.empty', `Unidade "${uTitle}" sem etapas`);
    const color = (pickStr(u, A.color)?.match(/^#[0-9a-fA-F]{6}$/) ?? [])[0];
    return { title: uTitle, description: pickStr(u, A.description), accessTier: normalizeTier(u) ?? null, ...(color ? { color } : {}), lessons } as Unit;
  }).filter((u): u is Unit => !!u);
  // curso sem trilha: a validação decide (só é aceito como "Em breve")

  // prova final
  const examRaw = pick(raw, A.exam);
  if (isObj(examRaw) || Array.isArray(examRaw)) {
    const eo: Obj = Array.isArray(examRaw) ? { perguntas: examRaw } : examRaw;
    const gens = pick(eo, A.generators);
    const qs = pickArr(eo, A.questions);
    if (holder.exam) rep.warn(`${path}.exam`, 'exam.duplicate', 'Prova definida duas vezes; usada a do campo de prova');
    holder.exam = gens && !qs?.length
      ? { title: pickStr(eo, A.title) ?? 'Desafio final', questionSource: 'GENERATED', generators: (Array.isArray(gens) ? gens : [gens]).map(String), questionCount: pickInt(eo, A.questionCount) ?? 10, passingScore: pickInt(eo, A.passing) }
      : { title: pickStr(eo, A.title) ?? 'Certificação', questionSource: 'BANK', questions: adaptQuestions(qs, `${path}.exam.questions`, ctx), passingScore: pickInt(eo, A.passing), timeLimitMinutes: pickInt(eo, ['timelimitminutes', 'tempolimite', 'tempomaximo']) };
  }

  const badgeRaw = pick(raw, A.badge);
  const badge = isObj(badgeRaw)
    ? { icon: pickStr(badgeRaw, ['icon', 'icone']) ?? 'medal', name: pickStr(badgeRaw, A.name) ?? title, text: pickStr(badgeRaw, A.description) ?? pickStr(badgeRaw, A.content) ?? '' }
    : typeof badgeRaw === 'string' ? { icon: 'medal', name: badgeRaw, text: '' } : undefined;

  return {
    key: pickStr(raw, A.key) ?? `${planetSlug}.${slug}`,
    slug,
    title,
    description: pickStr(raw, A.descriptionStrict) ?? pickStr(raw, ['resumo']),
    meta: pickStr(raw, A.meta),
    status: normalizeStatus(raw),
    accessTier: normalizeTier(raw) ?? null,
    hasCertificate: pickBool(raw, A.certificate) ?? false,
    __certificateExplicit: pickBool(raw, A.certificate) !== undefined,
    estimatedMinutes: pickInt(raw, A.minutes),
    icon: pickStr(raw, ['icon', 'icone']),
    badge,
    drillLabel: pickStr(raw, ['drilllabel', 'nometreino']),
    trailTemplate: pickStr(raw, ['trailtemplate', 'modelotrilha', 'modelodetrilha', 'template', 'modelo']),
    units,
    exam: holder.exam ?? null,
  } as Course;
}

// ------------------------------------------------------------ planeta
function adaptPlanet(raw: unknown, path: string, ctx: AdapterCtx, index: number): Planet | null {
  const { rep } = ctx;
  if (!isObj(raw)) { rep.error(path, 'planet.invalid', 'Planeta em formato não reconhecido'); return null; }
  const name = pickStr(raw, A.name);
  if (!name) rep.error(path, 'planet.name_missing', 'Planeta sem nome');
  const slug = slugify(pickStr(raw, A.slug) ?? name ?? `planeta-${index + 1}`);
  const catRaw = pickStr(raw, A.category);
  const category = normalizeCategory(catRaw);
  if (!category) rep.warn(path, 'planet.category_missing', `Planeta "${name}" sem categoria (Para a vida / Para o trabalho / Para a escola)`);
  else if (!(KNOWN_CATEGORIES as readonly string[]).includes(category)) rep.warn(path, 'planet.category_unknown', `Categoria "${catRaw}" não é uma das padrão; precisa existir no banco (${category})`);

  if (/freemium/i.test(pickStr(raw, A.tier) ?? '')) rep.info(path, 'planet.freemium', 'FREEMIUM: planeta no plano grátis; cada unidade diz se é livre (isFree) ou Premium');
  const coursesRaw = pickArr(raw, A.courses) ?? [];
  const courses = coursesRaw.map((c, ci) => adaptCourse(c, `${path}.courses[${ci}]`, ctx, slug, ci)).filter((c): c is Course => !!c);
  const visual = pick(raw, ['visual']);
  return {
    key: pickStr(raw, A.key) ?? slug,
    slug,
    name: name ?? '',
    shortName: pickStr(raw, A.shortName),
    category: category ?? '',
    description: pickStr(raw, A.description),
    status: normalizeStatus(raw),
    accessTier: normalizeTier(raw) ?? ('' as any),
    themeColor: (pickStr(raw, A.color)?.match(/^#[0-9a-fA-F]{6}$/) ?? [])[0],
    visual: isObj(visual) ? visual : undefined,
    sortOrder: pickInt(raw, A.order),
    vimeoFolder: pickStr(raw, ['vimeofolder', 'vimeofolderuri', 'vimeofolderid', 'pastavimeo', 'pastadovimeo']),
    courses,
  };
}

// ------------------------------------------------------------ raiz
/** Localiza a lista de planetas em qualquer formato de raiz conhecido. */
function findPlanets(root: unknown, rep: Reporter): unknown[] {
  if (Array.isArray(root)) {
    // lista de planetas ou de bundles
    return root.flatMap((r) => (isObj(r) && (pick(r, A.planets) || pick(r, A.planet)) ? findPlanets(r, rep) : [r]));
  }
  if (!isObj(root)) return [];
  const many = pick(root, A.planets);
  if (Array.isArray(many)) return many;
  if (isObj(many)) return Object.values(many);
  const one = pick(root, A.planet);
  if (isObj(one)) return [one];
  if (pick(root, A.courses)) return [root]; // o próprio objeto é um planeta
  if (pick(root, A.units) || pick(root, A.lessons)) {
    rep.error('$', 'root.course_without_planet', 'O JSON parece ser um CURSO sem o planeta. Envolva em { "planeta": { "nome": "...", "categoria": "...", "cursos": [ ... ] } }');
  }
  return [];
}

export function adaptLenientJson(root: unknown, rep: Reporter): Bundle {
  const ctx: AdapterCtx = { rep, indexBase: detectIndexBase(root) };
  if (ctx.indexBase !== null) rep.info('$', 'question.index_base', `Respostas numéricas interpretadas como índice base ${ctx.indexBase}`);
  const planetsRaw = findPlanets(root, rep);
  if (!planetsRaw.length && !rep.errors.length) rep.error('$', 'root.no_planets', 'Nenhum planeta encontrado no conteúdo enviado');
  const planets = planetsRaw.map((p, i) => adaptPlanet(p, `planets[${i}]`, ctx, i)).filter((p): p is Planet => !!p);
  const source = isObj(root) ? pick(root, ['source', 'origem']) : undefined;
  return { schemaVersion: SCHEMA_VERSION, source: isObj(source) ? (source as Bundle['source']) : { tool: 'claude' }, planets };
}
