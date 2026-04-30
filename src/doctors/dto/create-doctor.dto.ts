import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';

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

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}