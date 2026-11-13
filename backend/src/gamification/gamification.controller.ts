import { Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/types';
import { GamificationService } from './gamification.service';

@ApiTags('gamificação (XP, jornada, hangar)')
@ApiBearerAuth()
@Controller('me')
export class GamificationController {
  constructor(private readonly s: GamificationService) {}

  /** XP, nível, jornada de N dias, meta do dia. */
  @Get('progress') progress(@CurrentUser() u: AuthUser) {
    return this.s.profile(u.id);
  }

  @Get('hangar') hangar(@CurrentUser() u: AuthUser) {
    return this.s.hangar(u);
  }

  @Put('hangar/:itemId') equip(@CurrentUser() u: AuthUser, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.s.equip(u, itemId);
  }
}
