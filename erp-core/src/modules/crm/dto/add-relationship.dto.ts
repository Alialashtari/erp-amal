import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { RelationshipType } from '@prisma/client';

export class AddRelationshipDto {
  @IsUUID()
  relatedPersonId!: string;

  @IsEnum(RelationshipType)
  type!: RelationshipType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
