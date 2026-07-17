import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class UploadFileDto {
  /** Owning module namespace (e.g. "crm", "medical", "finance"). */
  @IsString()
  @Matches(/^[a-z][a-z0-9_-]*$/)
  @MaxLength(50)
  module!: string;

  @IsOptional()
  @IsUUID()
  folderId?: string;

  /** Set to upload a new version of an existing file. */
  @IsOptional()
  @IsUUID()
  previousFileId?: string;
}
