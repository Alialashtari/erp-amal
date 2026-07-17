import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Client as MinioClient } from 'minio';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { buildObjectKey, isForbiddenExtension } from './object-key.util';

export interface UploadInput {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  module: string;
  folderId?: string;
  /** When set, the upload becomes a new version of this file. */
  previousFileId?: string;
  uploadedBy: string;
}

/**
 * MinIO/S3-backed file storage. Database stores metadata only (Art. 3.5).
 * Files are never hard-deleted: archive only (Art. 4.4). Version-ready:
 * a new upload may reference its previous version, forming a chain.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: MinioClient;
  private readonly bucket: string;
  private readonly maxSizeBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    const endpoint = new URL(config.get<string>('S3_ENDPOINT', 'http://localhost:9000'));
    this.client = new MinioClient({
      endPoint: endpoint.hostname,
      port: endpoint.port ? Number(endpoint.port) : endpoint.protocol === 'https:' ? 443 : 80,
      useSSL: endpoint.protocol === 'https:',
      accessKey: config.get<string>('S3_ACCESS_KEY', ''),
      secretKey: config.get<string>('S3_SECRET_KEY', ''),
    });
    this.bucket = config.get<string>('S3_BUCKET', 'amal-erp');
    this.maxSizeBytes = Number(config.get('S3_MAX_UPLOAD_MB', 25)) * 1024 * 1024;
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBucket();
  }

  async upload(input: UploadInput) {
    if (isForbiddenExtension(input.fileName)) {
      throw new BadRequestException('This file type is not allowed');
    }
    if (input.buffer.length === 0) throw new BadRequestException('Empty file');
    if (input.buffer.length > this.maxSizeBytes) {
      throw new BadRequestException(`File exceeds maximum size of ${this.maxSizeBytes} bytes`);
    }

    let version = 1;
    if (input.previousFileId) {
      const previous = await this.prisma.storedFile.findUnique({
        where: { id: input.previousFileId },
      });
      if (!previous) throw new NotFoundException('Previous file version not found');
      version = (previous as { version: number }).version + 1;
    }

    const objectKey = buildObjectKey(input.module, input.fileName);
    await this.client.putObject(this.bucket, objectKey, input.buffer, input.buffer.length, {
      'Content-Type': input.mimeType,
    });

    const file = await this.prisma.storedFile.create({
      data: {
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.buffer.length,
        bucket: this.bucket,
        objectKey,
        checksumSha256: createHash('sha256').update(input.buffer).digest('hex'),
        version,
        previousVersionId: input.previousFileId,
        module: input.module,
        folderId: input.folderId,
        uploadedBy: input.uploadedBy,
      },
    });

    await this.audit.log({
      userId: input.uploadedBy,
      action: 'CREATE',
      module: 'storage',
      entityType: 'StoredFile',
      entityId: file.id,
      newValue: {
        fileName: input.fileName,
        module: input.module,
        sizeBytes: input.buffer.length,
        version,
      },
    });
    return file;
  }

  /** Presigned URL download: the API never streams binaries itself. */
  async getDownloadUrl(fileId: string, actorId: string): Promise<{ url: string; expiresIn: number }> {
    const file = await this.prisma.storedFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('File not found');
    const expiresIn = 15 * 60;
    const url = await this.client.presignedGetObject(
      (file as { bucket: string }).bucket,
      (file as { objectKey: string }).objectKey,
      expiresIn,
    );
    await this.audit.log({
      userId: actorId,
      action: 'EXPORT',
      module: 'storage',
      entityType: 'StoredFile',
      entityId: fileId,
      newValue: { download: true },
    });
    return { url, expiresIn };
  }

  async getMetadata(fileId: string) {
    const file = await this.prisma.storedFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('File not found');
    return file;
  }

  /** Archive, never delete (Art. 4.4). The binary remains in storage. */
  async archive(fileId: string, actorId: string) {
    const file = await this.prisma.storedFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('File not found');
    const updated = await this.prisma.storedFile.update({
      where: { id: fileId },
      data: { status: 'ARCHIVED' },
    });
    await this.audit.log({
      userId: actorId,
      action: 'ARCHIVE',
      module: 'storage',
      entityType: 'StoredFile',
      entityId: fileId,
      newValue: { status: 'ARCHIVED' },
    });
    return updated;
  }

  async createFolder(name: string, parentId: string | undefined, module: string | undefined, actorId: string) {
    const folder = await this.prisma.storageFolder.create({
      data: { name, parentId, module },
    });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'storage',
      entityType: 'StorageFolder',
      entityId: folder.id,
      newValue: { name, parentId: parentId ?? null },
    });
    return folder;
  }

  async listFolder(folderId?: string) {
    const [folders, files] = await Promise.all([
      this.prisma.storageFolder.findMany({ where: { parentId: folderId ?? null } }),
      this.prisma.storedFile.findMany({
        where: { folderId: folderId ?? null, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);
    return { folders, files };
  }

  /** Ensures the bucket exists (called on boot; non-fatal in development). */
  async ensureBucket(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) await this.client.makeBucket(this.bucket);
    } catch (error) {
      this.logger.warn(`Object storage unreachable (${(error as Error).message}); uploads will fail until it is available.`);
    }
  }
}
