import { IsIn } from 'class-validator';

export class TransitionSubscriptionDto {
  @IsIn(['ACTIVE', 'PAUSED', 'CANCELLED'])
  status!: 'ACTIVE' | 'PAUSED' | 'CANCELLED';
}
