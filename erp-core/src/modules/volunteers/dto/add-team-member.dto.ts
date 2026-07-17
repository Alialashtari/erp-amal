import { IsUUID } from 'class-validator';

export class AddTeamMemberDto {
  @IsUUID()
  volunteerId!: string;
}
