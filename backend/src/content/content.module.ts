import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { CatalogImportService } from './catalog-import.service';
import { VideoBoardService } from './video-board.service';

@Module({ controllers: [ContentController], providers: [ContentService, CatalogImportService, VideoBoardService], exports: [ContentService, CatalogImportService, VideoBoardService] })
export class ContentModule {}
