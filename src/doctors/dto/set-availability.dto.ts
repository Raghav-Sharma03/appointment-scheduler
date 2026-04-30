import { IsInt, IsString, IsBoolean, IsOptional, Min, Max } from 'class-validator';

export class SetAvailabilityDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;
  // 0 = Sunday, 1 = Monday, 2 = Tuesday, 3 = Wednesday
  // 4 = Thursday, 5 = Friday, 6 = Saturday

  @IsString()
  startTime: string;
  // Format: "09:00"

  @IsString()
  endTime: string;
  // Format: "17:00"

  @IsBoolean()
  @IsOptional()
  isWorkingDay?: boolean;
}