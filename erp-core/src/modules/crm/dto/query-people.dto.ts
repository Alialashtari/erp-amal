import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PersonRoleType, PersonStatus } from '@prisma/client';

export class QueryPeopleDto {
  /** Name, phone, email, national id, or person number. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsEnum(PersonStatus)
  status?: PersonStatus;

  @IsOptional()
  @IsEnum(PersonRoleType)
  roleType?: PersonRoleType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  governorate?: string;

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
