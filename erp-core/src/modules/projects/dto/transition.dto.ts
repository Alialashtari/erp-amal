import { IsString, Matches } from 'class-validator';

export class TransitionDto {
  @IsString()
  @Matches(/^[A-Z_]+$/)
  status!: string;
}
