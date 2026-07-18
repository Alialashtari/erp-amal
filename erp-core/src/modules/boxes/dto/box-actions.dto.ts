import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { BoxRequestStatus, BoxStatus } from '@prisma/client';

export class TransitionRequestDto {
  @IsEnum(BoxRequestStatus)
  status!: BoxRequestStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  @IsOptional()
  @IsDateString()
  scheduledDeliveryAt?: string;
}

export class DeliverRequestDto {
  @IsOptional()
  @IsUUID()
  collectorPersonId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class SetBoxStatusDto {
  @IsEnum(BoxStatus)
  status!: BoxStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
