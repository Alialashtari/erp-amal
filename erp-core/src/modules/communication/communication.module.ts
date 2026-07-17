import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CommunicationController } from './communication.controller';
import { CommunicationService, COMMUNICATION_QUEUE } from './communication.service';
import { CommunicationProcessor } from './communication.processor';
import { AudienceResolver } from './audience.resolver';

/**
 * Communication Center (Phase 7, FRS-009). Owner of CommunicationCampaign and
 * Announcement. Builds bulk/audience messaging and communication metrics on
 * top of the central notification engine (Phase 2): every delivery is still a
 * notification_record, so tracking, retries and logs stay unified.
 */
@Module({
  imports: [BullModule.registerQueue({ name: COMMUNICATION_QUEUE })],
  controllers: [CommunicationController],
  providers: [CommunicationService, CommunicationProcessor, AudienceResolver],
  exports: [CommunicationService],
})
export class CommunicationModule {}
