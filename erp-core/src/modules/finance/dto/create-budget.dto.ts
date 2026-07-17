import { IsDateString } from 'class-validator';
import { CreateBudgetDtoBase } from './structure.dtos';

export class CreateBudgetDto extends CreateBudgetDtoBase {
  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;
}
