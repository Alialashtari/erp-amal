import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class EvaluateDto {
  /** { commitment, attendance, quality, cooperation, initiative } — integers 1..5. */
  @IsObject()
  scores!: Record<string, number>;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  period?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comments?: string;
}
