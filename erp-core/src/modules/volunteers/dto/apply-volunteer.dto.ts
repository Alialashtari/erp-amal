import { IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ApplyVolunteerDto {
  @IsUUID()
  personId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  skills?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  interests?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  availability?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  emergencyContact?: string;
}
