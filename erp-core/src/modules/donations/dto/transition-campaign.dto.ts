import { IsEnum } from 'class-validator';
import { CampaignStatus } from '@prisma/client';

export class TransitionCampaignDto {
  @IsEnum(CampaignStatus)
  status!: CampaignStatus;
}
