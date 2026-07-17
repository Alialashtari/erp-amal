import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod, SourceSystem, TransactionType } from '@prisma/client';

export class LedgerLineDto {
  @IsUUID()
  accountId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  debitIqd!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  creditIqd!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  memo?: string;
}

export class CreateTransactionDto {
  @IsEnum(TransactionType)
  type!: TransactionType;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsDateString()
  transactionDate?: string;

  /** ISO 4217 code; base currency IQD (ADR-019). */
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amountOriginal!: number;

  /** Required when currency != IQD (ADR-019). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  exchangeRate?: number;

  @IsUUID()
  fundId!: string;

  /** TRANSFER destination fund. */
  @IsOptional()
  @IsUUID()
  toFundId?: string;

  @IsOptional()
  @IsUUID()
  costCenterId?: string;

  @IsOptional()
  @IsUUID()
  personId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;

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

  @IsOptional()
  @IsString()
  @MaxLength(100)
  linkedEntityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  linkedEntityId?: string;

  /** Double-entry lines; must balance and equal the IQD amount (ADR-011). */
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => LedgerLineDto)
  entries!: LedgerLineDto[];
}
