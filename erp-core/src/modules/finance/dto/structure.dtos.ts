import {
  IsBoolean,
  IsEnum,
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
import { AccountType, FundType, TransactionType } from '@prisma/client';

export class CreateAccountDto {
  @IsString()
  @Matches(/^[0-9]{3,10}$/, { message: 'Account code must be numeric (3-10 digits)' })
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameAr?: string;

  @IsEnum(AccountType)
  type!: AccountType;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class CreateFundDto {
  @IsString()
  @Matches(/^[A-Z0-9_-]{2,20}$/, { message: 'Fund code must be uppercase alphanumeric' })
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameAr?: string;

  @IsOptional()
  @IsEnum(FundType)
  type?: FundType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class CreateCostCenterDto {
  @IsString()
  @Matches(/^[A-Z0-9_-]{2,20}$/, { message: 'Cost center code must be uppercase alphanumeric' })
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameAr?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class SetActiveDto {
  @IsBoolean()
  isActive!: boolean;
}

export class UpsertApprovalRuleDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsEnum(TransactionType)
  transactionType!: TransactionType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minAmountIqd!: number;

  @IsString()
  @Matches(/^finance\.[a-z_]+$/)
  requiredPermission!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class RejectTransactionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ReverseTransactionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class CreateBudgetDtoBase {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsUUID()
  fundId?: string;

  @IsOptional()
  @IsUUID()
  costCenterId?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  allocatedIqd!: number;
}
