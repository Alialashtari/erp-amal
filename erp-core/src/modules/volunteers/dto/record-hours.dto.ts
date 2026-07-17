import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
} from 'class-validator';

export class RecordHoursDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsDateString()
  workDate!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(24)
  hours!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
