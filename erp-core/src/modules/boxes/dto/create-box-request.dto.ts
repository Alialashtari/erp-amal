import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { SourceSystem } from '@prisma/client';

export class CreateBoxRequestDto {
  /** Existing Person id — or provide requesterName (+phone) for a guest. */
  @IsOptional()
  @IsUUID()
  personId?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  requesterName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  requesterPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  governorate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressDetails?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  preferredContactTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  // Provenance (Art. 4.3)
  @IsOptional()
  @IsEnum(SourceSystem)
  sourceSystem?: SourceSystem;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  externalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;
}
