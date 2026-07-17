import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { CrmModule } from '../crm/crm.module';
import { FinanceModule } from '../finance/finance.module';
import { MedicalController } from './medical.controller';
import { MedicalService } from './medical.service';

/**
 * Medical module (Phase 6, FRS-006). Owner of MedicalCase and MedicalTreatment
 * (Data Ownership Model §3). Committee decisions run on the workflow engine
 * (ADR-015); funding flows through the finance ledger; documents attach via
 * the global storage module; patients are CRM Persons.
 */
@Module({
  imports: [AuthorizationModule, CrmModule, FinanceModule],
  controllers: [MedicalController],
  providers: [MedicalService],
  exports: [MedicalService],
})
export class MedicalModule {}
