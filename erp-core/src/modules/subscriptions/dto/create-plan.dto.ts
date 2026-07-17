import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { BillingCycle, PlanCategory } from '@prisma/client';

export class CreatePlanDto {
  @IsString()
  @Matches(/^[A-Z0-9_-]{2,30}$/, { message: 'Plan code must be uppercase alphanumeric' })
  code!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(PlanCategory)
  category?: PlanCategory;

  @IsEnum(BillingCycle)
  billingCycle!: BillingCycle;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amountIqd!: number;

  @IsOptional()
  @IsBoolean()
  allowCustomAmount?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  gracePeriodDays?: number;

  @IsOptional()
  @IsUUID()
  fundId?: string;

  @IsOptional()
  @IsUUID()
  imageFileId?: string;
}
