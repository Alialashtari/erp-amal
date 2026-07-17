import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { StorageService } from './storage.service';
import { AttachmentService } from './attachment.service';
import { AttachFileDto } from './dto/attach-file.dto';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UploadFileDto } from './dto/upload-file.dto';

@ApiTags('storage')
@ApiBearerAuth()
@Controller('storage')
export class FilesController {
  constructor(
    private readonly storage: StorageService,
    private readonly attachments: AttachmentService,
  ) {}

  @Post('files')
  @RequirePermissions('storage.manage')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        module: { type: 'string' },
        folderId: { type: 'string' },
        previousFileId: { type: 'string' },
      },
      required: ['file', 'module'],
    },
  })
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadFileDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException("Multipart field 'file' is required");
    return this.storage.upload({
      fileName: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer,
      module: dto.module,
      folderId: dto.folderId,
      previousFileId: dto.previousFileId,
      uploadedBy: user.userId,
    });
  }

  @Get('files/:id')
  @RequirePermissions('storage.view')
  metadata(@Param('id', ParseUUIDPipe) id: string) {
    return this.storage.getMetadata(id);
  }

  @Get('files/:id/download-url')
  @RequirePermissions('storage.view')
  downloadUrl(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.storage.getDownloadUrl(id, user.userId);
  }

  @Post('files/:id/archive')
  @RequirePermissions('storage.manage')
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.storage.archive(id, user.userId);
  }

  @Post('folders')
  @RequirePermissions('storage.manage')
  createFolder(@Body() dto: CreateFolderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.storage.createFolder(dto.name, dto.parentId, dto.module, user.userId);
  }

  @Get('folders')
  @RequirePermissions('storage.view')
  listFolder(@Query('folderId') folderId?: string) {
    return this.storage.listFolder(folderId);
  }

  @Post('attachments')
  @RequirePermissions('storage.manage')
  attach(@Body() dto: AttachFileDto, @CurrentUser() user: AuthenticatedUser) {
    return this.attachments.attach(dto.fileId, dto.module, dto.entityType, dto.entityId, user.userId);
  }

  @Get('attachments')
  @RequirePermissions('storage.view')
  forEntity(@Query('entityType') entityType: string, @Query('entityId') entityId: string) {
    if (!entityType || !entityId) {
      throw new BadRequestException('entityType and entityId are required');
    }
    return this.attachments.forEntity(entityType, entityId);
  }
}
