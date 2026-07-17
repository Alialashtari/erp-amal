import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PeopleController } from './people.controller';
import { PeopleService } from './people.service';
import { DedupService } from './dedup.service';
import { MergeService } from './merge.service';
import { CrmTimelineService } from './timeline.service';
import { CrmScopeService } from './scope.service';

/**
 * CRM module (Phase 2). Master of Person and all person-related registry data
 * (Data Ownership Model §3). Exports CrmTimelineService so later business modules
 * (donations, medical, ...) can append person timeline events without owning them.
 */
@Module({
  imports: [AuthorizationModule],
  controllers: [PeopleController],
  providers: [PeopleService, DedupService, MergeService, CrmTimelineService, CrmScopeService],
  exports: [CrmTimelineService, PeopleService],
})
export class CrmModule {}
