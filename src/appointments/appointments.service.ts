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
import { SchedulingType } from '../doctors/doctor.entity';

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectRepository(Appointment)
    private appointmentsRepository: Repository<Appointment>,
    private doctorsService: DoctorsService,
  ) {}

  // ─────────────────────────────────────────────────────────
  // MAIN: BOOK APPOINTMENT
  // Handles ALL scenarios + ALL scheduling types
  // ─────────────────────────────────────────────────────────
  async bookAppointment(dto: CreateAppointmentDto) {
    const doctor = await this.doctorsService.getDoctorById(dto.doctorId);

    // Check doctor has availability
    if (!doctor.availability || doctor.availability.length === 0) {
      throw new BadRequestException(
        'This doctor has no availability configured. Please contact the clinic.',
      );
    }

    // Prevent duplicate booking — same patient, same doctor
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

    // Emergency booking — reserved slots only
    if (dto.isEmergency) {
      return this.bookEmergencyAppointment(dto, doctor);
    }

    // Route to correct scheduling type
    let result: any;
    switch (doctor.schedulingType) {
      case SchedulingType.WAVE:
        result = await this.findNextWaveSlot(doctor, 7);
        break;
      case SchedulingType.MODIFIED_WAVE:
        result = await this.findNextModifiedWaveSlot(doctor, 7);
        break;
      default: // STREAM
        result = await this.findNextStreamSlot(doctor, 7);
        break;
    }

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
      message: this.buildMessage(result, doctor.schedulingType),
      appointment: {
        id: saved.id,
        doctorName: doctor.name,
        specialization: doctor.specialization,
        schedulingType: doctor.schedulingType,
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
  // STREAM SCHEDULING LOGIC
  // Each patient gets exact fixed time slot
  // ─────────────────────────────────────────────────────────
  private async findNextStreamSlot(doctor: any, maxDays: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < maxDays; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() + i);
      const dayOfWeek = checkDate.getDay();
      const dateString = this.formatLocalDate(checkDate);

      const availability = doctor.availability.find(
        (a: any) => a.dayOfWeek === dayOfWeek && a.isWorkingDay === true,
      );

      // Skip non-working days (Scenario #4)
      if (!availability) continue;

      const totalSlots = this.calcTotalSlots(doctor, availability);

      // Only count active bookings — cancelled ones free the slot (Scenario #5)
      const activeCount = await this.appointmentsRepository.count({
        where: {
          doctor: { id: doctor.id },
          appointmentDate: dateString,
          status: AppointmentStatus.BOOKED,
        },
      });

      if (activeCount < totalSlots) {
        const tokenNumber = activeCount + 1;
        const slotTime = this.calcSlotTime(
          availability.startTime,
          tokenNumber,
          doctor.slotDurationMins,
        );

        const scenario = this.detectScenario(i, doctor, today);
        return { date: dateString, slotTime, tokenNumber, scenario, daysAhead: i };
      }
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────
  // WAVE SCHEDULING LOGIC
  // Groups of 3 patients at top of each hour
  // First-come-first-served within the wave
  // ─────────────────────────────────────────────────────────
  private async findNextWaveSlot(doctor: any, maxDays: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < maxDays; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() + i);
      const dayOfWeek = checkDate.getDay();
      const dateString = this.formatLocalDate(checkDate);

      const availability = doctor.availability.find(
        (a: any) => a.dayOfWeek === dayOfWeek && a.isWorkingDay === true,
      );

      if (!availability) continue;

      const totalSlots = this.calcTotalSlots(doctor, availability);
      const patientsPerWave = 3;

      const activeCount = await this.appointmentsRepository.count({
        where: {
          doctor: { id: doctor.id },
          appointmentDate: dateString,
          status: AppointmentStatus.BOOKED,
        },
      });

      if (activeCount < totalSlots) {
        const tokenNumber = activeCount + 1;

        // Calculate which wave this patient falls into
        const waveNumber = Math.floor(activeCount / patientsPerWave);
        const [startHour, startMin] = availability.startTime
          .split(':')
          .map(Number);

        // Each wave is 30 minutes apart
        const waveMinutes =
          startHour * 60 + startMin + waveNumber * 30;
        const waveHour = Math.floor(waveMinutes / 60);
        const waveMin = waveMinutes % 60;
        const slotTime = `${String(waveHour).padStart(2, '0')}:${String(waveMin).padStart(2, '0')}`;
        const positionInWave = (activeCount % patientsPerWave) + 1;

        const scenario = this.detectScenario(i, doctor, today);
        return {
          date: dateString,
          slotTime,
          tokenNumber,
          scenario,
          daysAhead: i,
          waveInfo: `Wave ${waveNumber + 1}, Position ${positionInWave} of ${patientsPerWave}`,
        };
      }
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────
  // MODIFIED WAVE SCHEDULING LOGIC
  // 2 patients at top of hour, 1 at half-hour
  // ─────────────────────────────────────────────────────────
  private async findNextModifiedWaveSlot(doctor: any, maxDays: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < maxDays; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() + i);
      const dayOfWeek = checkDate.getDay();
      const dateString = this.formatLocalDate(checkDate);

      const availability = doctor.availability.find(
        (a: any) => a.dayOfWeek === dayOfWeek && a.isWorkingDay === true,
      );

      if (!availability) continue;

      const totalSlots = this.calcTotalSlots(doctor, availability);

      const activeCount = await this.appointmentsRepository.count({
        where: {
          doctor: { id: doctor.id },
          appointmentDate: dateString,
          status: AppointmentStatus.BOOKED,
        },
      });

      if (activeCount < totalSlots) {
        const tokenNumber = activeCount + 1;
        const [startHour, startMin] = availability.startTime
          .split(':')
          .map(Number);

        // Pattern per hour: 2 at :00, 1 at :30
        // Position in hour cycle (0-2)
        const positionInCycle = activeCount % 3;
        const cycleNumber = Math.floor(activeCount / 3);
        const baseMinutes = startHour * 60 + startMin + cycleNumber * 60;

        let slotMinutes: number;
        if (positionInCycle < 2) {
          // First 2 patients → top of the hour
          slotMinutes = baseMinutes;
        } else {
          // 3rd patient → half hour mark
          slotMinutes = baseMinutes + 30;
        }

        const slotHour = Math.floor(slotMinutes / 60);
        const slotMin = slotMinutes % 60;
        const slotTime = `${String(slotHour).padStart(2, '0')}:${String(slotMin).padStart(2, '0')}`;

        const scenario = this.detectScenario(i, doctor, today);
        return {
          date: dateString,
          slotTime,
          tokenNumber,
          scenario,
          daysAhead: i,
          cycleInfo: `Hour ${cycleNumber + 1}, Slot ${positionInCycle + 1} of 3`,
        };
      }
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────
  // EMERGENCY BOOKING
  // Uses reserved emergency slots only
  // ─────────────────────────────────────────────────────────
  private async bookEmergencyAppointment(dto: any, doctor: any) {
    if (doctor.emergencySlotsPerSession === 0) {
      throw new BadRequestException(
        'This doctor has no emergency slots reserved. Please visit the clinic directly.',
      );
    }

    const today = new Date();
    const dateString = this.formatLocalDate(today);
    const dayOfWeek = today.getDay();

    const availability = doctor.availability.find(
      (a: any) => a.dayOfWeek === dayOfWeek && a.isWorkingDay === true,
    );

    if (!availability) {
      throw new BadRequestException(
        'Doctor is not available today. Please visit the clinic for emergency care.',
      );
    }

    const totalSlots = this.calcTotalSlots(doctor, availability);
    const regularSlots = totalSlots - doctor.emergencySlotsPerSession;

    // Count emergency bookings today
    const emergencyCount = await this.appointmentsRepository.count({
      where: {
        doctor: { id: doctor.id },
        appointmentDate: dateString,
        status: AppointmentStatus.BOOKED,
        reason: 'EMERGENCY',
      },
    });

    if (emergencyCount >= doctor.emergencySlotsPerSession) {
      throw new BadRequestException(
        'All emergency slots for today are filled. Please visit the clinic directly.',
      );
    }

    // Emergency slot time = after all regular slots
    const emergencyTokenNumber = regularSlots + emergencyCount + 1;
    const slotTime = this.calcSlotTime(
      availability.startTime,
      emergencyTokenNumber,
      doctor.slotDurationMins,
    );

    const appointment = this.appointmentsRepository.create({
      doctor,
      patientPhone: dto.patientPhone,
      patientName: dto.patientName,
      reason: 'EMERGENCY',
      appointmentDate: dateString,
      slotTime,
      tokenNumber: emergencyTokenNumber,
      status: AppointmentStatus.BOOKED,
    });

    const saved = await this.appointmentsRepository.save(appointment);

    return {
      success: true,
      message: `🚨 Emergency appointment booked. Token #${emergencyTokenNumber}, Reporting time: ${slotTime}. Please arrive immediately.`,
      appointment: {
        id: saved.id,
        doctorName: doctor.name,
        appointmentDate: saved.appointmentDate,
        reportingTime: saved.slotTime,
        tokenNumber: saved.tokenNumber,
        isEmergency: true,
        status: saved.status,
      },
    };
  }

  // ─────────────────────────────────────────────────────────
  // CANCEL APPOINTMENT
  // Frees the slot immediately (enables Scenario #5)
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
      throw new BadRequestException(
        'This appointment is already cancelled.',
      );
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
      message: 'Appointment cancelled successfully. The slot is now available for other patients.',
      freedSlot: {
        date: appointment.appointmentDate,
        time: appointment.slotTime,
        tokenNumber: appointment.tokenNumber,
      },
    };
  }

  // ─────────────────────────────────────────────────────────
  // GET NEXT AVAILABLE SLOT (without booking)
  // ─────────────────────────────────────────────────────────
  async getNextAvailableSlot(doctorId: string) {
    const doctor = await this.doctorsService.getDoctorById(doctorId);

    if (!doctor.availability || doctor.availability.length === 0) {
      throw new BadRequestException('Doctor has no availability configured.');
    }

    let result: any;
    switch (doctor.schedulingType) {
      case SchedulingType.WAVE:
        result = await this.findNextWaveSlot(doctor, 7);
        break;
      case SchedulingType.MODIFIED_WAVE:
        result = await this.findNextModifiedWaveSlot(doctor, 7);
        break;
      default:
        result = await this.findNextStreamSlot(doctor, 7);
        break;
    }

    if (!result) {
      return {
        available: false,
        message: 'No appointments available in the next 7 days. Please try after sometime.',
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
      schedulingType: doctor.schedulingType,
      scenario: result.scenario,
      ...(result.waveInfo && { waveInfo: result.waveInfo }),
      ...(result.cycleInfo && { cycleInfo: result.cycleInfo }),
    };
  }

  // ─────────────────────────────────────────────────────────
  // GET ALL APPOINTMENTS FOR DOCTOR (grouped by date)
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
  // Shows all slot stats for a given date
  // ─────────────────────────────────────────────────────────
  async getDailySummary(doctorId: string, date: string) {
    const doctor = await this.doctorsService.getDoctorById(doctorId);
    const checkDate = new Date(date + 'T00:00:00');
    const dayOfWeek = checkDate.getDay();

    const availability = doctor.availability.find(
      (a: any) => a.dayOfWeek === dayOfWeek,
    );

    if (!availability || !availability.isWorkingDay) {
      return {
        date,
        isDoctorWorking: false,
        message: 'Doctor does not work on this day.',
      };
    }

    const totalSlots = this.calcTotalSlots(doctor, availability);
    const regularSlots = totalSlots - doctor.emergencySlotsPerSession;

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
      workingHours: `${availability.startTime} - ${availability.endTime}`,
      schedulingType: doctor.schedulingType,
      slotDurationMins: doctor.slotDurationMins,
      totalSlots,
      regularSlots,
      emergencySlots: doctor.emergencySlotsPerSession,
      bookedSlots: activeCount,
      cancelledSlots: cancelledCount,
      availableSlots: regularSlots - activeCount,
      isFull: activeCount >= regularSlots,
    };
  }
  // ─────────────────────────────────────────────────────────
  // HELPER — format date as YYYY-MM-DD using LOCAL timezone
  // Fixes UTC timezone issue for Indian servers
  // ─────────────────────────────────────────────────────────
  private formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // ─────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────
  private calcTotalSlots(doctor: any, availability: any): number {
    if (doctor.maxSlotsOverride) return doctor.maxSlotsOverride;
    const [sh, sm] = availability.startTime.split(':').map(Number);
    const [eh, em] = availability.endTime.split(':').map(Number);
    const total = eh * 60 + em - (sh * 60 + sm);
    return Math.floor(total / doctor.slotDurationMins);
  }

  private calcSlotTime(
    startTime: string,
    tokenNumber: number,
    slotDurationMins: number,
  ): string {
    const [sh, sm] = startTime.split(':').map(Number);
    const totalMins = sh * 60 + sm + (tokenNumber - 1) * slotDurationMins;
    return `${String(Math.floor(totalMins / 60)).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}`;
  }

  private detectScenario(daysAhead: number, doctor: any, today: Date): string {
    if (daysAhead === 0) return 'Scenario 1: Booked today';
    if (daysAhead === 1) {
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      const tomorrowDay = tomorrow.getDay();
      const availability = doctor.availability.find(
        (a: any) => a.dayOfWeek === tomorrowDay,
      );
      if (!availability || !availability.isWorkingDay) {
        return 'Scenario 4: Skipped non-working day';
      }
      return 'Scenario 2: Today full, booked tomorrow';
    }
    // Check if any skipped non-working day
    for (let j = 1; j < daysAhead; j++) {
      const d = new Date(today);
      d.setDate(today.getDate() + j);
      const av = doctor.availability.find(
        (a: any) => a.dayOfWeek === d.getDay(),
      );
      if (!av || !av.isWorkingDay) {
        return `Scenario 4: Skipped non-working days, booked ${daysAhead} days ahead`;
      }
    }
    return `Scenario 3: Today & intermediate days full, booked ${daysAhead} days ahead`;
  }

  private buildMessage(result: any, schedulingType: string): string {
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
    if (schedulingType === SchedulingType.WAVE && result.waveInfo) {
      return `No slots today. Wave appointment booked on ${dayName}. ${result.waveInfo}. Reporting time: ${result.slotTime}`;
    }
    return `No slots available today. Next appointment on ${dayName}. Token #${result.tokenNumber}, Reporting time: ${result.slotTime}`;
  }
  async getAvailableSlotsForDate(doctorId: string, date: string) {
  const doctor = await this.doctorsService.getDoctorById(doctorId);

  const checkDate = new Date(date + 'T00:00:00');
  const dayOfWeek = checkDate.getDay();
  const dayNames = [
    'Sunday','Monday','Tuesday','Wednesday',
    'Thursday','Friday','Saturday',
  ];

  const availability = doctor.availability.find(
    (a: any) => a.dayOfWeek === dayOfWeek,
  );

  if (!availability || !availability.isWorkingDay) {
    return {
      doctorName: doctor.name,
      date,
      dayName: dayNames[dayOfWeek],
      isDoctorAvailable: false,
      message: `Dr. ${doctor.name} is not available on ${dayNames[dayOfWeek]}`,
      slots: [],
    };
  }

  // Calculate total slots
  const [sh, sm] = availability.startTime.split(':').map(Number);
  const [eh, em] = availability.endTime.split(':').map(Number);
  const totalMins = eh * 60 + em - (sh * 60 + sm);
  const totalSlots = doctor.maxSlotsOverride
    ? doctor.maxSlotsOverride
    : Math.floor(totalMins / doctor.slotDurationMins);
  const regularSlots = totalSlots - doctor.emergencySlotsPerSession;

  // Get all booked appointments for this date
  const bookedAppointments = await this.appointmentsRepository.find({
    where: {
      doctor: { id: doctorId },
      appointmentDate: date,
      status: AppointmentStatus.BOOKED,
    },
  });

  // Build slot list with real status
  const slots: {
    tokenNumber: number;
    slotTime: string;
    status: string;
    patientName?: string;
  }[] = [];

  for (let i = 0; i < regularSlots; i++) {
    const slotMins = sh * 60 + sm + i * doctor.slotDurationMins;
    const slotHour = Math.floor(slotMins / 60);
    const slotMin = slotMins % 60;
    const slotTime = `${String(slotHour).padStart(2, '0')}:${String(slotMin).padStart(2, '0')}`;

    // Check if this token is booked
    const bookedAppointment = bookedAppointments.find(
      (apt) => apt.tokenNumber === i + 1,
    );

    slots.push({
      tokenNumber: i + 1,
      slotTime,
      status: bookedAppointment ? 'booked' : 'available',
      ...(bookedAppointment && {
        patientName: bookedAppointment.patientName || 'Patient',
      }),
    });
  }

  const availableCount = slots.filter((s) => s.status === 'available').length;
  const bookedCount = slots.filter((s) => s.status === 'booked').length;

  return {
    doctorName: doctor.name,
    specialization: doctor.specialization,
    schedulingType: doctor.schedulingType,
    date,
    dayName: dayNames[dayOfWeek],
    isDoctorAvailable: true,
    workingHours: `${availability.startTime} - ${availability.endTime}`,
    slotDurationMins: doctor.slotDurationMins,
    totalRegularSlots: regularSlots,
    emergencySlots: doctor.emergencySlotsPerSession,
    availableSlotsCount: availableCount,
    bookedSlotsCount: bookedCount,
    isFull: availableCount === 0,
    slots,
  };
}
}