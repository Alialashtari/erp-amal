import { IsUUID } from 'class-validator';

export class MergePersonsDto {
  /** The duplicate person whose records will be moved into the primary (path param). */
  @IsUUID()
  sourcePersonId!: string;
}
