import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DedupService } from './dedup.service';
import { CrmScopeService } from './scope.service';
import { CrmTimelineService } from './timeline.service';
import { maskPerson } from './masking';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { QueryPeopleDto } from './dto/query-people.dto';
import { AddContactDto } from './dto/add-contact.dto';
import { AddAddressDto } from './dto/add-address.dto';
import { AddRelationshipDto } from './dto/add-relationship.dto';
import { AddIdentityLinkDto } from './dto/add-identity-link.dto';
import { SetPersonRolesDto } from './dto/set-person-roles.dto';
import { SetTagsDto } from './dto/set-tags.dto';

/**
 * Person registry (FRS-001). Owner of Person and sub-entities.
 * No hard delete: archive only (Art. 4.4). All mutations audited (Art. 6.3).
 * Dedup checked on create; potential duplicates block creation unless confirmed.
 */
@Injectable()
export class PeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dedup: DedupService,
    private readonly scope: CrmScopeService,
    private readonly timeline: CrmTimelineService,
  ) {}

  private readonly profileInclude = {
    personRoles: true,
    contacts: true,
    addresses: true,
    tags: { include: { tag: true } },
    relationsFrom: { include: { relatedPerson: { select: { id: true, fullName: true } } } },
    identityLinks: true,
  };

  async create(dto: CreatePersonDto, actorId: string) {
    const contactValues = dto.contacts?.map((c) => c.value) ?? [];
    const candidates = await this.dedup.findCandidates({
      nationalId: dto.nationalId,
      contactValues,
      fullName: dto.fullName,
    });
    if (candidates.length > 0 && !dto.confirmNotDuplicate) {
      throw new ConflictException({
        message: 'Potential duplicate persons found. Review candidates or set confirmNotDuplicate.',
        candidates,
      });
    }

    const person = await this.prisma.person.create({
      data: {
        fullName: dto.fullName,
        shortName: dto.shortName,
        gender: dto.gender,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        maritalStatus: dto.maritalStatus,
        nationality: dto.nationality,
        nationalId: dto.nationalId,
        occupation: dto.occupation,
        notes: dto.notes,
        sourceSystem: dto.sourceSystem ?? 'ERP',
        createdBy: actorId,
        contacts: dto.contacts ? { create: dto.contacts } : undefined,
        addresses: dto.addresses ? { create: dto.addresses } : undefined,
        personRoles: dto.roles
          ? { create: dto.roles.map((roleType) => ({ roleType, assignedBy: actorId })) }
          : undefined,
      },
      include: this.profileInclude,
    });

    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'crm',
      entityType: 'Person',
      entityId: person.id,
      newValue: { fullName: dto.fullName, sourceSystem: dto.sourceSystem ?? 'ERP' },
    });
    await this.timeline.record({
      personId: person.id,
      eventType: 'REGISTERED',
      module: 'crm',
      title: 'Person registered',
      createdBy: actorId,
    });

    return person;
  }

  async findAll(query: QueryPeopleDto, userId: string, canViewSensitive: boolean) {
    const scopeWhere = await this.scope.personWhereForUser(userId);
    const where: Record<string, unknown> = {
      ...scopeWhere,
      status: query.status ?? { not: 'MERGED' },
      ...(query.roleType ? { personRoles: { some: { roleType: query.roleType, active: true } } } : {}),
      ...(query.governorate
        ? { addresses: { some: { governorate: query.governorate } } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { contacts: { some: { value: { contains: query.search } } } },
              { nationalId: query.search },
              ...(Number.isInteger(Number(query.search))
                ? [{ personNumber: Number(query.search) }]
                : []),
            ],
          }
        : {}),
    };

    const take = Math.min(query.limit ?? 25, 100);
    const skip = query.offset ?? 0;
    const [items, total] = await Promise.all([
      this.prisma.person.findMany({
        where,
        include: { contacts: true, addresses: true, personRoles: true },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.person.count({ where }),
    ]);

    type Row = Record<string, unknown> & {
      nationalId?: string | null;
      contacts?: { value: string }[];
    };
    return {
      items: (items as Row[]).map((p) => maskPerson(p, canViewSensitive)),
      total,
      limit: take,
      offset: skip,
    };
  }

  async findOne(id: string, canViewSensitive: boolean) {
    const person = await this.prisma.person.findUnique({
      where: { id },
      include: this.profileInclude,
    });
    if (!person) throw new NotFoundException('Person not found');
    return maskPerson(person as Record<string, unknown> & { nationalId?: string | null }, canViewSensitive);
  }

  async update(id: string, dto: UpdatePersonDto, actorId: string) {
    const existing = await this.prisma.person.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Person not found');

    const person = await this.prisma.person.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.shortName !== undefined ? { shortName: dto.shortName } : {}),
        ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
        ...(dto.dateOfBirth !== undefined ? { dateOfBirth: new Date(dto.dateOfBirth) } : {}),
        ...(dto.maritalStatus !== undefined ? { maritalStatus: dto.maritalStatus } : {}),
        ...(dto.nationality !== undefined ? { nationality: dto.nationality } : {}),
        ...(dto.nationalId !== undefined ? { nationalId: dto.nationalId } : {}),
        ...(dto.occupation !== undefined ? { occupation: dto.occupation } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });

    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'crm',
      entityType: 'Person',
      entityId: id,
      oldValue: { fullName: existing.fullName },
      newValue: dto as unknown as Prisma.InputJsonValue,
    });
    return person;
  }

  /** Archive, never delete (FRS-001 §20). */
  async archive(id: string, actorId: string) {
    const existing = await this.prisma.person.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Person not found');
    const person = await this.prisma.person.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
    await this.audit.log({
      userId: actorId,
      action: 'ARCHIVE',
      module: 'crm',
      entityType: 'Person',
      entityId: id,
      oldValue: { status: existing.status },
      newValue: { status: 'ARCHIVED' },
    });
    return person;
  }

  async restore(id: string, actorId: string) {
    const person = await this.prisma.person.update({ where: { id }, data: { status: 'ACTIVE' } });
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'crm',
      entityType: 'Person',
      entityId: id,
      newValue: { status: 'ACTIVE' },
    });
    return person;
  }

  // ── sub-resources ──────────────────────────────────────────

  async addContact(personId: string, dto: AddContactDto, actorId: string) {
    await this.ensureExists(personId);
    if (dto.isPrimary) {
      await this.prisma.contactInfo.updateMany({
        where: { personId, type: dto.type },
        data: { isPrimary: false },
      });
    }
    const contact = await this.prisma.contactInfo.create({ data: { personId, ...dto } });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'crm',
      entityType: 'ContactInfo',
      entityId: contact.id,
      newValue: { personId, type: dto.type },
    });
    return contact;
  }

  async addAddress(personId: string, dto: AddAddressDto, actorId: string) {
    await this.ensureExists(personId);
    if (dto.isPrimary) {
      await this.prisma.address.updateMany({ where: { personId }, data: { isPrimary: false } });
    }
    const address = await this.prisma.address.create({ data: { personId, ...dto } });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'crm',
      entityType: 'Address',
      entityId: address.id,
      newValue: { personId, governorate: dto.governorate ?? null },
    });
    return address;
  }

  async setRoles(personId: string, dto: SetPersonRolesDto, actorId: string) {
    await this.ensureExists(personId);
    const existing = (await this.prisma.personRole.findMany({ where: { personId } })) as {
      id: string;
      roleType: string;
    }[];
    const wanted = new Set(dto.roles);
    const toDeactivate = existing.filter((r) => !wanted.has(r.roleType as never));

    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.personRole.updateMany({
        where: { id: { in: toDeactivate.map((r) => r.id) } },
        data: { active: false },
      }),
      ...dto.roles.map((roleType) =>
        this.prisma.personRole.upsert({
          where: { personId_roleType: { personId, roleType } },
          create: { personId, roleType, assignedBy: actorId },
          update: { active: true },
        }),
      ),
    ];
    await this.prisma.$transaction(ops);

    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'crm',
      entityType: 'PersonRole',
      entityId: personId,
      newValue: { roles: dto.roles },
    });
    return this.prisma.personRole.findMany({ where: { personId } });
  }

  async setTags(personId: string, dto: SetTagsDto, actorId: string) {
    await this.ensureExists(personId);
    const tags = await Promise.all(
      dto.tags.map((name) =>
        this.prisma.tag.upsert({ where: { name }, create: { name }, update: {} }),
      ),
    );
    await this.prisma.$transaction([
      this.prisma.personTag.deleteMany({ where: { personId } }),
      this.prisma.personTag.createMany({
        data: (tags as { id: string }[]).map((t) => ({ personId, tagId: t.id })),
      }),
    ]);
    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'crm',
      entityType: 'PersonTag',
      entityId: personId,
      newValue: { tags: dto.tags },
    });
    return { personId, tags: dto.tags };
  }

  async addRelationship(personId: string, dto: AddRelationshipDto, actorId: string) {
    await this.ensureExists(personId);
    await this.ensureExists(dto.relatedPersonId);
    const rel = await this.prisma.relationship.create({
      data: { personId, relatedPersonId: dto.relatedPersonId, type: dto.type, notes: dto.notes },
    });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'crm',
      entityType: 'Relationship',
      entityId: rel.id,
      newValue: { personId, relatedPersonId: dto.relatedPersonId, type: dto.type },
    });
    return rel;
  }

  /** Identity link: maps an external-system user to this Person (Data Ownership §6). */
  async addIdentityLink(personId: string, dto: AddIdentityLinkDto, actorId: string) {
    await this.ensureExists(personId);
    const link = await this.prisma.personIdentityLink.create({
      data: {
        personId,
        sourceSystem: dto.sourceSystem,
        externalUserId: dto.externalUserId,
        createdBy: actorId,
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'crm',
      entityType: 'PersonIdentityLink',
      entityId: link.id,
      newValue: { personId, sourceSystem: dto.sourceSystem, externalUserId: dto.externalUserId },
    });
    return link;
  }

  private async ensureExists(personId: string): Promise<void> {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { id: true, status: true },
    });
    if (!person) throw new NotFoundException(`Person ${personId} not found`);
  }
}
