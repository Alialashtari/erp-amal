import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DonationsModule } from '../donations/donations.module';
import { CommunicationModule } from '../communication/communication.module';
import { CmsController } from './cms.controller';
import { PublicCmsController } from './public-cms.controller';
import { ContentService } from './content.service';
import { CatalogService } from './catalog.service';
import { CmsProcessor, CMS_QUEUE } from './cms.processor';

/**
 * CMS module (Phase 7, FRS-010). Owner of ContentItem, ContentRevision,
 * ContentCategory, Banner, Popup, Menu/MenuItem, FeaturedCampaign
 * (Data Ownership Model §3). Everything users see on the app and website is
 * managed here and delivered through public APIs (Hub Model). Depends on:
 * donations (featured campaign details via service interface), communication
 * (publish notifications), storage (media via StoredFile ids).
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: CMS_QUEUE }),
    DonationsModule,
    CommunicationModule,
  ],
  controllers: [CmsController, PublicCmsController],
  providers: [ContentService, CatalogService, CmsProcessor],
  exports: [ContentService, CatalogService],
})
export class CmsModule implements OnModuleInit {
  constructor(@InjectQueue(CMS_QUEUE) private readonly queue: Queue) {}

  /** Registers the repeatable scheduled-publishing job (every minute). */
  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'publish-scheduled',
      {},
      {
        repeat: { pattern: '* * * * *' },
        jobId: 'cms-publish-schedule',
        removeOnComplete: 10,
        removeOnFail: 10,
      },
    );
  }
}
