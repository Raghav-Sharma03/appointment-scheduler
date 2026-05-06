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
import { SetAvailabilityDto } from './dto/set-availability.dto';
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

  @Post(':id/availability')
  @UseGuards(JwtAuthGuard)
  setAvailability(
    @Param('id') id: string,
    @Body() availabilityDtos: SetAvailabilityDto[],
  ) {
    return this.doctorsService.setAvailability(id, availabilityDtos);
  }

  @Get(':id/slots')
  getDoctorSlots(@Param('id') id: string) {
    return this.doctorsService.getDoctorSlots(id);
  }
}