import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateProgramDto {
  @IsString()
  @Matches(/^[A-Z0-9_-]{2,20}$/, { message: 'Program code must be uppercase alphanumeric' })
  code!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameAr?: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;
}
