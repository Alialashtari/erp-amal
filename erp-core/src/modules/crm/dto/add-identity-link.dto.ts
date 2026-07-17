import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { SourceSystem } from '@prisma/client';

export class AddIdentityLinkDto {
  @IsEnum(SourceSystem)
  sourceSystem!: SourceSystem;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  externalUserId!: string;
}
