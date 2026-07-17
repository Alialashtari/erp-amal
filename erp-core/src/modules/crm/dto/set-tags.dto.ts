import { ArrayUnique, IsArray, IsString, MaxLength } from 'class-validator';

export class SetTagsDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  tags!: string[];
}
