import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsEnum,
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

  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(10)
  emergencySlotsPerSession?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}