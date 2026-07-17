import { IsEnum, IsUUID } from 'class-validator';
import { AttendanceStatus } from '@prisma/client';

export class RecordAttendanceDto {
  @IsUUID()
  personId!: string;

  @IsEnum(AttendanceStatus)
  status!: AttendanceStatus;
}
