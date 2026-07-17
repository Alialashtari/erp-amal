import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class StepDefDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsString()
  @Matches(/^[a-z_]+\.[a-z_]+$/, { message: 'Permission must be <module>.<action>' })
  requiredPermission!: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  slaHours?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z_]+\.[a-z_]+$/)
  escalationPermission?: string;
}

export class UpsertDefinitionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsString()
  @Matches(/^[a-z_]+$/)
  module!: string;

  @IsString()
  @MaxLength(100)
  entityType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StepDefDto)
  steps!: StepDefDto[];
}
