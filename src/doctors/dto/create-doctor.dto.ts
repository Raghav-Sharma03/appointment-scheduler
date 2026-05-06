import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsEnum,
  Matches,
  Min,
  Max,
} from 'class-validator';
import { SchedulingType } from '../doctor.entity';

export class CreateDoctorDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  specialization?: string;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'startTime must be in HH:MM format. Example: 09:00',
  })
  startTime: string;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'endTime must be in HH:MM format. Example: 17:00',
  })
  endTime: string;

  @IsInt()
  @IsOptional()
  @Min(10)
  @Max(60)
  slotDurationMins?: number;

  @IsInt()
  @IsOptional()
  maxSlotsOverride?: number;

  @IsEnum(SchedulingType)
  @IsOptional()
  schedulingType?: SchedulingType;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}