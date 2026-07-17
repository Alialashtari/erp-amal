import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { NotificationChannel } from '@prisma/client';

export class SendNotificationDto {
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @IsOptional()
  @IsUUID()
  recipientUserId?: string;

  @IsOptional()
  @IsUUID()
  recipientPersonId?: string;

  /** Explicit channel address (email / phone / FCM token). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  recipientAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
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

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
