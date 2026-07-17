import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CrmTimelineService } from './timeline.service';

interface MergeDetail {
  contactIds: string[];
  addressIds: string[];
  personRoleMoved: string[]; // role ids moved (role type not already on primary)
  personRoleDeactivated: string[]; // duplicate role ids left on source, deactivated
  tagIdsMoved: string[];
  relationshipIdsFrom: string[];
  relationshipIdsTo: string[];
  identityLinkIds: string[];
  timelineEventIds: string[];
  userIdRelinked: string | null;
  sourceSnapshot: { status: string };
}

/**
 * Reversible person merge (FRS-001 §19; Data Ownership Model §6).
 * Staff-approved only (crm.merge). Re-links all references from source → primary,
 * marks source MERGED, and stores a MergeRecord detailed enough to reverse.
 * Financial history is never silently merged: business modules (Phase 3+) resolve
 * persons through CRM and follow mergedIntoId pointers.
 */
@Injectable()
export class MergeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly timeline: CrmTimelineService,
  ) {}

  async merge(primaryId: string, sourceId: string, actorId: string) {
    if (primaryId === sourceId) throw new BadRequestException('Cannot merge a person into itself');
    const [primary, source] = await Promise.all([
      this.prisma.person.findUnique({ where: { id: primaryId } }),
      this.prisma.person.findUnique({ where: { id: sourceId } }),
    ]);
    if (!primary || !source) throw new NotFoundException('Person not found');
    if (primary.status === 'MERGED' || source.status === 'MERGED') {
      throw new BadRequestException('Cannot merge an already-merged person');
    }

    const detail: MergeDetail = {
      contactIds: [],
      addressIds: [],
      personRoleMoved: [],
      personRoleDeactivated: [],
      tagIdsMoved: [],
      relationshipIdsFrom: [],
      relationshipIdsTo: [],
      identityLinkIds: [],
      timelineEventIds: [],
      userIdRelinked: null,
      sourceSnapshot: { status: source.status },
    };

    // Collect source references
    const [contacts, addresses, roles, primaryRoles, personTags, primaryTags, relsFrom, relsTo, links, events, sourceUser, primaryUser] =
      await Promise.all([
        this.prisma.contactInfo.findMany({ where: { personId: sourceId }, select: { id: true } }),
        this.prisma.address.findMany({ where: { personId: sourceId }, select: { id: true } }),
        this.prisma.personRole.findMany({ where: { personId: sourceId } }),
        this.prisma.personRole.findMany({ where: { personId: primaryId } }),
        this.prisma.personTag.findMany({ where: { personId: sourceId } }),
        this.prisma.personTag.findMany({ where: { personId: primaryId } }),
        this.prisma.relationship.findMany({ where: { personId: sourceId }, select: { id: true } }),
        this.prisma.relationship.findMany({ where: { relatedPersonId: sourceId }, select: { id: true } }),
        this.prisma.personIdentityLink.findMany({ where: { personId: sourceId }, select: { id: true } }),
        this.prisma.timelineEvent.findMany({ where: { personId: sourceId }, select: { id: true } }),
        this.prisma.user.findUnique({ where: { personId: sourceId }, select: { id: true } }),
        this.prisma.user.findUnique({ where: { personId: primaryId }, select: { id: true } }),
      ]);

    detail.contactIds = (contacts as { id: string }[]).map((c) => c.id);
    detail.addressIds = (addresses as { id: string }[]).map((a) => a.id);
    detail.relationshipIdsFrom = (relsFrom as { id: string }[]).map((r) => r.id);
    detail.relationshipIdsTo = (relsTo as { id: string }[]).map((r) => r.id);
    detail.identityLinkIds = (links as { id: string }[]).map((l) => l.id);
    detail.timelineEventIds = (events as { id: string }[]).map((e) => e.id);

    const primaryRoleTypes = new Set(
      (primaryRoles as { roleType: string }[]).map((r) => r.roleType),
    );
    const movableRoles = (roles as { id: string; roleType: string }[]).filter(
      (r) => !primaryRoleTypes.has(r.roleType),
    );
    const duplicateRoles = (roles as { id: string; roleType: string }[]).filter((r) =>
      primaryRoleTypes.has(r.roleType),
    );
    detail.personRoleMoved = movableRoles.map((r) => r.id);
    detail.personRoleDeactivated = duplicateRoles.map((r) => r.id);

    const primaryTagIds = new Set((primaryTags as { tagId: string }[]).map((t) => t.tagId));
    const movableTags = (personTags as { tagId: string }[]).filter(
      (t) => !primaryTagIds.has(t.tagId),
    );
    detail.tagIdsMoved = movableTags.map((t) => t.tagId);

    const sourceUserId = (sourceUser as { id: string } | null)?.id ?? null;
    const primaryHasUser = primaryUser !== null;

    const operations: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.contactInfo.updateMany({
        where: { personId: sourceId },
        data: { personId: primaryId, isPrimary: false },
      }),
      this.prisma.address.updateMany({
        where: { personId: sourceId },
        data: { personId: primaryId, isPrimary: false },
      }),
      this.prisma.personRole.updateMany({
        where: { id: { in: detail.personRoleMoved } },
        data: { personId: primaryId },
      }),
      this.prisma.personRole.updateMany({
        where: { id: { in: detail.personRoleDeactivated } },
        data: { active: false },
      }),
      this.prisma.personTag.deleteMany({ where: { personId: sourceId } }),
      this.prisma.personTag.createMany({
        data: detail.tagIdsMoved.map((tagId) => ({ personId: primaryId, tagId })),
      }),
      this.prisma.relationship.updateMany({
        where: { personId: sourceId },
        data: { personId: primaryId },
      }),
      this.prisma.relationship.updateMany({
        where: { relatedPersonId: sourceId },
        data: { relatedPersonId: primaryId },
      }),
      this.prisma.personIdentityLink.updateMany({
        where: { personId: sourceId },
        data: { personId: primaryId },
      }),
      this.prisma.timelineEvent.updateMany({
        where: { personId: sourceId },
        data: { personId: primaryId },
      }),
      this.prisma.person.update({
        where: { id: sourceId },
        data: { status: 'MERGED', mergedIntoId: primaryId },
      }),
    ];

    // A user account can belong to one person only; re-link only when primary has none.
    if (sourceUserId && !primaryHasUser) {
      detail.userIdRelinked = sourceUserId;
      operations.push(
        this.prisma.user.update({ where: { id: sourceUserId }, data: { personId: primaryId } }),
      );
    } else if (sourceUserId && primaryHasUser) {
      operations.push(
        this.prisma.user.update({ where: { id: sourceUserId }, data: { personId: null } }),
      );
      detail.userIdRelinked = null;
    }

    await this.prisma.$transaction(operations as Prisma.PrismaPromise<unknown>[]);

    const record = await this.prisma.mergeRecord.create({
      data: {
        primaryPersonId: primaryId,
        mergedPersonId: sourceId,
        detail: detail as unknown as Prisma.InputJsonValue,
        performedBy: actorId,
      },
    });

    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'crm',
      entityType: 'PersonMerge',
      entityId: record.id,
      oldValue: { sourcePersonId: sourceId, primaryPersonId: primaryId },
      newValue: { merged: true, detail: detail as unknown as Prisma.InputJsonValue },
    });
    await this.timeline.record({
      personId: primaryId,
      eventType: 'MERGED',
      module: 'crm',
      title: `Merged person #${source.personNumber} into this profile`,
      entityType: 'MergeRecord',
      entityId: record.id,
      createdBy: actorId,
    });

    return { mergeRecordId: record.id, primaryPersonId: primaryId, mergedPersonId: sourceId };
  }

  async reverse(mergeRecordId: string, actorId: string) {
    const record = await this.prisma.mergeRecord.findUnique({ where: { id: mergeRecordId } });
    if (!record) throw new NotFoundException('Merge record not found');
    if (record.reversedAt) throw new BadRequestException('Merge already reversed');

    const detail = record.detail as unknown as MergeDetail;
    const sourceId = record.mergedPersonId;
    const primaryId = record.primaryPersonId;

    const operations: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.contactInfo.updateMany({
        where: { id: { in: detail.contactIds } },
        data: { personId: sourceId },
      }),
      this.prisma.address.updateMany({
        where: { id: { in: detail.addressIds } },
        data: { personId: sourceId },
      }),
      this.prisma.personRole.updateMany({
        where: { id: { in: detail.personRoleMoved } },
        data: { personId: sourceId },
      }),
      this.prisma.personRole.updateMany({
        where: { id: { in: detail.personRoleDeactivated } },
        data: { active: true },
      }),
      this.prisma.personTag.deleteMany({
        where: { personId: primaryId, tagId: { in: detail.tagIdsMoved } },
      }),
      this.prisma.personTag.createMany({
        data: detail.tagIdsMoved.map((tagId) => ({ personId: sourceId, tagId })),
      }),
      this.prisma.relationship.updateMany({
        where: { id: { in: detail.relationshipIdsFrom } },
        data: { personId: sourceId },
      }),
      this.prisma.relationship.updateMany({
        where: { id: { in: detail.relationshipIdsTo } },
        data: { relatedPersonId: sourceId },
      }),
      this.prisma.personIdentityLink.updateMany({
        where: { id: { in: detail.identityLinkIds } },
        data: { personId: sourceId },
      }),
      this.prisma.timelineEvent.updateMany({
        where: { id: { in: detail.timelineEventIds } },
        data: { personId: sourceId },
      }),
      this.prisma.person.update({
        where: { id: sourceId },
        data: { status: 'ACTIVE', mergedIntoId: null },
      }),
      this.prisma.mergeRecord.update({
        where: { id: mergeRecordId },
        data: { reversedBy: actorId, reversedAt: new Date() },
      }),
    ];
    if (detail.userIdRelinked) {
      operations.push(
        this.prisma.user.update({
          where: { id: detail.userIdRelinked },
          data: { personId: sourceId },
        }),
      );
    }

    await this.prisma.$transaction(operations as Prisma.PrismaPromise<unknown>[]);

    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      module: 'crm',
      entityType: 'PersonMerge',
      entityId: mergeRecordId,
      newValue: { reversed: true },
    });
    await this.timeline.record({
      personId: sourceId,
      eventType: 'MERGE_REVERSED',
      module: 'crm',
      title: 'Merge reversed; profile restored',
      entityType: 'MergeRecord',
      entityId: mergeRecordId,
      createdBy: actorId,
    });

    return { mergeRecordId, reversed: true, restoredPersonId: sourceId };
  }
}
