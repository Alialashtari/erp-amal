import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CampaignUpdateDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  body!: string;

  @IsOptional()
  @IsUUID()
  imageFileId?: string;
}
