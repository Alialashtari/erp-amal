import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewActionDto {
  @IsIn(['APPROVE', 'REJECT', 'RETURN', 'COMMENT'])
  action!: 'APPROVE' | 'REJECT' | 'RETURN' | 'COMMENT';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class TransitionCaseDto {
  @IsIn([
    'UNDER_REVIEW',
    'AWAITING_DOCUMENTS',
    'APPROVED',
    'FUNDING',
    'IN_TREATMENT',
    'COMPLETED',
    'REJECTED',
    'CLOSED',
  ])
  status!: string;
}
