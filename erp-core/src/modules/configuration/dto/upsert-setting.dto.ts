import { IsDefined, IsOptional, IsString, MaxLength } from 'class-validator';
import { Prisma } from '@prisma/client';

export class UpsertSettingDto {
  /** Arbitrary JSON value for the setting. */
  @IsDefined()
  value!: Prisma.InputJsonValue;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
