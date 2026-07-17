import { IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { BaqiyatWorkType } from '@prisma/client';

export class CreateWorkDto {
  @IsEnum(BaqiyatWorkType)
  type!: BaqiyatWorkType;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
