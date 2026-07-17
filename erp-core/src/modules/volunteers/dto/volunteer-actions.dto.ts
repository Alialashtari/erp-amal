import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ApplicationActionDto {
  @IsIn(['APPROVE', 'REJECT', 'RETURN', 'COMMENT'])
  action!: 'APPROVE' | 'REJECT' | 'RETURN' | 'COMMENT';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class TransitionVolunteerDto {
  @IsIn(['REVIEW', 'ACTIVE', 'SUSPENDED', 'INACTIVE', 'ARCHIVED'])
  status!: string;
}

export class DecideHoursDto {
  @IsBoolean()
  approve!: boolean;
}
