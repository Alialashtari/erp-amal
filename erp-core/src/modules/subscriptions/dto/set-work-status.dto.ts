import { IsIn } from 'class-validator';

export class SetWorkStatusDto {
  @IsIn(['SCHEDULED', 'EXECUTED', 'POSTPONED', 'CANCELLED'])
  status!: 'SCHEDULED' | 'EXECUTED' | 'POSTPONED' | 'CANCELLED';
}
