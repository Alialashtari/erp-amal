import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface DedupInput {
  nationalId?: string;
  contactValues?: string[]; // phones / emails
  fullName?: string;
}

export interface DedupCandidate {
  personId: string;
  personNumber: number;
  fullName: string;
  matchedOn: ('NATIONAL_ID' | 'CONTACT' | 'NAME')[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * Duplicate detection (FRS-001 §19; Data Ownership Model §6):
 * national id > verified contact value > exact full name.
 * Ambiguous matches are surfaced for human review — never auto-merged.
 */
@Injectable()
export class DedupService {
  constructor(private readonly prisma: PrismaService) {}

  async findCandidates(input: DedupInput, excludePersonId?: string): Promise<DedupCandidate[]> {
    const byId = new Map<string, DedupCandidate>();

    const add = (
      person: { id: string; personNumber: number; fullName: string },
      match: DedupCandidate['matchedOn'][number],
    ) => {
      if (excludePersonId && person.id === excludePersonId) return;
      const existing = byId.get(person.id);
      if (existing) {
        if (!existing.matchedOn.includes(match)) existing.matchedOn.push(match);
      } else {
        byId.set(person.id, {
          personId: person.id,
          personNumber: person.personNumber,
          fullName: person.fullName,
          matchedOn: [match],
          confidence: 'LOW',
        });
      }
    };

    if (input.nationalId) {
      const matches = (await this.prisma.person.findMany({
        where: { nationalId: input.nationalId, status: { not: 'MERGED' } },
        select: { id: true, personNumber: true, fullName: true },
      })) as { id: string; personNumber: number; fullName: string }[];
      matches.forEach((m) => add(m, 'NATIONAL_ID'));
    }

    if (input.contactValues && input.contactValues.length > 0) {
      const contacts = (await this.prisma.contactInfo.findMany({
        where: { value: { in: input.contactValues }, person: { status: { not: 'MERGED' } } },
        select: { person: { select: { id: true, personNumber: true, fullName: true } } },
      })) as { person: { id: string; personNumber: number; fullName: string } }[];
      contacts.forEach((c) => add(c.person, 'CONTACT'));
    }

    if (input.fullName) {
      const names = (await this.prisma.person.findMany({
        where: { fullName: input.fullName, status: { not: 'MERGED' } },
        select: { id: true, personNumber: true, fullName: true },
        take: 10,
      })) as { id: string; personNumber: number; fullName: string }[];
      names.forEach((n) => add(n, 'NAME'));
    }

    const candidates = [...byId.values()];
    candidates.forEach((c) => (c.confidence = DedupService.scoreConfidence(c.matchedOn)));
    return candidates.sort(
      (a, b) => DedupService.rank(b.confidence) - DedupService.rank(a.confidence),
    );
  }

  /** Pure scoring (unit-tested). */
  static scoreConfidence(matchedOn: DedupCandidate['matchedOn']): DedupCandidate['confidence'] {
    if (matchedOn.includes('NATIONAL_ID')) return 'HIGH';
    if (matchedOn.includes('CONTACT')) return matchedOn.includes('NAME') ? 'HIGH' : 'MEDIUM';
    return 'LOW';
  }

  private static rank(confidence: DedupCandidate['confidence']): number {
    return confidence === 'HIGH' ? 3 : confidence === 'MEDIUM' ? 2 : 1;
  }
}
