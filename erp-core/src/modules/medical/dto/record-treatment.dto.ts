import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class RecordTreatmentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  type!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  @IsDateString()
  treatmentDate?: string;

  /** When present, a PENDING medical EXPENSE is posted (finance approval tiers). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  costIqd?: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;
}
