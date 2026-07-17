import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class CheckDuplicatesDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nationalId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contactValues?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string;
}
