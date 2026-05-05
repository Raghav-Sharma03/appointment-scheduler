import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  bookAppointment(@Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.bookAppointment(dto);
  }

  @Get('next-available/:doctorId')
  getNextAvailableSlot(@Param('doctorId') doctorId: string) {
    return this.appointmentsService.getNextAvailableSlot(doctorId);
  }

  @Get('summary/:doctorId')
  getDailySummary(
    @Param('doctorId') doctorId: string,
    @Query('date') date: string,
  ) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    return this.appointmentsService.getDailySummary(doctorId, targetDate);
  }

  @Get('doctor/:doctorId')
  @UseGuards(JwtAuthGuard)
  getAppointmentsByDoctor(@Param('doctorId') doctorId: string) {
    return this.appointmentsService.getAppointmentsByDoctor(doctorId);
  }

  @Get('available-slots/:doctorId')
  getAvailableSlotsForDate(
    @Param('doctorId') doctorId: string,
    @Query('date') date: string,
  ) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    return this.appointmentsService.getAvailableSlotsForDate(
      doctorId,
      targetDate,
    );
  }

  @Patch(':id/cancel')
  cancelAppointment(@Param('id') id: string) {
    return this.appointmentsService.cancelAppointment(id);
  }
}