import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetFlagDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
