import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ContactType } from '@prisma/client';

export class AddContactDto {
  @IsEnum(ContactType)
  type!: ContactType;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  value!: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsBoolean()
  verified?: boolean;
}
