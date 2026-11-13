import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types';
import { ContentService } from '../content/content.service';
import { VimeoService } from '../vimeo/vimeo.service';
import { ContentImportService } from '../content-import/content-import.service';
import { PracticeCatalogService } from '../practice-catalog/practice-catalog.service';
import { VideoBoardService, videoBoardSave } from '../content/video-board.service';
import { CONVERSION_PROMPT } from '@folks/content-ingest';
import {
  contentStatus, courseSpec, courseUpdate, examUpsert, lessonCreate, planetTreeSpec, planetUpdate, questionSchema, unitCreate,
} from '../content/content.schemas';

const INSTRUCTIONS = `
Você está conectado à plataforma UNIVERSO FOLKS como MASTER-FOLKS.
Hierarquia: Categoria (para-a-vida | para-o-trabalho | para-a-escola) > Planeta (tema) > Curso > Unidade > Etapas > Desafio final.
Tipos de etapa (lessons) na árvore:
 - LESSON: aula em telas { content: { slides: [{ heading, text, visualHtml?, audioDemos? }], generators? } } (lições de 3 a 5 minutos)
 - VIDEO: vídeo do Vimeo (vimeoUrl), com "practice" opcional de questões sobre o vídeo
 - PRACTICE: questões escritas (corrigidas no servidor)
 - GENERATED_PRACTICE: exercícios gerados no app pelos geradores existentes (ex.: "t1", "p2b", "pitch") - use só ids que já existem
 - INTERACTIVE: pacote SCORM/xAPI/cmi5 já enviado
Regras de negócio:
 - Cursos "Para a vida" com plano grátis: unidades 1 e 2 com accessTier FREE e as demais PREMIUM; o curso fica accessTier FREE.
 - Cursos "Para o trabalho" (biblioteca B2B): accessTier PREMIUM no curso, hasCertificate true e "exam" com questões escritas.
 - Cursos sem certificado podem ter "badge" (insígnia) { icon, name, text } entregue ao concluir.
 - A nota mínima da certificação vem da configuração da empresa (padrão 80%); só use passingScore no exam se o usuário pedir.

Catálogo do MASTER (menus Metodologia e Personalização de trilha):
 - list_trail_templates: modelos de estrutura da trilha. Pergunte ao usuário qual modelo seguir (ou use o que ele citar), monte as unidades exatamente nessa estrutura e informe o code em "trailTemplate" de cada curso.
 - list_methodologies: só as metodologias ATIVAS. Use o code no campo "methodology" de cada questão, com um dos tipos de questão aceitos e seguindo a orientação. Não use metodologia que não esteja na lista.
 - Se a resposta trouxer avisos do catálogo (catalogWarnings ou warnings com código trail_template.* / methodology.*), mostre ao usuário e proponha a correção.

Fluxo recomendado ao receber "crie o planeta X com estes vídeos":
1. list_categories para obter o categorySlug correto; list_trail_templates e list_methodologies para saber como montar.
2. Se o usuário citar uma pasta do Vimeo (link vimeo.com/user/.../folder/<id>), use vimeo_folder_tree com o <id>:
   - pasta COM SUBPASTAS: a pasta é o PLANETA, cada subpasta é um CURSO (módulo) e cada vídeo vira uma UNIDADE, na ordem
     do número no nome ("Vídeo 1", "Vídeo 2"...); a ordem das subpastas segue o número delas ("Módulo 1"...);
   - pasta só com vídeos: um curso com os vídeos em ordem (ou pergunte como dividir).
   - Os nomes dos vídeos costumam ser genéricos: use get_vimeo_transcript (legendas do Vimeo) para saber o que cada vídeo
     ensina, dar títulos às unidades e escrever as práticas e o desafio final SÓ com o que o vídeo diz.
   - Informe no planeta vimeoFolderUri = "/projects/<id>" (é a referência para o quadro de vídeos).
   - Monte o JSON folks.content/v1 (content_import_format) e siga o fluxo de importação abaixo (prévia → OK → gravar).
3. Monte a árvore completa seguindo o modelo de trilha escolhido e chame create_planet_tree UMA vez (é transacional: ou cria tudo ou nada).
   - Cada vídeo deve ter "practice" com 3 a 5 questões baseadas no conteúdo do vídeo (peça o roteiro/transcrição
     ao usuário se não tiver informação suficiente para escrever boas questões).
   - Cada curso com certificado deve ter "exam" com questões que cubram todo o conteúdo do curso.
4. Crie sempre com status DRAFT e mostre o resumo ao usuário; só use publish_content após confirmação.
5. Para ajustes pontuais use as tools granulares (add_unit, add_lesson, add_question, set_course_exam, update_*).
6. Depois de criar um planeta com vídeos, rode review_planet_videos e mostre os equívocos (vídeo faltando, repetido,
   de outro módulo, fora de ordem, não usado). Corrija com organize_planet_videos só com o OK do usuário.
   O MASTER também corrige pelo painel: Conteúdo > planeta > Organizar vídeos.

Cursos de SOM (violão, canto, música, pronúncia) — em vez de vídeo, a etapa é só som:
 - Use o modelo de trilha "som-e-pratica" (aula de som + prática em cada unidade), salvo se o usuário pedir outro.
 - Aula de som = LESSON com "audioDemos" nas telas: [{label, caption, sequence}] (notas sintetizadas no aparelho) ou [{label, url}] (arquivo mp3/m4a).
   Sequência: ["n", nota] corda de violão; ["c", tônica, ""|"m"|"dim"] acorde; ["p", tônica, [graus 0..6]] progressão (0=I, 3=IV, 4=V, 5=vi);
   ["t", nota, segundos] tom puro; ["r", segundos] pausa. Nota = MIDI (60 = Dó central, 40 = Mi grave do violão) ou nome ("E2", "C#4").
 - Prática de ouvido com questões escritas: methodology "listen_choose" e "audio": {kind:"NOTES", sequence} (ou {kind:"URL", url}).
 - Prática gerada no aparelho (exercícios infinitos e variados): GENERATED_PRACTICE com generators "pitch" (grave/agudo),
   "pitch_tone" (grave/agudo com tom puro), "pitch2", "qual" (maior/menor), "qual2", "deg", "deg2", "prog", "prog2", "mix", "ear".
 - Prática no MICROFONE: SIMULATOR {simulator: {id:"mic_pitch", target:"A2" | targets:["E2","A2"], instrument:"violao"|"voz"}}, methodology
   "play_or_sing_note"; ou GENERATED_PRACTICE com "tune" (afinar corda do violão), "sing" (cantar a nota), "sing_steps" (Dó-Ré-Mi), "voice", "guitar".
   Voz aceita qualquer oitava; violão confere a oitava exata. O app pede permissão do microfone e mostra grave/agudo/afinado.
 - Fotografia com câmera ainda não existe no app: não crie prática de foto.

Conteúdo JÁ CRIADO nesta conversa (ou colado pelo usuário) — use a importação, não recrie à mão:
1. Gere o JSON folks.content/v1 (veja content_import_format) com TODO o conteúdo, sem inventar nada.
2. preview_content_import com esse JSON: mostre ao usuário o resumo, os erros e os avisos (ex.: vídeos sem URL).
3. Corrija os erros com fix_content_import (reenvie o JSON corrigido) até não haver erros.
4. Só com o OK explícito do usuário chame apply_content_import. Planeta e curso NOVOS nascem DRAFT (a menos que ele peça para publicar); curso que SUBSTITUI um existente (action REPLACE na prévia) mantém a situação atual: se já estava publicado, a troca vai ao ar na hora. Avise o usuário disso antes de gravar.
`.trim();

type Handler<T> = (args: T) => Promise<unknown>;

/** Constrói um servidor MCP com as tools de gestão de conteúdo, autenticado como `user`. */
@Injectable()
export class McpServerFactory {
  constructor(
    private readonly prisma: PrismaService,
    private readonly content: ContentService,
    private readonly vimeo: VimeoService,
    private readonly imports: ContentImportService,
    private readonly catalog: PracticeCatalogService,
    private readonly videoBoard: VideoBoardService,
  ) {}

  create(user: AuthUser): McpServer {
    const server = new McpServer({ name: 'universo-folks', version: '0.1.0' }, { instructions: INSTRUCTIONS });

    const tool = <S extends z.ZodObject<any>>(name: string, description: string, schema: S, handler: Handler<z.infer<S>>) => {
      server.registerTool(name, { description, inputSchema: schema }, (async (args: z.infer<S>) => {
        try {
          const result = await handler(args);
          return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
        } catch (e: any) {
          const msg = e?.response?.message ?? e?.message ?? String(e);
          return { isError: true, content: [{ type: 'text' as const, text: `Erro: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}` }] };
        }
      }) as any);
    };

    // ------------------------------------------------------------ leitura
    tool('list_categories', 'Lista as categorias de estudo (Para a vida, Para o trabalho, Para a escola...).', z.object({}), async () =>
      (await this.content.listCategories()).map((c) => ({ id: c.id, slug: c.slug, name: c.name, planets: c._count.planets })),
    );

    tool('list_planets', 'Lista planetas existentes (temas) com status e quantidade de cursos.', z.object({ search: z.string().optional() }), async ({ search }) =>
      (await this.content.listPlanets({ search })).map((p) => ({ id: p.id, slug: p.slug, name: p.name, category: p.category.slug, status: p.status, accessTier: p.accessTier, courses: p._count.courses })),
    );

    tool('get_planet_tree', 'Retorna a árvore completa de um planeta (cursos, unidades, lições, questões e prova).', z.object({ idOrSlug: z.string() }), ({ idOrSlug }) =>
      this.content.planetTree(idOrSlug),
    );

    // ------------------------------------------------------------ criação
    tool(
      'create_planet_tree',
      'Cria um planeta COMPLETO (cursos > unidades > vídeos do Vimeo + práticas > certificação) numa única transação. Use status DRAFT. Informe em cada curso o "trailTemplate" (código de list_trail_templates) e use só metodologias de list_methodologies; a resposta traz "catalogWarnings" se algo fugir do catálogo.',
      z.object({ planet: planetTreeSpec }),
      async ({ planet }) => {
        const r = (await this.content.buildPlanet(user, planet)) as { id?: string } & Record<string, unknown>;
        return r?.id ? { ...r, catalogWarnings: await this.catalog.reviewPlanet(r.id) } : r;
      },
    );

    tool(
      'add_course_tree',
      'Adiciona um curso completo (unidades, vídeos, práticas e certificação) a um planeta existente. Informe o "trailTemplate" (código de list_trail_templates).',
      z.object({ planetId: z.string().uuid(), course: courseSpec }),
      async ({ planetId, course }) => {
        const r = await this.content.buildCourse(user, planetId, course);
        return { ...(r as object), catalogWarnings: await this.catalog.reviewPlanet(planetId) };
      },
    );

    // ------------------------------------------------- catálogo do MASTER (só leitura)
    tool(
      'list_methodologies',
      'Metodologias de prática ATIVAS que podem ser usadas nas questões (campo "methodology" = code), com os tipos de questão aceitos e a orientação de como escrever. Metodologias inativas ou em breve não aparecem e não devem ser usadas.',
      z.object({}),
      async () => (await this.catalog.forClaude()).methodologies,
    );
    tool(
      'list_trail_templates',
      'Modelos de trilha ATIVOS definidos pelo MASTER: como cada unidade deve ser montada (unitSteps em ordem; min 0 = opcional), unidade final (closingSteps), quantidade de unidades, desafio final e metodologias permitidas. Pergunte ao usuário qual modelo usar e siga a estrutura; informe o code em "trailTemplate" no curso.',
      z.object({}),
      async () => (await this.catalog.forClaude()).templates,
    );

    tool('add_unit', 'Adiciona uma unidade a um curso.', unitCreate, (dto) => this.content.createUnit(user, dto));

    tool(
      'add_lesson',
      'Adiciona uma lição (VIDEO com vimeoUrl, PRACTICE com questions e relatedLessonId, ou INTERACTIVE com interactivePackageId) a uma unidade.',
      lessonCreate,
      (dto) => this.content.createLesson(user, dto),
    );

    tool(
      'add_question',
      'Adiciona uma questão a uma prática (lessonId) ou à certificação (examId).',
      z.object({ lessonId: z.string().uuid().optional(), examId: z.string().uuid().optional(), question: questionSchema }),
      ({ lessonId, examId, question }) => this.content.addQuestion(user, { lessonId, examId }, question),
    );

    tool(
      'set_course_exam',
      'Cria/atualiza a certificação (prova final) do curso. Se "questions" for enviado, substitui o banco de questões.',
      z.object({ courseId: z.string().uuid(), exam: examUpsert }),
      ({ courseId, exam }) => this.content.upsertExam(user, courseId, exam),
    );

    // ------------------------------------------------------------ edição
    tool('update_planet', 'Atualiza dados de um planeta.', z.object({ id: z.string().uuid(), data: planetUpdate }), ({ id, data }) => this.content.updatePlanet(user, id, data));
    tool('update_course', 'Atualiza dados de um curso.', z.object({ id: z.string().uuid(), data: courseUpdate }), ({ id, data }) => this.content.updateCourse(user, id, data));

    tool(
      'publish_content',
      'Altera o status de um planeta ou curso (DRAFT, COMING_SOON, PUBLISHED, ARCHIVED). Confirme com o usuário antes de publicar.',
      z.object({ entity: z.enum(['planet', 'course']), id: z.string().uuid(), status: contentStatus, cascadeCourses: z.boolean().default(false) }),
      async ({ entity, id, status, cascadeCourses }) => {
        if (entity === 'course') return this.content.updateCourse(user, id, { status });
        const p = await this.content.updatePlanet(user, id, { status });
        if (cascadeCourses) await this.prisma.course.updateMany({ where: { planetId: id, status: { not: 'ARCHIVED' } }, data: { status } });
        return p;
      },
    );

    // ------------------------------------------------------------ Vimeo
    tool('list_vimeo_folders', 'Lista as pastas (projects) da conta Vimeo.', z.object({}), () => this.vimeo.listFolders());
    tool('list_vimeo_folder_videos', 'Lista todos os vídeos de uma pasta do Vimeo (id, nome, duração, link, privacidade).', z.object({ folderId: z.string() }), ({ folderId }) =>
      this.vimeo.listFolder(folderId),
    );
    tool(
      'vimeo_folder_tree',
      'Lista uma pasta do Vimeo com as SUBPASTAS e os vídeos de cada uma (planeta → cursos/módulos → vídeos). Use o id do link .../folder/<id>.',
      z.object({ folderId: z.string() }),
      ({ folderId }) => this.vimeo.folderTree(folderId),
    );
    tool(
      'get_vimeo_transcript',
      'Transcrição de um vídeo (legendas do Vimeo, inclusive as automáticas). Use para dar título às unidades e escrever práticas fiéis ao vídeo. Pode ter erros de reconhecimento em termos técnicos.',
      z.object({ videoId: z.string() }),
      ({ videoId }) => this.vimeo.transcript(videoId),
    );
    tool(
      'review_planet_videos',
      'Quadro de vídeos de um planeta: cada curso/unidade/etapa com o vídeo ligado, comparado com a pasta do Vimeo (vimeoFolderUri), e os equívocos (MISSING, DUPLICATE, UNUSED, WRONG_MODULE, ORDER, NOT_IN_FOLDER).',
      z.object({ idOrSlug: z.string() }),
      ({ idOrSlug }) => this.videoBoard.board(idOrSlug),
    );
    tool(
      'organize_planet_videos',
      'Corrige os vídeos de um planeta numa transação: assignments (vídeo de cada etapa de vídeo), titles, unitOrder (todas as unidades do curso) e lessonOrder (todas as etapas da unidade). Só com o OK do usuário.',
      videoBoardSave.extend({ idOrSlug: z.string() }),
      ({ idOrSlug, ...dto }) => this.videoBoard.save(user, idOrSlug, dto),
    );
    tool('vimeo_status', 'Mostra se a conta do Vimeo está conectada e os escopos do token.', z.object({}), () => this.vimeo.status());
    tool(
      'link_course_videos_from_folder',
      'Liga os vídeos de uma pasta do Vimeo às lições de vídeo de um curso, pelo título. Rode primeiro com dryRun=true e mostre o resultado ao usuário.',
      z.object({ courseId: z.string().uuid(), folderId: z.string(), dryRun: z.boolean().default(true), overwrite: z.boolean().default(false), restrictEmbed: z.boolean().default(false) }),
      ({ courseId, folderId, ...opts }) => this.content.linkCourseVideosFromFolder(user, courseId, folderId, opts),
    );
    tool('set_lesson_video', 'Define/troca o vídeo do Vimeo de uma lição de vídeo (busca duração e miniatura).', z.object({ lessonId: z.string().uuid(), vimeoUrl: z.string() }), ({ lessonId, vimeoUrl }) =>
      this.content.updateLesson(user, lessonId, { vimeoUrl }),
    );
    tool('sync_vimeo_metadata', 'Atualiza duração, miniatura e hash das lições de vídeo (todas ou de um curso).', z.object({ courseId: z.string().uuid().optional() }), ({ courseId }) =>
      this.content.syncVimeoMetadata(user, courseId),
    );
    tool('get_vimeo_video', 'Consulta um vídeo do Vimeo pela URL ou id.', z.object({ urlOrId: z.string() }), ({ urlOrId }) => this.vimeo.getVideo(urlOrId));

    // ------------------------------------------------------------ importação de conteúdo já criado
    tool('content_import_format', 'Formato canônico folks.content/v1 e regras para importar conteúdo já criado (planetas, cursos, trilhas).', z.object({}), async () => ({ prompt: CONVERSION_PROMPT }));
    tool(
      'preview_content_import',
      'Envia conteúdo já criado (JSON folks.content/v1, JSON livre ou Markdown) e devolve a PRÉVIA: o que será criado/atualizado, erros e avisos. NÃO grava nada.',
      z.object({ content: z.union([z.string(), z.record(z.string(), z.unknown())]), label: z.string().optional(), strategy: z.enum(['upsert', 'create_only']).default('upsert') }),
      async ({ content, label, strategy }) => {
        const r = await this.imports.create(user, { content, label, strategy }, 'mcp');
        return { importId: r.id, status: r.status, stats: r.stats, errors: r.issues.filter((i: any) => i.severity === 'error'), warnings: r.issues.filter((i: any) => i.severity === 'warning'), plan: r.plan, duplicateOf: r.duplicateOf };
      },
    );
    tool(
      'fix_content_import',
      'Reenvia o JSON folks.content/v1 CORRIGIDO de uma importação (revalida e refaz a prévia).',
      z.object({ importId: z.string().uuid(), bundle: z.record(z.string(), z.unknown()) }),
      async ({ importId, bundle }) => {
        const r = await this.imports.updateNormalized(user, importId, bundle);
        return { importId, status: r.status, errors: r.issues.filter((i: any) => i.severity === 'error'), warnings: r.issues.filter((i: any) => i.severity === 'warning'), plan: r.plan };
      },
    );
    tool(
      'apply_content_import',
      'GRAVA no banco uma importação já revisada. Só chame após o OK explícito do usuário. Conteúdo novo nasce DRAFT, salvo publish=true; curso substituído (REPLACE) mantém a situação que tinha (publicado continua publicado).',
      z.object({ importId: z.string().uuid(), publish: z.boolean().default(false), onlyValid: z.boolean().default(false), planets: z.array(z.string()).optional() }),
      async ({ importId, ...opts }) => {
        const r = await this.imports.apply(user, importId, opts);
        return { importId, status: r.status, result: (r.result as any)?.summary, planets: (r.result as any)?.planets };
      },
    );

    // ------------------------------------------------------------ outros
    tool('list_interactive_packages', 'Lista pacotes interativos (SCORM/xAPI/cmi5) já enviados, para usar em lições INTERACTIVE.', z.object({}), () =>
      this.prisma.interactivePackage.findMany({ select: { id: true, title: true, standard: true, createdAt: true } }),
    );


    return server;
  }
}
