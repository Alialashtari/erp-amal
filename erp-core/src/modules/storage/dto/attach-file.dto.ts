import { IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class AttachFileDto {
  @IsUUID()
  fileId!: string;

  @IsString()
  @Matches(/^[a-z][a-z0-9_-]*$/)
  @MaxLength(50)
  module!: string;

  @IsString()
  @MaxLength(100)
  entityType!: string;

  @IsString()
  @MaxLength(100)
  entityId!: string;
}
