import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { CrmModule } from '../crm/crm.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { CertificatesService } from './certificates.service';

/**
 * Projects & Programs module (Phase 6, FRS-007). Owner of Program, Project,
 * Activity, ProjectTask, Participant, AttendanceRecord, Certificate
 * (Data Ownership Model §3). Financials derive from ledger links; participants
 * are CRM Persons; PROJECT-scoped staff see only their projects (ADR-016).
 */
@Module({
  imports: [AuthorizationModule, CrmModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, CertificatesService],
  exports: [ProjectsService, CertificatesService],
})
export class ProjectsModule {}
