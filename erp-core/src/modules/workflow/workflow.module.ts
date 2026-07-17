import { Global, Module } from '@nestjs/common';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';

/**
 * Reusable workflow engine (Phase 6, ADR-015). Global so any business module
 * can start instances and react to step outcomes. The engine owns workflow
 * data only; business entities remain owned by their modules (Art. 3.1).
 */
@Global()
@Module({
  controllers: [WorkflowController],
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
