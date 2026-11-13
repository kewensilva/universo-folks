import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAgainstCatalog, checkCourseStructure, matchUnitSteps, trailStructureSchema, ingest, type Catalog, type TrailStructure } from '../src';

const S = (s: Partial<TrailStructure> & Pick<TrailStructure, 'unitSteps'>) => trailStructureSchema.parse(s);
const VIDEO_E_PRATICA = S({ unitSteps: [{ kind: 'VIDEO', min: 1 }, { kind: 'LESSON', min: 0 }, { kind: 'PRACTICE', min: 1 }] });
const VIDEOS_E_PRATICA_NO_FIM = S({ unitSteps: [{ kind: 'VIDEO', min: 1 }], closingSteps: [{ kind: 'PRACTICE', min: 1 }] });
const SO_PRATICA = S({ unitSteps: [{ kind: 'PRACTICE', min: 1 }] });
const unit = (...types: string[]) => ({ lessons: types.map((type) => ({ type })) });

test('unidade: casa vídeos seguidos, aula opcional e práticas', () => {
  assert.equal(matchUnitSteps(['VIDEO', 'VIDEO', 'VIDEO', 'LESSON', 'PRACTICE', 'PRACTICE'], VIDEO_E_PRATICA.unitSteps), null, 'unidade 1 do Feedback segue o modelo');
  assert.equal(matchUnitSteps(['VIDEO', 'PRACTICE'], VIDEO_E_PRATICA.unitSteps), null, 'aula é opcional');
  assert.match(matchUnitSteps(['VIDEO', 'LESSON'], VIDEO_E_PRATICA.unitSteps)!, /falta prática/);
  assert.match(matchUnitSteps(['PRACTICE', 'VIDEO'], VIDEO_E_PRATICA.unitSteps)!, /esperava vídeo, encontrou prática/);
  assert.match(matchUnitSteps(['VIDEO', 'PRACTICE', 'VIDEO'], VIDEO_E_PRATICA.unitSteps)!, /fora do modelo: vídeo/);
  const maxDois = S({ unitSteps: [{ kind: 'VIDEO', min: 1, max: 2 }] }).unitSteps;
  assert.match(matchUnitSteps(['VIDEO', 'VIDEO', 'VIDEO'], maxDois)!, /no máximo 2 vídeo/);
});

test('curso: os três exemplos do cliente (vídeo+prática, prática no fim, só prática)', () => {
  assert.deepEqual(checkCourseStructure({ units: [unit('VIDEO', 'PRACTICE'), unit('VIDEO', 'LESSON', 'PRACTICE')] }, VIDEO_E_PRATICA), []);
  assert.deepEqual(checkCourseStructure({ units: [unit('VIDEO'), unit('VIDEO', 'VIDEO'), unit('PRACTICE')] }, VIDEOS_E_PRATICA_NO_FIM), []);
  assert.deepEqual(checkCourseStructure({ units: [unit('PRACTICE'), unit('PRACTICE', 'PRACTICE')] }, SO_PRATICA), []);
  const fora = checkCourseStructure({ units: [unit('VIDEO', 'PRACTICE'), unit('VIDEO')] }, VIDEOS_E_PRATICA_NO_FIM);
  assert.equal(fora.length, 2, JSON.stringify(fora));
  assert.match(fora[0], /unidade 1/);
  assert.match(fora[1], /unidade final/);
  assert.match(checkCourseStructure({ units: [unit('PRACTICE')] }, S({ unitSteps: [{ kind: 'PRACTICE', min: 1 }], exam: true }))[0], /desafio final/);
  assert.match(checkCourseStructure({ units: [unit('PRACTICE')] }, S({ unitSteps: [{ kind: 'PRACTICE', min: 1 }], minUnits: 2 }))[0], /pelo menos 2/);
});

test('estrutura inválida é recusada', () => {
  assert.equal(trailStructureSchema.safeParse({ unitSteps: [] }).success, false);
  assert.equal(trailStructureSchema.safeParse({ unitSteps: [{ kind: 'VIDEO', min: 3, max: 2 }] }).success, false);
  assert.equal(trailStructureSchema.safeParse({ unitSteps: [{ kind: 'VIDEO' }], minUnits: 5, maxUnits: 2 }).success, false);
});

const bundle = (trailTemplate?: string) => ingest({ content: {
  schemaVersion: 'folks.content/v1',
  planets: [{ key: 'p', slug: 'p', name: 'Planeta', category: 'para-o-trabalho', courses: [{
    key: 'p.c', slug: 'c', title: 'Curso', hasCertificate: false, trailTemplate,
    units: [{ title: 'U1', lessons: [
      { type: 'VIDEO', title: 'V', vimeoUrl: 'https://vimeo.com/1' },
      { type: 'PRACTICE', title: 'P', questions: [
        { type: 'TRUE_FALSE', methodology: 'true_false', prompt: 'a?', options: [{ text: 'Mito', isCorrect: true }, { text: 'Verdade', isCorrect: false }] },
        { type: 'TRUE_FALSE', methodology: 'true_false', prompt: 'b?', options: [{ text: 'Mito', isCorrect: false }, { text: 'Verdade', isCorrect: true }] },
        { type: 'SINGLE_CHOICE', methodology: 'match_pairs', prompt: 'c?', options: [{ text: 'x', isCorrect: true }, { text: 'y', isCorrect: false }] },
        { type: 'SINGLE_CHOICE', methodology: 'voz', prompt: 'd?', options: [{ text: 'x', isCorrect: true }, { text: 'y', isCorrect: false }] },
      ] },
    ] }],
  }] }],
} }).bundle;

const catalog: Catalog = {
  methodologies: [
    { code: 'true_false', name: 'Mito ou verdade', status: 'INACTIVE', answerFormats: ['TRUE_FALSE'] },
    { code: 'match_pairs', name: 'Ligar pares', status: 'ACTIVE', answerFormats: ['MATCH_PAIRS'] },
  ],
  templates: [
    { code: 'video-e-pratica', name: 'Vídeo e prática', isActive: true, structure: { ...VIDEO_E_PRATICA, methodologies: ['match_pairs'] } },
    { code: 'so-pratica', name: 'Só prática', isActive: true, structure: SO_PRATICA },
  ],
};

test('catálogo: metodologia inativa, desconhecida, tipo errado e fora do modelo viram avisos agrupados', () => {
  const issues = checkAgainstCatalog(bundle('video-e-pratica'), catalog);
  const by = (code: string) => issues.filter((i) => i.code === code);
  assert.ok(issues.every((i) => i.severity === 'warning'), 'nunca bloqueia');
  assert.equal(by('methodology.inactive').length, 1, 'duas questões, um aviso só');
  assert.match(by('methodology.inactive')[0].message, /\(2 questões\)/);
  assert.equal(by('methodology.unknown').length, 1);
  assert.equal(by('methodology.type_mismatch').length, 1);
  assert.equal(by('trail_template.methodology').length, 1, 'o modelo só permite ligar pares: avisa mito ou verdade');
  assert.match(by('trail_template.methodology')[0].message, /Mito ou verdade.*\(2 questões\)/);
  assert.equal(by('trail_template.mismatch').length, 0, 'vídeo + prática segue o modelo');
});

test('catálogo: curso que foge do modelo e modelo inexistente', () => {
  assert.equal(checkAgainstCatalog(bundle('so-pratica'), catalog).filter((i) => i.code === 'trail_template.mismatch').length, 1);
  assert.equal(checkAgainstCatalog(bundle('nao-existe'), catalog).filter((i) => i.code === 'trail_template.unknown').length, 1);
  assert.equal(checkAgainstCatalog(bundle(), { methodologies: [], templates: [] }).length, 0, 'sem catálogo, sem avisos');
});
