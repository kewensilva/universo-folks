import { Module } from '@nestjs/common';
import { ContentImportController } from './content-import.controller';
import { ContentImportService } from './content-import.service';
import { ContentIngestWriter } from './content-ingest.writer';

@Module({
  controllers: [ContentImportController],
  providers: [ContentImportService, ContentIngestWriter],
  exports: [ContentImportService],
})
export class ContentImportModule {}
