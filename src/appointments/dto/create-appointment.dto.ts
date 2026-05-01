import {
  IsString,
  IsUUID,
  IsOptional,
  IsBoolean,
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

  @IsBoolean()
  @IsOptional()
  isEmergency?: boolean;
}