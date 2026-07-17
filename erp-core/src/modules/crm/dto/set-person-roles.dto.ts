import { ArrayUnique, IsArray, IsEnum } from 'class-validator';
import { PersonRoleType } from '@prisma/client';

export class SetPersonRolesDto {
  @IsArray()
  @ArrayUnique()
  @IsEnum(PersonRoleType, { each: true })
  roles!: PersonRoleType[];
}
