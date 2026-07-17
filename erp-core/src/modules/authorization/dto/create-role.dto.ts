import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[a-z][a-z0-9_]*$/, { message: 'Role name must be snake_case' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
