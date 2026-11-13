import { bundleSchema, KNOWN_GENERATORS, KNOWN_METHODOLOGIES, KNOWN_WIDGETS } from './schema';
import type { Bundle, Question } from './schema';
import { Reporter } from './report';

const zPath = (path: PropertyKey[]) =>
  path.map((s, i) => (typeof s === 'number' ? `[${s}]` : `${i ? '.' : ''}${String(s)}`)).join('');

const sameMultiset = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000');

/**
 * Gerador da prática infinita: o app precisa ter o código da metodologia. A metodologia das QUESTÕES
 * é conferida contra o catálogo do MASTER (checkAgainstCatalog, ADR 0013): a questão é desenhada pelo tipo.
 */
function checkGeneratorMethodology(m: string | undefined, path: string, rep: Reporter) {
  if (m && !KNOWN_METHODOLOGIES.includes(m)) rep.warn(path, 'generator.methodology_unknown', `Gerador da metodologia "${m}" ainda não existe no app (exige desenvolvimento)`);
}

function checkQuestion(q: Question, path: string, rep: Reporter) {
  switch (q.type) {
    case 'NUMBER':
      return;
    case 'ORDER':
      if (!sameMultiset(q.pieces, q.answer)) rep.error(path, 'question.order_mismatch', 'Ordenar: "answer" precisa ter exatamente as mesmas peças de "pieces"');
      return;
    case 'BUILD_SENTENCE': {
      const pool = [...q.pieces];
      for (const w of q.answer) {
        const i = pool.indexOf(w);
        if (i < 0) return rep.error(path, 'question.sentence_piece', `Montar frase: a palavra "${w}" da resposta não está nas peças`);
        pool.splice(i, 1);
      }
      return;
    }
    case 'MATCH_PAIRS': {
      const lefts = q.pairs.map((p) => p.left.trim().toLowerCase());
      if (new Set(lefts).size !== lefts.length) rep.error(path, 'question.pairs_duplicate', 'Ligar pares: itens repetidos do lado esquerdo');
      return;
    }
    case 'CLASSIFY':
      if (q.items.some((i) => i.group >= q.groups.length)) rep.error(path, 'question.classify_group', 'Classificar: item aponta para um grupo que não existe');
      return;
    case 'SIMULATOR': {
      if (q.simulator.id === 'mic_pitch') {
        // tocar ou cantar a nota no microfone: precisa de nota(s) válida(s)
        const raw = q.simulator.targets ?? q.simulator.target;
        const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
        const okNote = (n: unknown) => (typeof n === 'number' && Number.isInteger(n) && n >= 28 && n <= 96) || (typeof n === 'string' && /^[A-Ga-g][#b♯♭]?-?\d$/.test(n.trim()));
        if (!list.length || list.length > 12 || !list.every(okNote)) rep.error(path, 'simulator.mic_pitch_target', 'Microfone (mic_pitch): informe "target" ou "targets" com notas válidas (ex.: "E2" ou 40), até 12');
        if (q.simulator.instrument !== undefined && q.simulator.instrument !== 'violao' && q.simulator.instrument !== 'voz') rep.warn(path, 'simulator.mic_pitch_instrument', 'Microfone (mic_pitch): instrument deve ser "violao" ou "voz"');
        return;
      }
      rep.warn(path, 'simulator.rule_pending', `Simulador "${q.simulator.id}": a regra de acerto roda no app; o servidor aceita o resultado informado`);
      return;
    }
  }
  const n = q.options.filter((o) => o.isCorrect).length;
  if (n === 0) rep.error(path, 'question.no_correct', `Sem alternativa correta: "${q.prompt.slice(0, 80)}"`);
  if (q.type === 'SINGLE_CHOICE' && n > 1) rep.error(path, 'question.multiple_correct', 'Escolha única com mais de uma correta');
  if (q.type === 'TRUE_FALSE' && q.options.length !== 2) rep.error(path, 'question.tf_options', 'Verdadeiro/Falso precisa de 2 alternativas');
  if (q.options.some((o) => !o.text.trim())) rep.error(path, 'question.empty_option', 'Alternativa vazia');
  const texts = q.options.map((o) => o.text.trim().toLowerCase());
  if (new Set(texts).size !== texts.length) rep.warn(path, 'question.duplicate_options', 'Alternativas repetidas');
}

/** Validação estrutural (schema) + regras de negócio. */
export function validateBundle(b: Bundle, rep: Reporter): Bundle | null {
  const parsed = bundleSchema.safeParse(b);
  if (!parsed.success) {
    for (const i of parsed.error.issues) rep.error(zPath(i.path), 'schema', i.message);
  }
  const planetSlugs = new Map<string, number>();
  const courseKeys = new Map<string, string>();
  b.planets.forEach((p, pi) => {
    const pp = `planets[${pi}]`;
    if (planetSlugs.has(p.slug)) rep.error(pp, 'planet.duplicate', `Planeta "${p.name}" repetido no conteúdo (mesmo slug de planets[${planetSlugs.get(p.slug)}])`);
    planetSlugs.set(p.slug, pi);
    p.courses.forEach((c, ci) => {
      const cp = `${pp}.courses[${ci}]`;
      if (courseKeys.has(c.key)) rep.error(cp, 'course.duplicate', `Curso "${c.title}" repetido (mesma chave de ${courseKeys.get(c.key)})`);
      courseKeys.set(c.key, cp);
      if (c.units.length === 0 && c.status !== 'COMING_SOON') rep.error(cp, 'course.no_units', `Curso "${c.title}" sem unidades`);
      c.units.forEach((u, ui) =>
        u.lessons.forEach((l, li) => {
          const lp = `${cp}.units[${ui}].lessons[${li}]`;
          if (l.type === 'PRACTICE') {
            l.questions.forEach((q, qi) => checkQuestion(q, `${lp}.questions[${qi}]`, rep));
            l.generators?.forEach((g, gi) => checkGeneratorMethodology(g.methodology, `${lp}.generators[${gi}]`, rep));
            if (l.questionsPerRound && l.questionsPerRound > l.questions.length && !l.generators?.length) rep.warn(lp, 'practice.round_too_big', `Rodada de ${l.questionsPerRound} questões, mas o banco só tem ${l.questions.length}`);
          }
          if (l.type === 'LESSON') {
            l.slides.forEach((sl, si) => {
              const sp = `${lp}.slides[${si}]`;
              if (sl.widget && !KNOWN_WIDGETS.includes(sl.widget.type)) rep.warn(`${sp}.widget`, 'widget.unknown', `Widget "${sl.widget.type}" ainda não existe no app (exige desenvolvimento)`);
              if (sl.check) checkQuestion(sl.check, `${sp}.check`, rep);
            });
          }
          if (l.type === 'GENERATED_PRACTICE') {
            const unknown = l.generators.filter((g) => !KNOWN_GENERATORS.includes(g));
            if (unknown.length) rep.warn(lp, 'generator.unknown', `Geradores não existem no app: ${unknown.join(', ')} (exige desenvolvimento no app)`);
          }
        }),
      );
      if (c.exam) {
        if (c.exam.questionSource === 'BANK') {
          if (!c.exam.questions?.length) rep.error(`${cp}.exam`, 'exam.no_questions', 'Certificação sem questões');
          c.exam.questions?.forEach((q, qi) => checkQuestion(q, `${cp}.exam.questions[${qi}]`, rep));
        } else if (!c.exam.generators?.length) rep.error(`${cp}.exam`, 'exam.no_generators', 'Desafio final gerado sem geradores');
      }
      if (c.hasCertificate && !c.exam && c.units.length) rep.warn(cp, 'course.certificate_without_exam', `Curso "${c.title}" tem certificado mas não tem certificação (prova final)`);
      if (p.category === 'para-o-trabalho' && c.exam?.questionSource === 'GENERATED') rep.warn(`${cp}.exam`, 'exam.generated_b2b', 'Certificação B2B deveria usar questões do banco (ADR 0005)');
    });
  });
  return parsed.success && !rep.errors.length ? parsed.data : null;
}
