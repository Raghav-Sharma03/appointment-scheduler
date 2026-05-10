import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { DoctorsService } from './doctors.service';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import {
  SetRecurringAvailabilityDto,
  SetNonRecurringAvailabilityDto,
} from './dto/set-availability.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('doctors')
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  createDoctor(@Body() createDoctorDto: CreateDoctorDto) {
    return this.doctorsService.createDoctor(createDoctorDto);
  }

  @Get()
  getAllDoctors() {
    return this.doctorsService.getAllDoctors();
  }

  @Get(':id')
  getDoctorById(@Param('id') id: string) {
    return this.doctorsService.getDoctorById(id);
  }

  // OLD endpoint — kept for backward compatibility
  @Post(':id/availability')
  @UseGuards(JwtAuthGuard)
  setAvailability(
    @Param('id') id: string,
    @Body() body: SetRecurringAvailabilityDto[],
  ) {
    return this.doctorsService.setRecurringAvailability(id, body);
  }

  // NEW — Recurring availability
  @Post(':id/availability/recurring')
  @UseGuards(JwtAuthGuard)
  setRecurringAvailability(
    @Param('id') id: string,
    @Body() body: SetRecurringAvailabilityDto[],
  ) {
    return this.doctorsService.setRecurringAvailability(id, body);
  }

  // NEW — Non-recurring availability
  @Post(':id/availability/non-recurring')
  @UseGuards(JwtAuthGuard)
  setNonRecurringAvailability(
    @Param('id') id: string,
    @Body() body: SetNonRecurringAvailabilityDto[],
  ) {
    return this.doctorsService.setNonRecurringAvailability(id, body);
  }

  @Get(':id/slots')
  getDoctorSlots(@Param('id') id: string) {
    return this.doctorsService.getDoctorSlots(id);
  }
}