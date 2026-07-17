import { IsUUID } from 'class-validator';

export class LinkPersonDto {
  @IsUUID()
  personId!: string;
}
