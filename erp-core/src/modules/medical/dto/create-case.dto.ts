import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CasePriority, MedicalCaseType, SourceSystem } from '@prisma/client';

export class CreateCaseDto {
  @IsUUID()
  patientPersonId!: string;

  @IsEnum(MedicalCaseType)
  type!: MedicalCaseType;

  @IsOptional()
  @IsEnum(CasePriority)
  priority?: CasePriority;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  diagnosis?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  hospital?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  doctorName?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  requiredAmountIqd?: number;

  @IsOptional()
  @IsUUID()
  assignedOfficerId?: string;

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
