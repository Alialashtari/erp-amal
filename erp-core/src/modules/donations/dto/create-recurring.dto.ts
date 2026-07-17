import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { PaymentMethod, RecurrenceFrequency } from '@prisma/client';

export class CreateRecurringDto {
  @IsUUID()
  personId!: string;

  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @IsOptional()
  @IsUUID()
  fundId?: string;

  @IsEnum(RecurrenceFrequency)
  frequency!: RecurrenceFrequency;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amountOriginal!: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
