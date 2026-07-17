import { IsIn } from 'class-validator';

export class SetRecurringStatusDto {
  @IsIn(['ACTIVE', 'PAUSED', 'CANCELLED'])
  status!: 'ACTIVE' | 'PAUSED' | 'CANCELLED';
}
