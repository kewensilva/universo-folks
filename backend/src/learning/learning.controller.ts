import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/types';
import { EntitlementsService } from '../access/entitlements.service';
import { LearningService } from './learning.service';

class VideoProgressDto {
  @IsInt() @Min(0) watchedSeconds: number;
  @IsOptional() @IsBoolean() ended?: boolean;
}

class PairDto {
  @IsString() @MaxLength(500) left: string;
  @IsString() @MaxLength(500) right: string;
}
class AssignmentDto {
  @IsString() @MaxLength(500) item: string;
  @IsInt() @Min(0) @Max(20) group: number;
}
class SimulatorAnswerDto {
  @IsBoolean() correct: boolean;
  @IsOptional() @IsObject() values?: Record<string, number>;
}

/** Resposta de uma questão: cada tipo usa o seu campo (ver packages/content-ingest/src/questions.ts). */
class AnswerDto {
  @IsUUID() questionId: string;
  /** escolha (SINGLE_CHOICE, MULTIPLE_CHOICE, TRUE_FALSE) */
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsUUID('all', { each: true }) optionIds?: string[];
  /** NUMBER */
  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) value?: number;
  /** ORDER e BUILD_SENTENCE */
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(500, { each: true }) sequence?: string[];
  /** MATCH_PAIRS */
  @IsOptional() @IsArray() @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => PairDto) pairs?: PairDto[];
  /** CLASSIFY */
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => AssignmentDto) assignments?: AssignmentDto[];
  /** SIMULATOR: resultado da regra do simulador aplicada no app */
  @IsOptional() @ValidateNested() @Type(() => SimulatorAnswerDto) simulator?: SimulatorAnswerDto;
  @IsOptional() @IsInt() @Min(0) timeMs?: number;
}

class AnswersDto {
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => AnswerDto)
  answers: AnswerDto[];
}

/** Resultado de exercícios gerados no aparelho. */
class GeneratedResultDto {
  @IsInt() @Min(0) @Max(200) correct: number;
  @IsInt() @Min(1) @Max(200) total: number;
  @IsOptional() @IsInt() @Min(0) xp?: number;
}

class InfiniteFinishDto {
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => AnswerDto) answers?: AnswerDto[];
  @IsOptional() @IsInt() @Min(0) @Max(500) answered?: number;
  @IsOptional() @IsInt() @Min(0) @Max(500) correct?: number;
  @IsOptional() @IsInt() @Min(0) @Max(500) bestRun?: number;
  @IsOptional() @IsInt() @Min(0) xp?: number;
}

class ExamSubmitDto {
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => AnswerDto) answers?: AnswerDto[];
  @IsOptional() @IsInt() @Min(0) @Max(200) correct?: number;
  @IsOptional() @IsInt() @Min(1) @Max(200) total?: number;
  @IsOptional() @IsInt() @Min(0) xp?: number;
}

class StateDto {
  @IsObject() state: Record<string, unknown>;
}

class GameSessionDto {
  @IsString() @IsIn(['ensaio', 'jam', 'prova', 'treino']) mode: string;
  @IsInt() @Min(0) @Max(500) correct: number;
  @IsInt() @Min(0) @Max(500) total: number;
  @IsInt() @Min(0) xp: number;
}

@ApiTags('aprendizagem (trilha, aula, vídeo, prática, desafio final, jogos)')
@ApiBearerAuth()
@Controller('learning')
export class LearningController {
  constructor(
    private readonly s: LearningService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /** Estado completo para hidratar o app (etapas concluídas, estados, recordes, insígnias). */
  @Get('me/snapshot') snapshot(@CurrentUser() u: AuthUser) {
    return this.s.snapshot(u);
  }

  @Get('courses/:id/trail') trail(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.s.trail(u, id);
  }

  @Get('lessons/:id') lesson(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.s.getLesson(u, id);
  }

  /** Conclui uma aula (telas). */
  @Post('lessons/:id/complete') complete(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.s.completeLessonScreen(u, id);
  }

  @Post('lessons/:id/video-progress') video(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VideoProgressDto) {
    return this.s.videoProgress(u, id, dto.watchedSeconds, dto.ended);
  }

  /** Prática com questões do banco (correção no servidor). */
  @Post('lessons/:id/practice') practice(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AnswersDto) {
    return this.s.submitPractice(u, id, dto.answers);
  }

  /** Prática gerada no app: { correct, total, xp? }. */
  @Post('lessons/:id/practice-result') practiceResult(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: GeneratedResultDto) {
    return this.s.submitGeneratedPractice(u, id, dto);
  }

  /** Começa a rodada de prática infinita (grátis: 1/dia, 12 exercícios; 409 daily_limit). */
  @Post('courses/:id/infinite/start') startInfinite(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.s.startInfinite(u, id);
  }

  @Post('courses/:id/infinite/finish') finishInfinite(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: InfiniteFinishDto) {
    return this.s.finishInfinite(u, id, dto);
  }

  @Post('courses/:id/exam/start') startExam(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.s.startExam(u, id);
  }

  @Post('exam-attempts/:id/submit') submitExam(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ExamSubmitDto) {
    return this.s.submitExam(u, id, dto);
  }

  /** Estado livre do curso no aparelho (ex.: cartas da tabuada). */
  @Put('course-states/:courseId') courseState(@CurrentUser() u: AuthUser, @Param('courseId', ParseUUIDPipe) courseId: string, @Body() dto: StateDto) {
    return this.s.saveCourseState(u, courseId, dto.state);
  }

  /** Estado do jogo (ex.: "campo" = Campo Harmônico). */
  @Put('games/:gameId/state') gameState(@CurrentUser() u: AuthUser, @Param('gameId') gameId: string, @Body() dto: StateDto) {
    return this.s.saveGameState(u, gameId, dto.state);
  }

  /** Fim de ensaio / jam / prova do jogo. */
  @Post('games/:gameId/sessions') gameSession(@CurrentUser() u: AuthUser, @Param('gameId') gameId: string, @Body() dto: GameSessionDto) {
    return this.s.gameSession(u, gameId, dto);
  }

  /** Começa a jam do dia (grátis: 1/dia; 409 daily_limit). */
  @Post('games/:gameId/jam/start') @HttpCode(200) startJam(@CurrentUser() u: AuthUser) {
    return this.entitlements.consume(u, 'JAM');
  }
}
