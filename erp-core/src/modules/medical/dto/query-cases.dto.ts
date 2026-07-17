import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { CasePriority, MedicalCaseStatus, MedicalCaseType } from '@prisma/client';

export class QueryCasesDto {
  @IsOptional()
  @IsEnum(MedicalCaseStatus)
  status?: MedicalCaseStatus;

  @IsOptional()
  @IsEnum(CasePriority)
  priority?: CasePriority;

  @IsOptional()
  @IsEnum(MedicalCaseType)
  type?: MedicalCaseType;

  @IsOptional()
  @IsUUID()
  patientPersonId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
