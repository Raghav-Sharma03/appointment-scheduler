import {
  IsInt,
  IsBoolean,
  IsOptional,
  Min,
  Max,
  IsEnum,
  IsString,
  Matches,
} from 'class-validator';

export enum AvailabilityType {
  RECURRING = 'recurring',
  NON_RECURRING = 'non_recurring',
}

export enum SessionSchedulingType {
  WAVE = 'wave',
  STREAM = 'stream',
}

export class SetRecurringAvailabilityDto {
  @IsEnum(SessionSchedulingType)
  schedulingType: SessionSchedulingType;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'startTime must be in HH:MM format',
  })
  startTime: string;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'endTime must be in HH:MM format',
  })
  endTime: string;

  @IsInt()
  @Min(5)
  durationMins: number;

  @IsInt()
  @Min(1)
  maxPatients: number;

  // 0=Sunday, 1=Monday ... 6=Saturday
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class SetNonRecurringAvailabilityDto {
  @IsEnum(SessionSchedulingType)
  schedulingType: SessionSchedulingType;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'startTime must be in HH:MM format',
  })
  startTime: string;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'endTime must be in HH:MM format',
  })
  endTime: string;

  @IsInt()
  @Min(5)
  durationMins: number;

  @IsInt()
  @Min(1)
  maxPatients: number;

  // Specific date like 2026-05-11
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'specificDate must be in YYYY-MM-DD format',
  })
  specificDate: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}