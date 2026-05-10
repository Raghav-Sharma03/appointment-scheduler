import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment, AppointmentStatus } from './appointment.entity';
import { DoctorsService } from '../doctors/doctors.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { AvailabilityType } from '../doctors/doctor-availability.entity';

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectRepository(Appointment)
    private appointmentsRepository: Repository<Appointment>,
    private doctorsService: DoctorsService,
  ) {}

  // ─────────────────────────────────────────────────────────
  // MAIN: BOOK APPOINTMENT
  // ─────────────────────────────────────────────────────────
  async bookAppointment(dto: CreateAppointmentDto) {
    const doctor = await this.doctorsService.getDoctorById(dto.doctorId);

    if (!doctor.availability || doctor.availability.length === 0) {
      throw new BadRequestException(
        'This doctor has no availability configured.',
      );
    }

    // Prevent duplicate booking
    const existingBooking = await this.appointmentsRepository.findOne({
      where: {
        doctor: { id: dto.doctorId },
        patientPhone: dto.patientPhone,
        status: AppointmentStatus.BOOKED,
      },
    });

    if (existingBooking) {
      throw new BadRequestException(
        `You already have an active appointment on ${existingBooking.appointmentDate} at ${existingBooking.slotTime} (Token #${existingBooking.tokenNumber}). Please cancel it before booking a new one.`,
      );
    }

    // If patient has preferred date and time
    if (dto.preferredDate && dto.preferredTime) {
      return this.bookWithPreference(dto, doctor);
    }

    // Auto booking — find next available slot
    const result = await this.findNextAvailableSlot(doctor, 7);

    if (!result) {
      throw new BadRequestException(
        'No appointments available in the next 7 days. Please try after sometime.',
      );
    }

    const appointment = this.appointmentsRepository.create({
      doctor,
      patientPhone: dto.patientPhone,
      patientName: dto.patientName,
      reason: dto.reason,
      appointmentDate: result.date,
      slotTime: result.slotTime,
      tokenNumber: result.tokenNumber,
      status: AppointmentStatus.BOOKED,
    });

    const saved = await this.appointmentsRepository.save(appointment);

    return {
      success: true,
      message: this.buildMessage(result),
      appointment: {
        id: saved.id,
        doctorName: doctor.name,
        specialization: doctor.specialization,
        schedulingType: result.schedulingType,
        sessionType: result.sessionType,
        patientPhone: saved.patientPhone,
        patientName: saved.patientName,
        appointmentDate: saved.appointmentDate,
        reportingTime: saved.slotTime,
        tokenNumber: saved.tokenNumber,
        status: saved.status,
        reason: saved.reason,
      },
      scenarioInfo: result.scenario,
    };
  }

  // ─────────────────────────────────────────────────────────
  // FIND NEXT AVAILABLE SLOT (handles both recurring + non-recurring)
  // ─────────────────────────────────────────────────────────
  private async findNextAvailableSlot(doctor: any, maxDays: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < maxDays; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() + i);
      const dayOfWeek = checkDate.getDay();
      const dateString = this.formatLocalDate(checkDate);

      // Get all sessions available on this date
      const sessions = this.getSessionsForDate(
        doctor.availability,
        dayOfWeek,
        dateString,
      );

      if (sessions.length === 0) continue;

      // Check each session for available slots
      for (const session of sessions) {
        const totalSlots = this.calcSessionSlots(session);

        const bookedCount = await this.appointmentsRepository.count({
          where: {
            doctor: { id: doctor.id },
            appointmentDate: dateString,
            slotTime: this.getSessionSlotRange(session),
            status: AppointmentStatus.BOOKED,
          },
        });

        // Count booked appointments within this session's time range
        const sessionBookedCount = await this.countBookedInSession(
          doctor.id,
          dateString,
          session,
        );

        if (sessionBookedCount < totalSlots) {
          const tokenNumber = sessionBookedCount + 1;
          const slotTime = this.calcSlotTime(
            session.startTime,
            tokenNumber,
            session.durationMins,
          );
          const scenario = this.detectScenario(i, today);
          return {
            date: dateString,
            slotTime,
            tokenNumber,
            scenario,
            daysAhead: i,
            schedulingType: session.schedulingType,
            sessionType: session.type,
          };
        }
      }
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────
  // GET SESSIONS FOR A SPECIFIC DATE
  // ─────────────────────────────────────────────────────────
  private getSessionsForDate(
    availability: any[],
    dayOfWeek: number,
    date: string,
  ) {
    const sessions: any[] = [];

    // Recurring sessions for this day
    const recurring = availability.filter(
      (a) =>
        a.type === AvailabilityType.RECURRING &&
        a.dayOfWeek === dayOfWeek &&
        a.isActive,
    );
    sessions.push(...recurring);

    // Non-recurring sessions for this specific date (adds on top)
    const nonRecurring = availability.filter(
      (a) =>
        a.type === AvailabilityType.NON_RECURRING &&
        a.specificDate === date &&
        a.isActive,
    );
    sessions.push(...nonRecurring);

    return sessions;
  }

  // ─────────────────────────────────────────────────────────
  // COUNT BOOKED APPOINTMENTS WITHIN A SESSION TIME RANGE
  // ─────────────────────────────────────────────────────────
  private async countBookedInSession(
    doctorId: string,
    date: string,
    session: any,
  ): Promise<number> {
    const allBooked = await this.appointmentsRepository.find({
      where: {
        doctor: { id: doctorId },
        appointmentDate: date,
        status: AppointmentStatus.BOOKED,
      },
    });

    const [sh, sm] = session.startTime.split(':').map(Number);
    const [eh, em] = session.endTime.split(':').map(Number);
    const sessionStart = sh * 60 + sm;
    const sessionEnd = eh * 60 + em;

    return allBooked.filter((apt) => {
      const [ah, am] = apt.slotTime.split(':').map(Number);
      const aptMins = ah * 60 + am;
      return aptMins >= sessionStart && aptMins < sessionEnd;
    }).length;
  }

  // ─────────────────────────────────────────────────────────
  // BOOK WITH PATIENT PREFERENCE
  // ─────────────────────────────────────────────────────────
  private async bookWithPreference(dto: CreateAppointmentDto, doctor: any) {
    const preferredDate = dto.preferredDate!;
    const preferredTime = dto.preferredTime!;

    const checkDate = new Date(preferredDate + 'T00:00:00');
    const dayOfWeek = checkDate.getDay();

    const sessions = this.getSessionsForDate(
      doctor.availability,
      dayOfWeek,
      preferredDate,
    );

    if (sessions.length === 0) {
      const nextSlot = await this.findNextAvailableSlot(doctor, 7);
      if (!nextSlot) {
        throw new BadRequestException(
          `Doctor is not available on ${preferredDate}. No slots found in next 7 days.`,
        );
      }
      return this.buildNotAvailableResponse(
        dto,
        doctor,
        preferredDate,
        `Doctor does not work on this day`,
        nextSlot,
      );
    }

    const [ph, pm] = preferredTime.split(':').map(Number);
    const preferredMins = ph * 60 + pm;

    // Find which session the preferred time falls into
    const matchingSession = sessions.find((s) => {
      const [sh, sm] = s.startTime.split(':').map(Number);
      const [eh, em] = s.endTime.split(':').map(Number);
      return preferredMins >= sh * 60 + sm && preferredMins < eh * 60 + em;
    });

    if (!matchingSession) {
      const nextSlot = await this.findNextAvailableSlot(doctor, 7);
      return this.buildNotAvailableResponse(
        dto,
        doctor,
        preferredDate,
        `Preferred time ${preferredTime} is outside all working sessions`,
        nextSlot,
      );
    }

    const [sh, sm] = matchingSession.startTime.split(':').map(Number);
    const startMins = sh * 60 + sm;
    const slotIndex = Math.floor(
      (preferredMins - startMins) / matchingSession.durationMins,
    );
    const tokenNumber = slotIndex + 1;
    const totalSlots = this.calcSessionSlots(matchingSession);

    if (tokenNumber > totalSlots) {
      const nextSlot = await this.findNextAvailableSlot(doctor, 7);
      return this.buildNotAvailableResponse(
        dto,
        doctor,
        preferredDate,
        `No slot available at ${preferredTime}`,
        nextSlot,
      );
    }

    // Check if this slot is already booked
    const existingAtSlot = await this.appointmentsRepository.findOne({
      where: {
        doctor: { id: doctor.id },
        appointmentDate: preferredDate,
        slotTime: preferredTime,
        status: AppointmentStatus.BOOKED,
      },
    });

    if (existingAtSlot) {
      const nextSlot = await this.findNextAvailableSlot(doctor, 7);
      return this.buildNotAvailableResponse(
        dto,
        doctor,
        preferredDate,
        `Slot at ${preferredTime} on ${preferredDate} is already booked`,
        nextSlot,
      );
    }

    // Slot is FREE — book it
    const appointment = this.appointmentsRepository.create({
      doctor,
      patientPhone: dto.patientPhone,
      patientName: dto.patientName,
      reason: dto.reason,
      appointmentDate: preferredDate,
      slotTime: preferredTime,
      tokenNumber,
      status: AppointmentStatus.BOOKED,
    });

    const saved = await this.appointmentsRepository.save(appointment);

    return {
      success: true,
      message: `Appointment confirmed on ${preferredDate} at ${preferredTime}. Token #${tokenNumber}`,
      appointment: {
        id: saved.id,
        doctorName: doctor.name,
        specialization: doctor.specialization,
        schedulingType: matchingSession.schedulingType,
        sessionType: matchingSession.type,
        patientPhone: saved.patientPhone,
        patientName: saved.patientName,
        appointmentDate: saved.appointmentDate,
        reportingTime: saved.slotTime,
        tokenNumber: saved.tokenNumber,
        status: saved.status,
        reason: saved.reason,
      },
      bookedOnPreference: true,
    };
  }

  // ─────────────────────────────────────────────────────────
  // CANCEL APPOINTMENT
  // ─────────────────────────────────────────────────────────
  async cancelAppointment(appointmentId: string) {
    const appointment = await this.appointmentsRepository.findOne({
      where: { id: appointmentId },
      relations: ['doctor'],
    });

    if (!appointment) {
      throw new NotFoundException(
        `Appointment with ID "${appointmentId}" not found`,
      );
    }

    if (appointment.status === AppointmentStatus.CANCELLED) {
      throw new BadRequestException('This appointment is already cancelled.');
    }

    if (appointment.status === AppointmentStatus.COMPLETED) {
      throw new BadRequestException(
        'Completed appointments cannot be cancelled.',
      );
    }

    appointment.status = AppointmentStatus.CANCELLED;
    appointment.cancelledAt = new Date();
    await this.appointmentsRepository.save(appointment);

    return {
      success: true,
      message:
        'Appointment cancelled successfully. The slot is now available for other patients.',
      freedSlot: {
        date: appointment.appointmentDate,
        time: appointment.slotTime,
        tokenNumber: appointment.tokenNumber,
      },
    };
  }

  // ─────────────────────────────────────────────────────────
  // GET NEXT AVAILABLE SLOT
  // ─────────────────────────────────────────────────────────
  async getNextAvailableSlot(doctorId: string) {
    const doctor = await this.doctorsService.getDoctorById(doctorId);

    if (!doctor.availability || doctor.availability.length === 0) {
      throw new BadRequestException('Doctor has no availability configured.');
    }

    const result = await this.findNextAvailableSlot(doctor, 7);

    if (!result) {
      return {
        available: false,
        message: 'No appointments available in the next 7 days.',
      };
    }

    const dayName = new Date(result.date + 'T00:00:00').toLocaleDateString(
      'en-IN',
      { weekday: 'long', day: 'numeric', month: 'long' },
    );

    return {
      available: true,
      message: `Next available slot is on ${dayName} at ${result.slotTime}`,
      date: result.date,
      reportingTime: result.slotTime,
      tokenNumber: result.tokenNumber,
      daysFromToday: result.daysAhead,
      schedulingType: result.schedulingType,
      sessionType: result.sessionType,
      scenario: result.scenario,
    };
  }

  // ─────────────────────────────────────────────────────────
  // GET ALL APPOINTMENTS FOR DOCTOR
  // ─────────────────────────────────────────────────────────
  async getAppointmentsByDoctor(doctorId: string) {
    await this.doctorsService.getDoctorById(doctorId);

    const appointments = await this.appointmentsRepository.find({
      where: { doctor: { id: doctorId } },
      order: { appointmentDate: 'ASC', tokenNumber: 'ASC' },
    });

    const grouped: Record<string, any[]> = {};
    appointments.forEach((apt) => {
      const date = apt.appointmentDate;
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push({
        id: apt.id,
        tokenNumber: apt.tokenNumber,
        reportingTime: apt.slotTime,
        patientName: apt.patientName || 'Not provided',
        patientPhone: apt.patientPhone,
        status: apt.status,
        reason: apt.reason,
      });
    });

    return {
      doctorId,
      totalAppointments: appointments.length,
      activeAppointments: appointments.filter(
        (a) => a.status === AppointmentStatus.BOOKED,
      ).length,
      cancelledAppointments: appointments.filter(
        (a) => a.status === AppointmentStatus.CANCELLED,
      ).length,
      appointmentsByDate: grouped,
    };
  }

  // ─────────────────────────────────────────────────────────
  // GET DAILY SUMMARY
  // ─────────────────────────────────────────────────────────
  async getDailySummary(doctorId: string, date: string) {
    const doctor = await this.doctorsService.getDoctorById(doctorId);
    const checkDate = new Date(date + 'T00:00:00');
    const dayOfWeek = checkDate.getDay();

    const sessions = this.getSessionsForDate(
      doctor.availability,
      dayOfWeek,
      date,
    );

    if (sessions.length === 0) {
      return {
        date,
        isDoctorWorking: false,
        message: 'Doctor does not work on this day.',
      };
    }

    const totalSlots = sessions.reduce(
      (sum, s) => sum + this.calcSessionSlots(s),
      0,
    );

    const activeCount = await this.appointmentsRepository.count({
      where: {
        doctor: { id: doctorId },
        appointmentDate: date,
        status: AppointmentStatus.BOOKED,
      },
    });

    const cancelledCount = await this.appointmentsRepository.count({
      where: {
        doctor: { id: doctorId },
        appointmentDate: date,
        status: AppointmentStatus.CANCELLED,
      },
    });

    return {
      date,
      dayName: checkDate.toLocaleDateString('en-IN', { weekday: 'long' }),
      isDoctorWorking: true,
      totalSlots,
      bookedSlots: activeCount,
      cancelledSlots: cancelledCount,
      availableSlots: totalSlots - activeCount,
      isFull: activeCount >= totalSlots,
      sessions: sessions.map((s) => ({
        type: s.type,
        schedulingType: s.schedulingType,
        startTime: s.startTime,
        endTime: s.endTime,
        durationMins: s.durationMins,
        maxPatients: s.maxPatients,
      })),
    };
  }

  // ─────────────────────────────────────────────────────────
  // GET AVAILABLE SLOTS FOR DATE
  // ─────────────────────────────────────────────────────────
  async getAvailableSlotsForDate(doctorId: string, date: string) {
    const doctor = await this.doctorsService.getDoctorById(doctorId);
    const checkDate = new Date(date + 'T00:00:00');
    const dayOfWeek = checkDate.getDay();
    const dayNames = [
      'Sunday', 'Monday', 'Tuesday', 'Wednesday',
      'Thursday', 'Friday', 'Saturday',
    ];

    const sessions = this.getSessionsForDate(
      doctor.availability,
      dayOfWeek,
      date,
    );

    if (sessions.length === 0) {
      return {
        doctorName: doctor.name,
        date,
        dayName: dayNames[dayOfWeek],
        isDoctorAvailable: false,
        message: `Dr. ${doctor.name} is not available on ${dayNames[dayOfWeek]}`,
        slots: [],
      };
    }

    const bookedAppointments = await this.appointmentsRepository.find({
      where: {
        doctor: { id: doctorId },
        appointmentDate: date,
        status: AppointmentStatus.BOOKED,
      },
    });

    const allSlots: any[] = [];

    for (const session of sessions) {
      const slots = this.doctorsService.generateSlots(
        session,
        session.type,
      );

const slotsWithStatus = slots.map((slot: any) => {
  const isBooked = bookedAppointments.some(
    (apt) => apt.slotTime === slot.slotTime,
  );
  return {
    ...slot,
    status: isBooked ? 'booked' : 'available',
  };
});

      allSlots.push(...slotsWithStatus);
    }

    const availableCount = allSlots.filter(
      (s) => s.status === 'available',
    ).length;

    return {
      doctorName: doctor.name,
      specialization: doctor.specialization,
      date,
      dayName: dayNames[dayOfWeek],
      isDoctorAvailable: true,
      totalSlots: allSlots.length,
      availableSlotsCount: availableCount,
      bookedSlotsCount: allSlots.length - availableCount,
      isFull: availableCount === 0,
      slots: allSlots,
    };
  }

  // ─────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────
  private formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private calcSessionSlots(session: any): number {
    const [sh, sm] = session.startTime.split(':').map(Number);
    const [eh, em] = session.endTime.split(':').map(Number);
    const totalMins = eh * 60 + em - (sh * 60 + sm);
    return Math.min(
      session.maxPatients,
      Math.floor(totalMins / session.durationMins),
    );
  }

  private calcSlotTime(
    startTime: string,
    tokenNumber: number,
    durationMins: number,
  ): string {
    const [sh, sm] = startTime.split(':').map(Number);
    const totalMins = sh * 60 + sm + (tokenNumber - 1) * durationMins;
    return `${String(Math.floor(totalMins / 60)).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}`;
  }

  private getSessionSlotRange(session: any): string {
    return session.startTime;
  }

  private detectScenario(daysAhead: number, today: Date): string {
    if (daysAhead === 0) return 'Scenario 1: Booked today';
    if (daysAhead === 1) return 'Scenario 2: Today full, booked tomorrow';
    return `Scenario 3: Booked ${daysAhead} days ahead`;
  }

  private buildMessage(result: any): string {
    const dayName = new Date(
      result.date + 'T00:00:00',
    ).toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });

    if (result.daysAhead === 0) {
      return `Appointment booked for today. Token #${result.tokenNumber}, Reporting time: ${result.slotTime}`;
    }
    return `No slots available today. Next appointment on ${dayName}. Token #${result.tokenNumber}, Reporting time: ${result.slotTime}`;
  }
  private async buildNotAvailableResponse(
  dto: CreateAppointmentDto,
  doctor: any,
  preferredDate: string,
  reason: string,
  nextSlot: any,
) {
  return {
    success: false,
    preferredSlotAvailable: false,
    reason,
    preferredDate,
    preferredTime: dto.preferredTime,
    message: `Your preferred slot is not available. Next available appointment is on ${nextSlot.date} at ${nextSlot.slotTime}`,
    nextAvailableSlot: {
      date: nextSlot.date,
      reportingTime: nextSlot.slotTime,
      tokenNumber: nextSlot.tokenNumber,
    },
  };
}
}