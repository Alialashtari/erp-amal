import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { CrmModule } from '../crm/crm.module';
import { VolunteersController } from './volunteers.controller';
import { VolunteersService } from './volunteers.service';

/**
 * Volunteers module (Phase 6, FRS-008 volunteer scope; employees/HR deferred).
 * Owner of VolunteerProfile, Team, TeamMember, VolunteerHours,
 * VolunteerEvaluation (Data Ownership Model §3). Recruitment runs on the
 * workflow engine; DEPARTMENT-scoped supervisors see their teams (ADR-016).
 */
@Module({
  imports: [AuthorizationModule, CrmModule],
  controllers: [VolunteersController],
  providers: [VolunteersService],
  exports: [VolunteersService],
})
export class VolunteersModule {}
