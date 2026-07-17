import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateTeamDto {
  @IsString()
  @Matches(/^[A-Z0-9_-]{2,20}$/, { message: 'Team code must be uppercase alphanumeric' })
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @IsOptional()
  @IsUUID()
  leaderPersonId?: string;
}
