import { Reporter } from '../report';
import { clean } from '../text';

/**
 * Lê o conteúdo que o Claude escreveu em TEXTO/MARKDOWN no chat e monta a
 * estrutura intermediária (chaves em português) que o adaptador tolerante entende.
 * É heurístico: sempre revise a prévia. Para máxima fidelidade, use o prompt de
 * conversão (o próprio Claude devolve o JSON canônico).
 *
 * Reconhece:
 *  # Planeta: Comunicação          ## Curso 1 – Comunicação Assertiva
 *  ### Unidade 1: O que é          #### Aula 1 / Vídeo / Prática / Quiz
 *  ## Desafio final / Certificação (prova do curso)
 *  Categoria: Para o trabalho      Descrição: ...    Vídeo: https://vimeo.com/123
 *  1. Pergunta?                    a) alternativa    b) alternativa (correta)
 *  Resposta: b   |   Gabarito: B   |   - [x] alternativa certa
 */
type Level = 'planet' | 'course' | 'unit' | 'lesson' | 'exam';
const KW: Array<[Level, RegExp]> = [
  ['planet', /^(planeta|tema|planet|theme)\b/i],
  ['course', /^(curso|course)\b/i],
  ['exam', /(prova\s*final|desafio\s*final|certifica[cç][aã]o|avalia[cç][aã]o\s*final|final\s*exam)/i],
  ['unit', /^(unidade|m[oó]dulo|trilha|cap[ií]tulo|se[cç][aã]o|unit|module)\b/i],
  ['lesson', /^(aula|v[ií]deo|pr[aá]tica|quiz|exerc[ií]cios?|revis[aã]o|atividade|li[cç][aã]o|lesson|video|practice|etapa)\b/i],
];

const stripMd = (s: string) => s.replace(/[*_`]+/g, '').replace(/^[\p{Extended_Pictographic}\s]+/u, '').trim();
/** "Curso 2 – Comunicação Assertiva" -> "Comunicação Assertiva" ; "Aula 1: X" -> "X" */
const nameAfterKeyword = (s: string) =>
  s.replace(/^(planeta|tema|curso|unidade|m[oó]dulo|trilha|cap[ií]tulo|se[cç][aã]o|aula|li[cç][aã]o|etapa|planet|theme|course|unit|module|lesson)\s*\d*\s*[:\-–—.]?\s*/i, '').trim() || s.trim();

const VIMEO = /https?:\/\/(?:www\.|player\.)?vimeo\.com\/\S+/i;
const KV = /^\s*[-*]?\s*\**\s*(descri[cç][aã]o|resumo|objetivo|categoria|gal[aá]xia|v[ií]deo|url|link|dura[cç][aã]o|acesso|plano|certificado|cor|t[ií]tulo do v[ií]deo)\s*\**\s*[:：]\s*(.+)$/i;
const QUESTION = /^\s*(?:\**\s*(?:pergunta|quest[aã]o|q)\s*\d*\s*\**\s*[:.)\-]\s*|(\d{1,2})[.)]\s+)(.+)$/i;
const OPTION = /^\s*[-*]?\s*(?:\(?([a-hA-H])[).]|\[([ xX✓])\])\s+(.+)$/;
const ANSWER = /^\s*[-*]?\s*\**\s*(resposta(?:\s*correta)?|gabarito|correta|alternativa\s*correta)\s*\**\s*[:：]\s*(.+)$/i;
const EXPL = /^\s*[-*]?\s*\**\s*(explica[cç][aã]o|justificativa|coment[aá]rio)\s*\**\s*[:：]\s*(.+)$/i;

export function adaptMarkdown(text: string, rep: Reporter): unknown {
  const root: any = { planetas: [] };
  let planet: any = null, course: any = null, unit: any = null, lesson: any = null, question: any = null;
  let questionTarget: any = null; // objeto que recebe "perguntas"
  const levelsSeen = new Map<number, Level>();

  const ensurePlanet = () => {
    if (!planet) { planet = { nome: 'Planeta sem nome', cursos: [] }; root.planetas.push(planet); rep.warn('markdown', 'markdown.planet_missing', 'Texto sem título de planeta: criado "Planeta sem nome". Edite antes de gravar.'); }
    return planet;
  };
  const ensureCourse = () => {
    ensurePlanet();
    if (!course) { course = { titulo: planet.nome, unidades: [] }; planet.cursos.push(course); rep.warn('markdown', 'markdown.course_missing', `Conteúdo sem título de curso: criado curso "${planet.nome}".`); }
    return course;
  };
  const ensureUnit = () => {
    ensureCourse();
    if (!unit) { unit = { titulo: course.titulo, aulas: [] }; course.unidades.push(unit); }
    return unit;
  };
  const appendText = (target: any, line: string) => {
    if (!target) return;
    const key = target === lesson ? 'texto' : 'descricao';
    target[key] = target[key] ? `${target[key]}\n${line}` : line;
  };
  const closeQuestion = () => { question = null; };

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim() || /^\s*(---|\*\*\*|```)\s*$/.test(line)) continue;

    // ---------- cabeçalhos (# ...) ou linhas inteiras em negrito (**Curso 1: X**)
    const h = line.match(/^(#{1,6})\s+(.+)$/) ?? line.match(/^()\s*\*\*([^*]{3,120})\*\*\s*:?\s*$/);
    if (h) {
      const depth = h[1] ? h[1].length : 9;
      const title = stripMd(h[2]);
      let level = KW.find(([, re]) => re.test(title))?.[0];
      if (!level && h[1]) level = levelsSeen.get(depth);
      if (!level && h[1]) {
        // sem palavra-chave: decide pela profundidade (1º nível = planeta, 2º = curso...)
        const order: Level[] = ['planet', 'course', 'unit', 'lesson'];
        level = order[Math.min(levelsSeen.size, 3)];
        rep.info('markdown', 'markdown.level_by_depth', `"${title}" sem palavra-chave: tratado como ${level} pela profundidade do título`);
      }
      if (!level) { appendText(lesson ?? unit ?? course ?? planet, title); continue; }
      if (h[1] && !levelsSeen.has(depth)) levelsSeen.set(depth, level);
      closeQuestion();
      if (level === 'planet') {
        planet = { nome: nameAfterKeyword(title), cursos: [] };
        root.planetas.push(planet);
        course = unit = lesson = null;
        questionTarget = null;
      } else if (level === 'course') {
        ensurePlanet();
        course = { titulo: nameAfterKeyword(title), unidades: [] };
        planet.cursos.push(course);
        unit = lesson = null;
        questionTarget = null;
      } else if (level === 'unit') {
        ensureCourse();
        unit = { titulo: nameAfterKeyword(title), aulas: [] };
        course.unidades.push(unit);
        lesson = null;
        questionTarget = null;
      } else if (level === 'exam') {
        ensureCourse();
        course.prova = { titulo: title, perguntas: [] };
        lesson = null;
        questionTarget = course.prova;
      } else {
        ensureUnit();
        const tipo = /v[ií]deo/i.test(title) ? 'video' : /pr[aá]tica|quiz|exerc|revis/i.test(title) ? 'pratica' : 'aula';
        lesson = { titulo: nameAfterKeyword(title), tipo, perguntas: [] };
        unit.aulas.push(lesson);
        questionTarget = lesson;
      }
      continue;
    }

    // ---------- resposta / explicação da questão atual
    const ans = line.match(ANSWER);
    if (ans && question) { question.resposta = stripMd(ans[2]); continue; }
    const ex = line.match(EXPL);
    if (ex && question) { question.explicacao = stripMd(ex[2]); continue; }

    // ---------- alternativas
    const opt = line.match(OPTION);
    if (opt && question) {
      let t = stripMd(opt[3]);
      if (opt[2] && /[xX✓]/.test(opt[2])) t += ' (correta)';
      question.alternativas.push(t);
      continue;
    }

    // ---------- campos "Chave: valor"
    const kv = line.match(KV);
    if (kv) {
      const k = kv[1].toLowerCase();
      const v = stripMd(kv[2]);
      const target = lesson ?? unit ?? course ?? planet ?? ensurePlanet();
      if (/v[ií]deo|url|link/.test(k) && !/t[ií]tulo/.test(k)) {
        const url = v.match(VIMEO)?.[0] ?? v;
        const tgt = lesson ?? (ensureUnit(), (lesson = { titulo: 'Vídeo', tipo: 'video', perguntas: [] }), unit.aulas.push(lesson), (questionTarget = lesson), lesson);
        tgt.video = url;
        if (tgt.tipo === 'aula') tgt.tipo = 'video';
      } else if (/t[ií]tulo do v[ií]deo/.test(k)) (lesson ?? target).tituloVideo = v;
      else if (/categoria|gal[aá]xia/.test(k)) (planet ?? ensurePlanet()).categoria = v;
      else if (/dura/.test(k)) (lesson ?? target).duracao = v;
      else if (/acesso|plano/.test(k)) (lesson ? unit : target).acesso = v;
      else if (/certificado/.test(k)) (course ?? target).certificado = v;
      else if (/cor/.test(k)) (planet ?? target).cor = v;
      else target.descricao = target.descricao ? `${target.descricao}\n${v}` : v;
      continue;
    }

    // ---------- URL do Vimeo solta numa linha
    const url = line.match(VIMEO)?.[0];
    if (url) {
      if (!lesson || lesson.video) { ensureUnit(); lesson = { titulo: stripMd(line.replace(url, '').replace(/[-–:]\s*$/, '')) || 'Vídeo', tipo: 'video', perguntas: [] }; unit.aulas.push(lesson); questionTarget = lesson; }
      lesson.video = url;
      if (lesson.tipo === 'aula') lesson.tipo = 'video';
      continue;
    }

    // ---------- nova questão (termina com "?" ou é "Pergunta 1: ...")
    const q = line.match(QUESTION);
    // é questão se: termina com "?" ou ":", é "Pergunta N:", ou estamos numa prática/prova numerando itens
    const inQuizContext = !!question || questionTarget?.tipo === 'pratica' || (!!course?.prova && questionTarget === course.prova);
    if (q && (/[?:]\s*$/.test(q[2]) || /pergunta|quest/i.test(line) || (inQuizContext && !!q[1]))) {
      const target = questionTarget ?? lesson ?? (ensureUnit(), (lesson = { titulo: 'Prática', tipo: 'pratica', perguntas: [] }), unit.aulas.push(lesson), (questionTarget = lesson), lesson);
      question = { pergunta: stripMd(q[2]), alternativas: [] };
      target.perguntas = target.perguntas ?? [];
      target.perguntas.push(question);
      continue;
    }

    // ---------- texto corrido: conteúdo da aula (ou descrição do nível atual)
    const textLine = clean(stripMd(line.replace(/^\s*[-*]\s+/, '• ')));
    if (!textLine) continue;
    if (question && question.alternativas.length === 0) { question.pergunta += ` ${textLine}`; continue; }
    closeQuestion();
    const target = lesson ?? unit ?? course ?? planet;
    // texto antes do primeiro título (ex.: "Claro! Aqui está o planeta:") é só conversa
    if (!target) continue;
    appendText(target, textLine);
  }

  // limpa listas vazias de perguntas (a aula sem perguntas é aula/vídeo)
  for (const p of root.planetas) for (const c of p.cursos) for (const u of c.unidades ?? []) for (const l of u.aulas) {
    if (!l.perguntas?.length) delete l.perguntas;
  }
  rep.info('markdown', 'markdown.heuristic', 'Conteúdo lido de texto/Markdown por heurística. Revise a prévia; para máxima fidelidade use o prompt de conversão para JSON.');
  return root;
}
