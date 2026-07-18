import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BoxRequestStatus, BoxStatus, Prisma, SourceSystem } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TransactionsService } from '../finance/transactions.service';
import { canTransitionRequest, generateBoxCode } from './box-rules';
import { CreateBoxRequestDto } from './dto/create-box-request.dto';
import { RecordCollectionDto } from './dto/record-collection.dto';

interface Actor {
  userId: string;
  permissions: string[];
}

/**
 * Boxes module (ADR-027): owner of BoxRequest, CollectionBox, BoxCollection.
 * Request lifecycle is a guarded state machine; DELIVERED creates the box in
 * the same database transaction (never a request marked done without a box).
 * Collections post INCOME to the ledger (cash 1000 → box revenue 4200).
 */
@Injectable()
export class BoxesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly finance: TransactionsService,
  ) {}

  // ── requests ──

  async createRequest(dto: CreateBoxRequestDto, actorId: string) {
    // Idempotency for channel-originated requests (Art. 8.3)
    if (dto.idempotencyKey) {
      const existing = await this.prisma.boxRequest.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) return existing;
    }

    const personId = await this.resolvePerson(dto, actorId);
    const request = await this.prisma.boxRequest.create({
      data: {
        personId,
        governorate: dto.governorate,
        district: dto.district,
        addressDetails: dto.addressDetails,
        preferredContactTime: dto.preferredContactTime,
        notes: dto.notes,
        sourceSystem: dto.sourceSystem ?? 'ERP',
        externalId: dto.externalId,
        idempotencyKey: dto.idempotencyKey,
        createdBy: actorId,
      },
    });
    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'boxes',
      entityType: 'BoxRequest',
      entityId: (request as { id: string }).id,
      newValue: { personId, sourceSystem: dto.sourceSystem ?? 'ERP' },
    });
    return request;
  }

  /** Person resolution (Art. 4.2): existing id, or lightweight guest Person. */
  private async resolvePerson(dto: CreateBoxRequestDto, actorId: string): Promise<string> {
    if (dto.personId) {
      const person = await this.prisma.person.findUnique({ where: { id: dto.personId } });
      if (!person) throw new NotFoundException('Person not found');
      return dto.personId;
    }
    if (!dto.requesterName) {
      throw new BadRequestException('Provide personId or requesterName');
    }
    // Try phone match first (verified identity reuse, ADR-021 §3 spirit)
    if (dto.requesterPhone) {
      const contact = await this.prisma.contactInfo.findFirst({
        where: { type: 'PHONE', value: dto.requesterPhone },
        select: { personId: true },
      });
      if (contact) return (contact as { personId: string }).personId;
    }
    const person = await this.prisma.person.create({
      data: {
        fullName: dto.requesterName,
        sourceSystem: (dto.sourceSystem ?? 'ERP') as SourceSystem,
        createdBy: actorId,
        personRoles: { create: [{ roleType: 'BOX_OWNER', assignedBy: actorId }] },
        ...(dto.requesterPhone
          ? { contacts: { create: [{ type: 'PHONE', value: dto.requesterPhone, isPrimary: true }] } }
          : {}),
      },
    });
    return (person as { id: string }).id;
  }

  async findRequests(status: BoxRequestStatus | undefined, limit = 25, offset = 0) {
    const take = Math.min(limit, 100);
    const where = status ? { status } : {};
    const [items, total] = await Promise.all([
      this.prisma.boxRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip: offset,
      }),
      this.prisma.boxRequest.count({ where }),
    ]);
    // Attach owner names (read-only join through owner module data)
    const personIds = [...new Set((items as { personId: string }[]).map((r) => r.personId))];
    const people = (await this.prisma.person.findMany({
      where: { id: { in: personIds } },
      select: { id: true, fullName: true },
    })) as { id: string; fullName: string }[];
    const nameById = new Map(people.map((p) => [p.id, p.fullName]));
    return {
      items: (items as Record<string, unknown>[]).map((r) => ({
        ...r,
        personName: nameById.get(r.personId as string) ?? null,
      })),
      total,
      limit: take,
      offset,
    };
  }

  /** Guarded transition for every stage EXCEPT delivery (see deliver()). */
  async transitionRequest(
    id: string,
    to: BoxRequestStatus,
    actor: Actor,
    payload?: { reason?: string; assignedToUserId?: string; scheduledDeliveryAt?: string },
  ) {
    if (to === 'DELIVERED') {
      throw new BadRequestException('Use the deliver endpoint — delivery creates the box');
    }
    const request = await this.getRequest(id);
    const from = (request as { status: BoxRequestStatus }).status;
    if (!canTransitionRequest(from, to)) {
      throw new BadRequestException(`Cannot move request from ${from} to ${to}`);
    }
    if (to === 'REJECTED' && !payload?.reason) {
      throw new BadRequestException('Rejection requires a reason');
    }
    if (to === 'ASSIGNED' && !payload?.assignedToUserId) {
      throw new BadRequestException('Assignment requires assignedToUserId');
    }

    const updated = await this.prisma.boxRequest.update({
      where: { id },
      data: {
        status: to,
        ...(to === 'UNDER_REVIEW' ? { reviewedBy: actor.userId } : {}),
        ...(to === 'REJECTED' ? { rejectionReason: payload?.reason } : {}),
        ...(to === 'ASSIGNED'
          ? {
              assignedToUserId: payload?.assignedToUserId,
              scheduledDeliveryAt: payload?.scheduledDeliveryAt
                ? new Date(payload.scheduledDeliveryAt)
                : undefined,
            }
          : {}),
      },
    });
    await this.audit.log({
      userId: actor.userId,
      action: to === 'REJECTED' || to === 'CANCELLED' ? 'REJECT' : 'UPDATE',
      module: 'boxes',
      entityType: 'BoxRequest',
      entityId: id,
      oldValue: { status: from },
      newValue: { status: to, ...payload },
    });
    return updated;
  }

  /**
   * ADR-027 §5: delivery is ONE database transaction — request → DELIVERED and
   * the CollectionBox created and linked. Never a "تم" without a box.
   */
  async deliver(
    id: string,
    actor: Actor,
    payload?: { collectorPersonId?: string; notes?: string },
  ) {
    const request = await this.getRequest(id);
    const r = request as {
      status: BoxRequestStatus;
      personId: string;
      governorate: string | null;
      district: string | null;
      addressDetails: string | null;
      boxId: string | null;
    };
    if (r.boxId) throw new ConflictException('Request already has a box');
    if (!canTransitionRequest(r.status, 'DELIVERED')) {
      throw new BadRequestException(`Cannot deliver a request in status ${r.status}`);
    }

    const result = await this.prisma.$transaction(async (txc: Prisma.TransactionClient) => {
      const box = await txc.collectionBox.create({
        data: {
          code: generateBoxCode(Date.now() % 100000),
          ownerPersonId: r.personId,
          governorate: r.governorate,
          district: r.district,
          addressDetails: r.addressDetails,
          collectorPersonId: payload?.collectorPersonId,
          deliveredAt: new Date(),
          notes: payload?.notes,
          createdBy: actor.userId,
        },
      });
      // Rewrite the code with the real sequential number for printing/QR.
      const withCode = await txc.collectionBox.update({
        where: { id: box.id },
        data: { code: generateBoxCode(box.boxNumber) },
      });
      const updatedRequest = await txc.boxRequest.update({
        where: { id },
        data: {
          status: 'DELIVERED',
          deliveredBy: actor.userId,
          deliveredAt: new Date(),
          boxId: box.id,
        },
      });
      return { box: withCode, request: updatedRequest };
    });

    await this.audit.log({
      userId: actor.userId,
      action: 'APPROVE',
      module: 'boxes',
      entityType: 'BoxRequest',
      entityId: id,
      newValue: { status: 'DELIVERED', boxId: result.box.id, boxNumber: result.box.boxNumber },
    });
    return result;
  }

  private async getRequest(id: string) {
    const request = await this.prisma.boxRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Box request not found');
    return request;
  }

  // ── boxes ──

  async findBoxes(status: BoxStatus | undefined, limit = 25, offset = 0) {
    const take = Math.min(limit, 100);
    const where = status ? { status } : {};
    const [items, total] = await Promise.all([
      this.prisma.collectionBox.findMany({
        where,
        orderBy: { boxNumber: 'desc' },
        take,
        skip: offset,
      }),
      this.prisma.collectionBox.count({ where }),
    ]);
    const boxes = items as { id: string; ownerPersonId: string }[];
    const [people, sums] = await Promise.all([
      this.prisma.person.findMany({
        where: { id: { in: [...new Set(boxes.map((b) => b.ownerPersonId))] } },
        select: { id: true, fullName: true },
      }),
      this.prisma.boxCollection.groupBy({
        by: ['boxId'],
        where: { boxId: { in: boxes.map((b) => b.id) } },
        _sum: { amountIqd: true },
        _count: { _all: true },
      }),
    ]);
    const nameById = new Map((people as { id: string; fullName: string }[]).map((p) => [p.id, p.fullName]));
    const sumByBox = new Map(
      (sums as { boxId: string; _sum: { amountIqd: unknown }; _count: { _all: number } }[]).map(
        (s) => [s.boxId, { total: Number(s._sum.amountIqd ?? 0), count: s._count._all }],
      ),
    );
    return {
      items: (items as Record<string, unknown>[]).map((b) => ({
        ...b,
        ownerName: nameById.get(b.ownerPersonId as string) ?? null,
        totalCollectedIqd: sumByBox.get(b.id as string)?.total ?? 0,
        collectionCount: sumByBox.get(b.id as string)?.count ?? 0,
      })),
      total,
      limit: take,
      offset,
    };
  }

  async setBoxStatus(id: string, status: BoxStatus, actor: Actor, reason?: string) {
    const box = await this.prisma.collectionBox.findUnique({ where: { id } });
    if (!box) throw new NotFoundException('Box not found');
    const updated = await this.prisma.collectionBox.update({
      where: { id },
      data: { status, ...(reason ? { notes: reason } : {}) },
    });
    await this.audit.log({
      userId: actor.userId,
      action: 'UPDATE',
      module: 'boxes',
      entityType: 'CollectionBox',
      entityId: id,
      oldValue: { status: (box as { status: string }).status },
      newValue: { status, reason: reason ?? null },
    });
    return updated;
  }

  // ── collections ──

  /** Records a collected amount and posts it as INCOME (cash → 4200). */
  async recordCollection(boxId: string, dto: RecordCollectionDto, actor: Actor) {
    if (dto.idempotencyKey) {
      const existing = await this.prisma.boxCollection.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) return existing;
    }
    const box = await this.prisma.collectionBox.findUnique({ where: { id: boxId } });
    if (!box) throw new NotFoundException('Box not found');
    if ((box as { status: string }).status !== 'ACTIVE') {
      throw new BadRequestException('Collections are recorded on ACTIVE boxes only');
    }
    if (dto.amountIqd <= 0) throw new BadRequestException('Amount must be positive');

    const [cash, revenue, generalFund] = await Promise.all([
      this.prisma.account.findUnique({ where: { code: '1000' }, select: { id: true } }),
      this.prisma.account.findUnique({ where: { code: '4200' }, select: { id: true } }),
      this.prisma.fund.findUnique({ where: { code: 'GENERAL' }, select: { id: true } }),
    ]);
    if (!cash || !revenue || !generalFund) {
      throw new BadRequestException('Chart of accounts is not seeded (1000/4200/GENERAL)');
    }

    const b = box as { boxNumber: number; ownerPersonId: string };
    const tx = await this.finance.create(
      {
        type: 'INCOME',
        description: `Box collection — box #${b.boxNumber}`,
        currency: 'IQD',
        amountOriginal: dto.amountIqd,
        fundId: (generalFund as { id: string }).id,
        personId: b.ownerPersonId,
        paymentMethod: 'CASH',
        sourceSystem: (dto.sourceSystem ?? 'ERP') as never,
        linkedEntityType: 'BoxCollection',
        entries: [
          { accountId: (cash as { id: string }).id, debitIqd: dto.amountIqd, creditIqd: 0 },
          { accountId: (revenue as { id: string }).id, debitIqd: 0, creditIqd: dto.amountIqd },
        ],
      } as never,
      actor,
    );

    const collection = await this.prisma.boxCollection.create({
      data: {
        boxId,
        amountIqd: dto.amountIqd,
        collectedAt: dto.collectedAt ? new Date(dto.collectedAt) : new Date(),
        collectorUserId: actor.userId,
        notes: dto.notes,
        transactionId: (tx as { id: string }).id,
        sourceSystem: dto.sourceSystem ?? 'ERP',
        externalId: dto.externalId,
        idempotencyKey: dto.idempotencyKey,
        createdBy: actor.userId,
      },
    });
    await this.audit.log({
      userId: actor.userId,
      action: 'CREATE',
      module: 'boxes',
      entityType: 'BoxCollection',
      entityId: (collection as { id: string }).id,
      newValue: { boxId, amountIqd: dto.amountIqd, transactionId: (tx as { id: string }).id },
    });
    return collection;
  }

  async boxCollections(boxId: string) {
    await this.findBox(boxId);
    return this.prisma.boxCollection.findMany({
      where: { boxId },
      orderBy: { collectedAt: 'desc' },
      take: 100,
    });
  }

  private async findBox(id: string) {
    const box = await this.prisma.collectionBox.findUnique({ where: { id } });
    if (!box) throw new NotFoundException('Box not found');
    return box;
  }

  // ── summary (FRS-005 dashboard) ──

  async summary() {
    const [byRequestStatus, boxesByStatus, totals] = await Promise.all([
      this.prisma.boxRequest.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.collectionBox.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.boxCollection.aggregate({ _sum: { amountIqd: true }, _count: { _all: true } }),
    ]);
    return {
      requestsByStatus: Object.fromEntries(
        (byRequestStatus as { status: string; _count: { _all: number } }[]).map((s) => [
          s.status,
          s._count._all,
        ]),
      ),
      boxesByStatus: Object.fromEntries(
        (boxesByStatus as { status: string; _count: { _all: number } }[]).map((s) => [
          s.status,
          s._count._all,
        ]),
      ),
      totalCollectedIqd: Number(
        (totals as { _sum: { amountIqd: unknown } })._sum.amountIqd ?? 0,
      ),
      totalCollections: (totals as { _count: { _all: number } })._count._all,
    };
  }
}
