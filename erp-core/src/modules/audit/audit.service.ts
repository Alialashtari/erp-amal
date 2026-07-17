import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  userId?: string | null;
  action:
    | 'CREATE'
    | 'UPDATE'
    | 'DELETE'
    | 'APPROVE'
    | 'REJECT'
    | 'EXPORT'
    | 'LOGIN'
    | 'LOGIN_FAILED'
    | 'LOGOUT'
    | 'TOKEN_REFRESH'
    | 'PASSWORD_CHANGE'
    | 'PERMISSION_CHANGE'
    | 'ARCHIVE';
  module: string;
  entityType?: string;
  entityId?: string;
  oldValue?: Prisma.InputJsonValue;
  newValue?: Prisma.InputJsonValue;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

/**
 * Append-only audit writer. There is intentionally NO update or delete method
 * (Constitution Art. 6.3: audit records are immutable).
 * Audit writes must never break the business operation: failures are logged and alerted.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: { ...entry } });
    } catch (error) {
      // An audit failure is a serious operational event but must not corrupt the business flow.
      this.logger.error(`AUDIT WRITE FAILED: ${JSON.stringify(entry)}`, error as Error);
    }
  }
}
