import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/types';
import { CatalogService, PlanetFilter } from './catalog.service';

@ApiTags('catálogo do aluno')
@ApiBearerAuth()
@Controller('catalog')
export class CatalogController {
  constructor(private readonly s: CatalogService) {}

  @Get('home') home(@CurrentUser() u: AuthUser) {
    return this.s.home(u);
  }

  @Get('categories') categories(@CurrentUser() u: AuthUser) {
    return this.s.categories(u);
  }

  @ApiQuery({ name: 'filter', required: false, enum: ['all', 'in_progress', 'free', 'premium', 'coming_soon'] })
  @Get('planets')
  planets(@CurrentUser() u: AuthUser, @Query('category') category?: string, @Query('filter') filter?: PlanetFilter, @Query('search') search?: string) {
    return this.s.planets(u, { category, filter, search });
  }

  @Get('planets/:slug') planet(@CurrentUser() u: AuthUser, @Param('slug') slug: string) {
    return this.s.planet(u, slug);
  }

  @Get('assignments') assignments(@CurrentUser() u: AuthUser) {
    return this.s.myAssignments(u);
  }

  @Get('search') search(@CurrentUser() u: AuthUser, @Query('q') q = '') {
    return this.s.search(u, q);
  }

  @Get('me/stats') stats(@CurrentUser() u: AuthUser) {
    return this.s.myStats(u);
  }
}
