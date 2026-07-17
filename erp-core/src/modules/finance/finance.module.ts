import { Module } from '@nestjs/common';
import { CrmModule } from '../crm/crm.module';
import { FinanceController } from './finance.controller';
import { TransactionsService } from './transactions.service';
import { StructureService } from './structure.service';
import { ReportsService } from './reports.service';
import { BudgetsService } from './budgets.service';
import { ReceiptsService } from './receipts.service';
import { PdfkitRenderer } from './pdf/pdfkit.renderer';
import { PDF_RENDERER } from './pdf/pdf.tokens';

/**
 * Finance module (Phase 3) — the organization's single financial ledger
 * (Data Ownership Model §3). Double-entry, immutable (ADR-011), IQD base
 * currency with per-transaction FX (ADR-019), PDFKit receipts behind an
 * abstraction (ADR-020). Storage/Audit are global; CRM imported for timeline.
 */
@Module({
  imports: [CrmModule],
  controllers: [FinanceController],
  providers: [
    TransactionsService,
    StructureService,
    ReportsService,
    BudgetsService,
    ReceiptsService,
    { provide: PDF_RENDERER, useClass: PdfkitRenderer },
  ],
  exports: [TransactionsService, ReportsService],
})
export class FinanceModule {}
