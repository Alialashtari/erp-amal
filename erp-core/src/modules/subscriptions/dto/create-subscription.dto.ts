import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { SourceSystem } from '@prisma/client';

export class CreateSubscriptionDto {
  @IsUUID()
  personId!: string;

  @IsUUID()
  planId!: string;

  /** Only when the plan allows custom amounts. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amountIqd?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;

  /** Sponsorship beneficiary (kafala). */
  @IsOptional()
  @IsUUID()
  beneficiaryPersonId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsEnum(SourceSystem)
  sourceSystem?: SourceSystem;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;
}
