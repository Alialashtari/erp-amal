import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { AttachmentService } from './attachment.service';
import { FilesController } from './files.controller';

/**
 * Storage module (Phase 2). Binaries in MinIO/S3 only; PostgreSQL keeps metadata
 * (Constitution Art. 3.5). Global: every business module attaches files
 * through AttachmentService.
 */
@Global()
@Module({
  controllers: [FilesController],
  providers: [StorageService, AttachmentService],
  exports: [StorageService, AttachmentService],
})
export class StorageModule {}
