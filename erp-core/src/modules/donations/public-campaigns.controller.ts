import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { CampaignsService } from './campaigns.service';

/**
 * Public campaign APIs (Build Spec Part 6 §14) consumed by the website and
 * mobile app. Exposes ACTIVE campaigns flagged for the requesting channel;
 * never exposes donor identities (ADR-021 §4) or internal financial structure.
 */
@ApiTags('public')
@Controller('public/campaigns')
export class PublicCampaignsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campaigns: CampaignsService,
  ) {}

  @Public()
  @Get()
  async list(@Query('channel') channel?: 'app' | 'website') {
    const items = (await this.prisma.campaign.findMany({
      where: {
        status: 'ACTIVE',
        ...(channel === 'app' ? { showInApp: true } : {}),
        ...(channel === 'website' ? { showInWebsite: true } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })) as { id: string }[];
    const withFinancials = await Promise.all(items.map((c) => this.campaigns.withFinancials(c)));
    return withFinancials.map((c) => this.publicView(c));
  }

  @Public()
  @Get(':id')
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    const campaign = await this.campaigns.findOne(id);
    const c = campaign as { status?: string };
    if (c.status !== 'ACTIVE' && c.status !== 'COMPLETED') {
      throw new NotFoundException('Campaign not available');
    }
    return this.publicView(campaign);
  }

  /** Whitelist of public fields — no fund ids, no creator ids, no donor data. */
  private publicView(campaign: Record<string, unknown>) {
    const f = campaign.financials as Record<string, unknown> | undefined;
    return {
      id: campaign.id,
      campaignNumber: campaign.campaignNumber,
      name: campaign.name,
      nameAr: campaign.nameAr,
      description: campaign.description,
      type: campaign.type,
      status: campaign.status,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      coverImageFileId: campaign.coverImageFileId,
      goalAmountIqd: f?.goalAmountIqd ?? null,
      raisedIqd: f?.raisedIqd ?? 0,
      progressPercent: f?.progressPercent ?? null,
      donorCount: f?.donorCount ?? 0,
      updates: campaign.updates,
    };
  }
}
