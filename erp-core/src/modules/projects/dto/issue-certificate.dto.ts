import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class IssueCertificateDto {
  @IsUUID()
  personId!: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  titleAr?: string;
}
