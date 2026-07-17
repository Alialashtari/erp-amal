import { Injectable } from '@nestjs/common';
import { SourceSystem } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { guestDonorName } from './donation-rules';

export interface DonorInput {
  personId?: string;
  externalUserId?: string; // identity link in the source system
  phone?: string;
  email?: string;
  donorName?: string;
  sourceSystem: SourceSystem;
  actorId: string;
}

/**
 * Donor → Person resolution (ADR-021). Order:
 * explicit personId → identity link → verified contact match → new guest Person.
 * A donation can never exist without a Person. Guest Persons carry provenance
 * and the DONOR role; consolidation happens later via the CRM merge workflow.
 */
@Injectable()
export class DonorResolutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async resolve(input: DonorInput): Promise<{ personId: string; created: boolean }> {
    // 1. Explicit person
    if (input.personId) {
      const person = await this.prisma.person.findUnique({
        where: { id: input.personId },
        select: { id: true, status: true, mergedIntoId: true },
      });
      if (person) {
        const p = person as { id: string; status: string; mergedIntoId: string | null };
        // Follow merge pointer to the primary profile.
        const resolved = p.status === 'MERGED' && p.mergedIntoId ? p.mergedIntoId : p.id;
        await this.ensureDonorRole(resolved, input.actorId);
        return { personId: resolved, created: false };
      }
    }

    // 2. Identity link (source system user)
    if (input.externalUserId) {
      const link = await this.prisma.personIdentityLink.findUnique({
        where: {
          sourceSystem_externalUserId: {
            sourceSystem: input.sourceSystem,
            externalUserId: input.externalUserId,
          },
        },
        select: { personId: true },
      });
      if (link) {
        const personId = (link as { personId: string }).personId;
        await this.ensureDonorRole(personId, input.actorId);
        return { personId, created: false };
      }
    }

    // 3. Verified contact match (single unambiguous person only)
    const contactValues = [input.phone, input.email].filter((v): v is string => Boolean(v));
    if (contactValues.length > 0) {
      const matches = (await this.prisma.contactInfo.findMany({
        where: { value: { in: contactValues }, verified: true, person: { status: 'ACTIVE' } },
        select: { personId: true },
        distinct: ['personId'],
      })) as { personId: string }[];
      const uniquePersons = [...new Set(matches.map((m) => m.personId))];
      if (uniquePersons.length === 1) {
        await this.ensureDonorRole(uniquePersons[0], input.actorId);
        return { personId: uniquePersons[0], created: false };
      }
      // 0 or >1 matches: fall through to guest creation (never auto-merge, ADR-021 §3).
    }

    // 4. Lightweight guest Person (ADR-021 minimum fields)
    const person = await this.prisma.person.create({
      data: {
        fullName: guestDonorName(input.donorName),
        sourceSystem: input.sourceSystem,
        createdBy: input.actorId,
        notes: 'Auto-created guest donor (ADR-021)',
        personRoles: { create: [{ roleType: 'DONOR', assignedBy: input.actorId }] },
        ...(contactValues.length > 0
          ? {
              contacts: {
                create: [
                  ...(input.phone ? [{ type: 'PHONE' as const, value: input.phone }] : []),
                  ...(input.email ? [{ type: 'EMAIL' as const, value: input.email }] : []),
                ],
              },
            }
          : {}),
        ...(input.externalUserId
          ? {
              identityLinks: {
                create: [
                  {
                    sourceSystem: input.sourceSystem,
                    externalUserId: input.externalUserId,
                    createdBy: input.actorId,
                  },
                ],
              },
            }
          : {}),
      },
    });

    await this.audit.log({
      userId: input.actorId,
      action: 'CREATE',
      module: 'donations',
      entityType: 'Person',
      entityId: person.id,
      newValue: { guestDonor: true, sourceSystem: input.sourceSystem },
    });
    return { personId: person.id, created: true };
  }

  private async ensureDonorRole(personId: string, actorId: string): Promise<void> {
    await this.prisma.personRole.upsert({
      where: { personId_roleType: { personId, roleType: 'DONOR' } },
      create: { personId, roleType: 'DONOR', assignedBy: actorId },
      update: { active: true },
    });
  }
}
