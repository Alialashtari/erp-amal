import { ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class AssignWorkDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  subscriptionIds!: string[];
}
