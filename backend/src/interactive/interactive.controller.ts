import {
  BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Req, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { existsSync } from 'fs';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { InteractiveService } from './interactive.service';

const XAPI_VERSION = '1.0.3';

@ApiTags('conteúdo interativo (SCORM / xAPI / cmi5)')
@Controller()
export class InteractiveController {
  constructor(private readonly s: InteractiveService) {}

  // ---------------------------------------------------- pacotes (MASTER)
  @ApiBearerAuth() @Roles('MASTER_FOLKS') @Post('master/interactive/packages')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 500 * 1024 * 1024 } }))
  upload(@CurrentUser() u: AuthUser, @UploadedFile() file: Express.Multer.File, @Body('title') title?: string) {
    return this.s.upload(u, file, title);
  }

  @ApiBearerAuth() @Roles('MASTER_FOLKS') @Get('master/interactive/packages')
  list() {
    return this.s.list();
  }

  @ApiBearerAuth() @Roles('MASTER_FOLKS') @Delete('master/interactive/packages/:id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.s.remove(id);
  }

  // ---------------------------------------------------------- aluno
  /** Retorna a URL de launch (xAPI/cmi5) ou a config do runtime SCORM. */
  @ApiBearerAuth() @Get('interactive/lessons/:lessonId/launch')
  launch(@CurrentUser() u: AuthUser, @Param('lessonId', ParseUUIDPipe) lessonId: string) {
    return this.s.launch(u, lessonId);
  }

  /** Arquivos do pacote (carregados dentro do iframe). */
  @Public() @Get('interactive/content/:packageId/*path')
  async content(@Param('packageId', ParseUUIDPipe) packageId: string, @Param('path') path: string | string[], @Res() res: Response) {
    const rel = Array.isArray(path) ? path.join('/') : path;
    let abs: string;
    try {
      abs = this.s.filePath(packageId, decodeURIComponent(rel));
    } catch {
      throw new BadRequestException();
    }
    if (!existsSync(abs)) throw new NotFoundException();
    res.sendFile(abs);
  }

  /** Commit do runtime SCORM (scorm-again -> lmsCommitUrl). Token de launch no header. */
  @Public() @Post('interactive/scorm/commit') @HttpCode(200)
  async scormCommit(@Headers('authorization') auth: string, @Body() body: Record<string, any>) {
    const claims = await this.s.claimsFromHeader(auth);
    return this.s.scormCommit(claims, body);
  }

  // ------------------------------------------------------ LRS (xAPI)
  @Public() @Get('xapi/about')
  about() {
    return { version: [XAPI_VERSION, '1.0.2', '1.0.1', '1.0.0'] };
  }

  /** cmi5: o AU troca o "fetch" por um auth-token (uso único conforme a spec). */
  @Public() @Post('xapi/cmi5/fetch') @HttpCode(200)
  async cmi5Fetch(@Query('token') token: string) {
    await this.s.verifyLaunchToken(token);
    return { 'auth-token': Buffer.from(`launch:${token}`).toString('base64') };
  }

  @Public() @Post('xapi/statements') @HttpCode(200)
  async postStatements(@Headers('authorization') auth: string, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const claims = await this.s.claimsFromHeader(auth);
    res.setHeader('X-Experience-API-Version', XAPI_VERSION);
    const r = await this.s.storeStatements(claims, body);
    return r.ids;
  }

  @Public() @Put('xapi/statements') @HttpCode(204)
  async putStatement(@Headers('authorization') auth: string, @Query('statementId') id: string, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    if (!id) throw new BadRequestException('statementId obrigatório');
    const claims = await this.s.claimsFromHeader(auth);
    res.setHeader('X-Experience-API-Version', XAPI_VERSION);
    await this.s.storeStatements(claims, body, id);
  }

  @Public() @Get('xapi/statements')
  async getStatements(@Headers('authorization') auth: string, @Query() q: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const claims = await this.s.claimsFromHeader(auth);
    res.setHeader('X-Experience-API-Version', XAPI_VERSION);
    return this.s.queryStatements(claims, q);
  }

  // State / Activity Profile / Agent Profile
  @Public() @Get('xapi/activities/state') getState(@Headers('authorization') a: string, @Query() q: Record<string, string>, @Res() res: Response) {
    return this.getDoc('state', a, q, res);
  }
  @Public() @Put('xapi/activities/state') putState(@Headers('authorization') a: string, @Query() q: Record<string, string>, @Req() req: Request, @Res() res: Response) {
    return this.putDoc('state', a, q, req, res, false);
  }
  @Public() @Post('xapi/activities/state') postState(@Headers('authorization') a: string, @Query() q: Record<string, string>, @Req() req: Request, @Res() res: Response) {
    return this.putDoc('state', a, q, req, res, true);
  }
  @Public() @Delete('xapi/activities/state') async delState(@Headers('authorization') a: string, @Query() q: Record<string, string>, @Res() res: Response) {
    await this.s.deleteDocument('state', q, await this.s.claimsFromHeader(a));
    res.status(204).setHeader('X-Experience-API-Version', XAPI_VERSION).end();
  }
  @Public() @Get('xapi/activities/profile') getActProfile(@Headers('authorization') a: string, @Query() q: Record<string, string>, @Res() res: Response) {
    return this.getDoc('activity_profile', a, q, res);
  }
  @Public() @Put('xapi/activities/profile') putActProfile(@Headers('authorization') a: string, @Query() q: Record<string, string>, @Req() req: Request, @Res() res: Response) {
    return this.putDoc('activity_profile', a, q, req, res, false);
  }
  @Public() @Get('xapi/agents/profile') getAgentProfile(@Headers('authorization') a: string, @Query() q: Record<string, string>, @Res() res: Response) {
    return this.getDoc('agent_profile', a, q, res);
  }
  @Public() @Put('xapi/agents/profile') putAgentProfile(@Headers('authorization') a: string, @Query() q: Record<string, string>, @Req() req: Request, @Res() res: Response) {
    return this.putDoc('agent_profile', a, q, req, res, false);
  }

  private async getDoc(kind: string, auth: string, q: Record<string, string>, res: Response) {
    const claims = await this.s.claimsFromHeader(auth);
    res.setHeader('X-Experience-API-Version', XAPI_VERSION);
    const r = await this.s.getDocument(kind, q, claims);
    if ('list' in r) return res.json(r.list);
    res.setHeader('Content-Type', r.doc!.contentType);
    res.setHeader('ETag', r.doc!.etag);
    return res.send(Buffer.from(r.doc!.contents));
  }

  private async putDoc(kind: string, auth: string, q: Record<string, string>, req: Request, res: Response, merge: boolean) {
    const claims = await this.s.claimsFromHeader(auth);
    const raw: Buffer = (req as any).rawBody ?? Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}));
    await this.s.putDocument(kind, q, claims, raw, req.headers['content-type'] ?? 'application/octet-stream', merge);
    res.status(204).setHeader('X-Experience-API-Version', XAPI_VERSION).end();
  }
}
