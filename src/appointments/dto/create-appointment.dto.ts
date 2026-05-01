import {
  IsString,
  IsUUID,
  IsOptional,
  IsBoolean,
  IsDateString,
  Matches,
  Length,
} from 'class-validator';

export class CreateAppointmentDto {
  @IsUUID()
  doctorId: string;

  @IsString()
  @Matches(/^[0-9]{10}$/, {
    message: 'Phone number must be exactly 10 digits (numbers only)',
  })
  patientPhone: string;

  @IsString()
  @IsOptional()
  @Length(2, 100)
  patientName?: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsDateString()
  @IsOptional()
  preferredDate?: string;
  // Format: YYYY-MM-DD example: 2026-05-04

  @IsString()
  @IsOptional()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'preferredTime must be in HH:MM format. Example: 09:00 or 14:30',
  })
  preferredTime?: string;
  // Format: HH:MM example: 09:00

  @IsBoolean()
  @IsOptional()
  isEmergency?: boolean;
}