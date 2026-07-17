import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ParticipantRole } from '@prisma/client';

export class AddParticipantDto {
  @IsUUID()
  personId!: string;

  @IsOptional()
  @IsEnum(ParticipantRole)
  role?: ParticipantRole;
}
