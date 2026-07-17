import { IsEnum } from 'class-validator';
import { ContentStatus } from '@prisma/client';

export class TransitionContentDto {
  @IsEnum(ContentStatus)
  status!: ContentStatus;
}
