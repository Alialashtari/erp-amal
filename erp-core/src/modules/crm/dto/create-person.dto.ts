import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Gender, PersonRoleType, SourceSystem } from '@prisma/client';
import { AddContactDto } from './add-contact.dto';
import { AddAddressDto } from './add-address.dto';

export class CreatePersonDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  fullName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  shortName?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  maritalStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nationality?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  nationalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  occupation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsEnum(SourceSystem)
  sourceSystem?: SourceSystem;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(PersonRoleType, { each: true })
  roles?: PersonRoleType[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddContactDto)
  contacts?: AddContactDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddAddressDto)
  addresses?: AddAddressDto[];

  /** Must be set to true to proceed when duplicate candidates were reported. */
  @IsOptional()
  @IsBoolean()
  confirmNotDuplicate?: boolean;
}
