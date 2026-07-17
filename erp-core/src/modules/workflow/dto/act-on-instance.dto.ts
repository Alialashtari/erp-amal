import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ActOnInstanceDto {
  @IsIn(['APPROVE', 'REJECT', 'RETURN', 'COMMENT'])
  action!: 'APPROVE' | 'REJECT' | 'RETURN' | 'COMMENT';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
