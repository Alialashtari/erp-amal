import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Links stored files to owning entities (person, donation, medical case, ...).
 * Business modules attach files only through this service (Art. 3.2).
 */
@Injectable()
export class AttachmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async attach(
    fileId: string,
    module: string,
    entityType: string,
    entityId: string,
    actorId: string,
  ) {
    const file = await this.prisma.storedFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('File not found');
    const attachment = await this.prisma.attachment.create({
      data: { fileId, module, entityType, entityId, attachedBy: actorId },
    });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'storage',
      entityType: 'Attachment',
      entityId: attachment.id,
      newValue: { fileId, module, entityType: entityType, targetEntityId: entityId },
    });
    return attachment;
  }

  forEntity(entityType: string, entityId: string) {
    return this.prisma.attachment.findMany({
      where: { entityType, entityId },
      include: { file: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
