import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AudienceType, NotificationChannel } from '@prisma/client';

export class CreateCommCampaignDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  name!: string;

  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @IsOptional()
  @IsString()
  templateKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  body?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @IsEnum(AudienceType)
  audienceType!: AudienceType;

  @IsOptional()
  @IsObject()
  audienceFilter?: Record<string, unknown>;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
