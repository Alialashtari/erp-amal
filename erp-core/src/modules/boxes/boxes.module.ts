import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { BoxesController } from './boxes.controller';
import { BoxesService } from './boxes.service';

/**
 * Boxes module (ADR-027, FRS-005). Owner of BoxRequest, CollectionBox,
 * BoxCollection. Request lifecycle is a guarded state machine; delivery
 * transactionally creates the box; collections post INCOME to the ledger.
 * The collectors' Android app will talk to these APIs with a scoped
 * integration account (idempotency + provenance already enforced).
 */
@Module({
  imports: [FinanceModule],
  controllers: [BoxesController],
  providers: [BoxesService],
  exports: [BoxesService],
})
export class BoxesModule {}
