import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateContentDto } from './create-content.dto';

/** Type is fixed at creation; everything else is editable (new revision). */
export class UpdateContentDto extends PartialType(OmitType(CreateContentDto, ['type'] as const)) {}
