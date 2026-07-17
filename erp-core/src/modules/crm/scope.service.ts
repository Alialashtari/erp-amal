import { Injectable } from '@nestjs/common';
import { ScopingService, SCOPE_TYPES } from '../authorization/scoping.service';

/**
 * CRM data scoping (ADR-016). Since Phase 6 this delegates to the generalized
 * ScopingService (authorization module). Kept as a thin facade for backward
 * compatibility with existing CRM call sites and tests.
 */
@Injectable()
export class CrmScopeService {
  constructor(private readonly scoping: ScopingService) {}

  async personWhereForUser(userId: string): Promise<Record<string, unknown>> {
    const governorates = await this.scoping.getScopeValues(userId, SCOPE_TYPES.GOVERNORATE);
    return CrmScopeService.buildPersonWhere(governorates);
  }

  /** Pure filter builder (unit-tested). Empty list = unrestricted. */
  static buildPersonWhere(governorates: string[]): Record<string, unknown> {
    return ScopingService.personWhere(governorates);
  }
}
