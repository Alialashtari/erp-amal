import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CrmTimelineService } from '../crm/timeline.service';
import { generateVerificationCode } from './project-rules';

/**
 * Certificates (FRS-007): issued to a Person, optionally for a project,
 * verifiable publicly by code (QR target). PDF generation reuses the
 * PdfRenderer abstraction in a later iteration; the certificate record and
 * verification are authoritative.
 */
@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly timeline: CrmTimelineService,
  ) {}

  async issue(
    personId: string,
    projectId: string | undefined,
    title: string,
    titleAr: string | undefined,
    actorId: string,
  ) {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { id: true },
    });
    if (!person) throw new NotFoundException('Person not found');
    if (projectId) {
      const project = await this.prisma.project.findUnique({ where: { id: projectId } });
      if (!project) throw new NotFoundException('Project not found');
    }

    const certificate = await this.prisma.certificate.create({
      data: {
        personId,
        projectId,
        title,
        titleAr,
        verificationCode: generateVerificationCode(),
        issuedBy: actorId,
      },
    });
    await this.timeline.record({
      personId,
      eventType: 'CERTIFICATE_ISSUED',
      module: 'projects',
      title: `Certificate issued: ${title}`,
      entityType: 'Certificate',
      entityId: certificate.id,
      createdBy: actorId,
    });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'projects',
      entityType: 'Certificate',
      entityId: certificate.id,
      newValue: { personId, projectId: projectId ?? null, title },
    });
    return certificate;
  }

  forPerson(personId: string) {
    return this.prisma.certificate.findMany({
      where: { personId },
      orderBy: { issuedAt: 'desc' },
      include: { project: { select: { name: true } } },
    });
  }

  /** Public verification (QR target): returns certificate essentials only. */
  async verify(code: string) {
    const certificate = await this.prisma.certificate.findUnique({
      where: { verificationCode: code },
      include: { project: { select: { name: true } } },
    });
    if (!certificate) throw new NotFoundException('Certificate not found');
    const c = certificate as {
      certificateNumber: number;
      title: string;
      titleAr: string | null;
      issuedAt: Date;
      personId: string;
      project: { name: string } | null;
    };
    const person = await this.prisma.person.findUnique({
      where: { id: c.personId },
      select: { fullName: true },
    });
    return {
      valid: true,
      certificateNumber: c.certificateNumber,
      title: c.title,
      titleAr: c.titleAr,
      issuedAt: c.issuedAt,
      holderName: (person as { fullName: string } | null)?.fullName,
      project: c.project?.name ?? null,
    };
  }
}
