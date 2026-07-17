import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';
import { DonationStatus, PaymentMethod, SourceSystem } from '@prisma/client';

export class CreateDonationDto {
  // ── donor resolution (ADR-021): any of the following; none → guest Person ──
  @IsOptional()
  @IsUUID()
  personId?: string;

  /** External-system user id (mobile/website), resolved through identity links. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  donorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  donorPhone?: string;

  @IsOptional()
  @IsEmail()
  donorEmail?: string;

  // ── target: campaign or explicit fund; neither → GENERAL fund ──
  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @IsOptional()
  @IsUUID()
  fundId?: string;

  // ── amount (ADR-019) ──
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amountOriginal!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  exchangeRate?: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsDateString()
  donationDate?: string;

  /** PENDING for gateway flows; COMPLETED (default) for received money. */
  @IsOptional()
  @IsIn(['PENDING', 'COMPLETED'])
  status?: DonationStatus;

  @IsOptional()
  @IsBoolean()
  isAnonymousPublic?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  // ── provenance (Art. 4.3) ──
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
