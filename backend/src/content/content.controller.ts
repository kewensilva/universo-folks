import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { ZodPipe } from '../common/zod.pipe';
import { VimeoService } from '../vimeo/vimeo.service';
import { ContentService } from './content.service';
import { CatalogImportService, ProtoCatalog } from './catalog-import.service';
import { VideoBoardService, videoBoardSave } from './video-board.service';
import {
  categoryCreate, categoryUpdate, courseCreate, courseSpec, courseUpdate, examUpsert, lessonCreate, lessonUpdate,
  planetCreate, planetTreeSpec, planetUpdate, questionCreate, questionSchema, reorderSchema, unitCreate, unitUpdate,
} from './content.schemas';

type Infer<T extends z.ZodType> = z.infer<T>;

const linkFolderSchema = z.object({
  folderId: z.string().min(1),
  dryRun: z.boolean().default(true),
  overwrite: z.boolean().default(false),
  restrictEmbed: z.boolean().default(false),
});

/** Gestão de conteúdo (planetas, cursos, trilhas, práticas, certificações) - MASTER-FOLKS. */
@ApiTags('master / conteúdo')
@ApiBearerAuth()
@Roles('MASTER_FOLKS')
@Controller('master/content')
export class ContentController {
  constructor(
    private readonly s: ContentService,
    private readonly vimeo: VimeoService,
    private readonly catalogImport: CatalogImportService,
    private readonly videoBoard: VideoBoardService,
  ) {}

  /** Importa um catálogo no formato do protótipo (content/catalog.json). ?force=true regrava trilhas sem progresso. */
  @Post('import/catalog') importCatalog(@Body() body: ProtoCatalog, @Query('force') force?: string) {
    return this.catalogImport.import(body, { force: force === 'true' });
  }

  // categorias de estudo
  @Get('categories') categories() {
    return this.s.listCategories();
  }
  @Post('categories') createCategory(@CurrentUser() u: AuthUser, @Body(new ZodPipe(categoryCreate)) dto: Infer<typeof categoryCreate>) {
    return this.s.createCategory(u, dto);
  }
  @Patch('categories/:id') updateCategory(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(categoryUpdate)) dto: Infer<typeof categoryUpdate>) {
    return this.s.updateCategory(u, id, dto);
  }
  @Delete('categories/:id') deleteCategory(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.s.deleteCategory(u, id);
  }

  // planetas
  @Get('planets') planets(@Query() q: { categoryId?: string; status?: string; search?: string }) {
    return this.s.listPlanets(q);
  }
  @Get('planets/:idOrSlug/tree') tree(@Param('idOrSlug') id: string) {
    return this.s.planetTree(id);
  }
  @Post('planets') createPlanet(@CurrentUser() u: AuthUser, @Body(new ZodPipe(planetCreate)) dto: Infer<typeof planetCreate>) {
    return this.s.createPlanet(u, dto);
  }
  @Patch('planets/:id') updatePlanet(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(planetUpdate)) dto: Infer<typeof planetUpdate>) {
    return this.s.updatePlanet(u, id, dto);
  }
  @Delete('planets/:id') deletePlanet(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.s.deletePlanet(u, id);
  }

  /** Importa a árvore completa de um planeta (mesmo formato usado pelo Claude). */
  @Post('import/planet') importPlanet(@CurrentUser() u: AuthUser, @Body(new ZodPipe(planetTreeSpec)) dto: Infer<typeof planetTreeSpec>) {
    return this.s.buildPlanet(u, dto);
  }
  @Post('planets/:id/import/course') importCourse(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(courseSpec)) dto: Infer<typeof courseSpec>) {
    return this.s.buildCourse(u, id, dto);
  }

  // cursos
  @Post('courses') createCourse(@CurrentUser() u: AuthUser, @Body(new ZodPipe(courseCreate)) dto: Infer<typeof courseCreate>) {
    return this.s.createCourse(u, dto);
  }
  @Patch('courses/:id') updateCourse(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(courseUpdate)) dto: Infer<typeof courseUpdate>) {
    return this.s.updateCourse(u, id, dto);
  }
  @Delete('courses/:id') deleteCourse(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.s.deleteCourse(u, id);
  }
  /** Certificação (prova final) do curso. */
  @Put('courses/:id/exam') upsertExam(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(examUpsert)) dto: Infer<typeof examUpsert>) {
    return this.s.upsertExam(u, id, dto);
  }

  // unidades
  @Post('units') createUnit(@CurrentUser() u: AuthUser, @Body(new ZodPipe(unitCreate)) dto: Infer<typeof unitCreate>) {
    return this.s.createUnit(u, dto);
  }
  @Patch('units/:id') updateUnit(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(unitUpdate)) dto: Infer<typeof unitUpdate>) {
    return this.s.updateUnit(u, id, dto);
  }
  @Delete('units/:id') deleteUnit(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.s.deleteUnit(u, id);
  }

  // lições (vídeo / prática / interativo)
  @Post('lessons') createLesson(@CurrentUser() u: AuthUser, @Body(new ZodPipe(lessonCreate)) dto: Infer<typeof lessonCreate>) {
    return this.s.createLesson(u, dto);
  }
  @Patch('lessons/:id') updateLesson(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(lessonUpdate)) dto: Infer<typeof lessonUpdate>) {
    return this.s.updateLesson(u, id, dto);
  }
  @Delete('lessons/:id') deleteLesson(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.s.deleteLesson(u, id);
  }

  // questões
  @Post('questions') addQuestion(@CurrentUser() u: AuthUser, @Body(new ZodPipe(questionCreate)) dto: Infer<typeof questionCreate>) {
    return this.s.addQuestion(u, { lessonId: dto.lessonId, examId: dto.examId }, dto.question);
  }
  @Put('questions/:id') updateQuestion(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(questionSchema)) dto: Infer<typeof questionSchema>) {
    return this.s.updateQuestion(u, id, dto);
  }
  @Delete('questions/:id') deleteQuestion(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.s.deleteQuestion(u, id);
  }

  @Put('reorder') reorder(@CurrentUser() u: AuthUser, @Body(new ZodPipe(reorderSchema)) dto: Infer<typeof reorderSchema>) {
    return this.s.reorder(u, dto);
  }

  // Vimeo
  /** Diagnóstico: conta conectada, plano e escopos do token. */
  @Get('vimeo/status') vimeoStatus() {
    return this.vimeo.status();
  }
  @Get('vimeo/folders') vimeoFolders() {
    return this.vimeo.listFolders();
  }
  @Get('vimeo/folders/:id/videos') vimeoFolder(@Param('id') id: string) {
    return this.vimeo.listFolder(id);
  }
  /** Quadro de vídeos do planeta: onde cada vídeo está, comparado com a pasta do Vimeo, e os equívocos. */
  @Get('planets/:idOrSlug/video-board') videoBoardGet(@Param('idOrSlug') id: string) {
    return this.videoBoard.board(id);
  }
  /** Correções do MASTER no quadro: trocar/permutar vídeos, reordenar unidades e etapas, títulos (uma transação). */
  @Put('planets/:idOrSlug/video-board') videoBoardSave(@CurrentUser() u: AuthUser, @Param('idOrSlug') id: string, @Body(new ZodPipe(videoBoardSave)) dto: Infer<typeof videoBoardSave>) {
    return this.videoBoard.save(u, id, dto);
  }

  /** Pasta com subpastas e vídeos (planeta → cursos/módulos → vídeos). */
  @Get('vimeo/folders/:id/tree') vimeoFolderTree(@Param('id') id: string) {
    return this.vimeo.folderTree(id);
  }
  /** Transcrição (legendas do Vimeo) para escrever a prática do vídeo. */
  @Get('vimeo/videos/:id/transcript') vimeoTranscript(@Param('id') id: string) {
    return this.vimeo.transcript(id);
  }
  @Get('vimeo/videos/:id') vimeoVideo(@Param('id') id: string) {
    return this.vimeo.getVideo(id);
  }
  /** Liga os vídeos de uma pasta às lições de vídeo do curso pelo título (dryRun=true para pré-visualizar). */
  @Post('courses/:id/vimeo/link-folder') linkFolder(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(linkFolderSchema)) dto: Infer<typeof linkFolderSchema>) {
    return this.s.linkCourseVideosFromFolder(u, id, dto.folderId, dto);
  }
  /** Atualiza duração/miniatura/hash das lições de vídeo (todas ou de um curso). */
  @Post('vimeo/sync') syncVimeo(@CurrentUser() u: AuthUser, @Query('courseId') courseId?: string) {
    return this.s.syncVimeoMetadata(u, courseId);
  }
  /** Restringe o embed do vídeo aos domínios do app (VIMEO_EMBED_DOMAINS). */
  @Post('vimeo/videos/:id/restrict-embed') restrict(@Param('id') id: string) {
    return this.vimeo.restrictEmbedToApp(id);
  }
}
