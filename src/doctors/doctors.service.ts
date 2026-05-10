import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Doctor } from './doctor.entity';
import {
  DoctorAvailability,
  AvailabilityType,
  SessionSchedulingType,
} from './doctor-availability.entity';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import {
  SetRecurringAvailabilityDto,
  SetNonRecurringAvailabilityDto,
} from './dto/set-availability.dto';

@Injectable()
export class DoctorsService {
  constructor(
    @InjectRepository(Doctor)
    private doctorsRepository: Repository<Doctor>,
    @InjectRepository(DoctorAvailability)
    private availabilityRepository: Repository<DoctorAvailability>,
  ) {}

  async createDoctor(createDoctorDto: CreateDoctorDto): Promise<Doctor> {
    const doctor = this.doctorsRepository.create({
      name: createDoctorDto.name,
      specialization: createDoctorDto.specialization,
      startTime: createDoctorDto.startTime,
      endTime: createDoctorDto.endTime,
      slotDurationMins: createDoctorDto.slotDurationMins || 15,
      maxSlotsOverride: createDoctorDto.maxSlotsOverride,
      schedulingType: createDoctorDto.schedulingType,
      isActive: createDoctorDto.isActive ?? true,
    });
    return this.doctorsRepository.save(doctor);
  }

  async getAllDoctors(): Promise<Doctor[]> {
    return this.doctorsRepository.find({
      where: { isActive: true },
      relations: ['availability'],
    });
  }

  async getDoctorById(id: string): Promise<Doctor> {
    const doctor = await this.doctorsRepository.findOne({
      where: { id },
      relations: ['availability'],
    });
    if (!doctor) {
      throw new NotFoundException(`Doctor with ID "${id}" not found`);
    }
    if (!doctor.isActive) {
      throw new BadRequestException(
        `Doctor "${doctor.name}" is currently not active.`,
      );
    }
    return doctor;
  }

  // ─────────────────────────────────────────────────────────
  // SET RECURRING AVAILABILITY
  // ─────────────────────────────────────────────────────────
  async setRecurringAvailability(
    doctorId: string,
    dtos: SetRecurringAvailabilityDto[],
  ): Promise<Doctor> {
    const doctor = await this.getDoctorById(doctorId);

    // Delete existing recurring availability only
    await this.availabilityRepository.delete({
      doctor: { id: doctorId },
      type: AvailabilityType.RECURRING,
    });

    const availabilities = dtos.map((dto) =>
      this.availabilityRepository.create({
        doctor,
        type: AvailabilityType.RECURRING,
        schedulingType: dto.schedulingType as unknown as SessionSchedulingType,
        startTime: dto.startTime,
        endTime: dto.endTime,
        durationMins: dto.durationMins,
        maxPatients: dto.maxPatients,
        dayOfWeek: dto.dayOfWeek,
        specificDate: null,
        isActive: dto.isActive ?? true,
      }),
    );

    await this.availabilityRepository.save(availabilities);
    return this.getDoctorById(doctorId);
  }

  // ─────────────────────────────────────────────────────────
  // SET NON-RECURRING AVAILABILITY (adds extra slots)
  // ─────────────────────────────────────────────────────────
  async setNonRecurringAvailability(
    doctorId: string,
    dtos: SetNonRecurringAvailabilityDto[],
  ): Promise<Doctor> {
    const doctor = await this.getDoctorById(doctorId);

    // Non-recurring slots are ADDED on top — never delete existing ones
    const availabilities = dtos.map((dto) =>
      this.availabilityRepository.create({
        doctor,
        type: AvailabilityType.NON_RECURRING,
        schedulingType: dto.schedulingType as unknown as SessionSchedulingType,
        startTime: dto.startTime,
        endTime: dto.endTime,
        durationMins: dto.durationMins,
        maxPatients: dto.maxPatients,
        dayOfWeek: null,
        specificDate: dto.specificDate,
        isActive: dto.isActive ?? true,
      }),
    );

    await this.availabilityRepository.save(availabilities);
    return this.getDoctorById(doctorId);
  }

  // ─────────────────────────────────────────────────────────
  // GET DOCTOR SLOTS INFO
  // ─────────────────────────────────────────────────────────
  async getDoctorSlots(doctorId: string) {
    const doctor = await this.getDoctorById(doctorId);

    const recurringSlots = doctor.availability.filter(
      (a) => a.type === AvailabilityType.RECURRING && a.isActive,
    );

    const nonRecurringSlots = doctor.availability.filter(
      (a) => a.type === AvailabilityType.NON_RECURRING && a.isActive,
    );

    const dayNames = [
      'Sunday', 'Monday', 'Tuesday',
      'Wednesday', 'Thursday', 'Friday', 'Saturday',
    ];

    return {
      doctor: {
        id: doctor.id,
        name: doctor.name,
        specialization: doctor.specialization,
        schedulingType: doctor.schedulingType,
      },
      recurringsessions: recurringSlots.map((s) => ({
        id: s.id,
        schedulingType: s.schedulingType,
        day: s.dayOfWeek !== null ? dayNames[s.dayOfWeek] : 'N/A',
        startTime: s.startTime,
        endTime: s.endTime,
        durationMins: s.durationMins,
        maxPatients: s.maxPatients,
      })),
      nonRecurringSessions: nonRecurringSlots.map((s) => ({
        id: s.id,
        schedulingType: s.schedulingType,
        specificDate: s.specificDate,
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
  async getAvailableSlotsForDate(
    doctorId: string,
    date: string,
  ): Promise<any> {
    const doctor = await this.getDoctorById(doctorId);
    const checkDate = new Date(date + 'T00:00:00');
    const dayOfWeek = checkDate.getDay();
    const dayNames = [
      'Sunday', 'Monday', 'Tuesday', 'Wednesday',
      'Thursday', 'Friday', 'Saturday',
    ];

    // Find recurring session for this day
    const recurringSession = doctor.availability.find(
      (a) =>
        a.type === AvailabilityType.RECURRING &&
        a.dayOfWeek === dayOfWeek &&
        a.isActive,
    );

    // Find non-recurring sessions for this specific date
    const nonRecurringSessions = doctor.availability.filter(
      (a) =>
        a.type === AvailabilityType.NON_RECURRING &&
        a.specificDate === date &&
        a.isActive,
    );

    if (!recurringSession && nonRecurringSessions.length === 0) {
      return {
        doctorName: doctor.name,
        date,
        dayName: dayNames[dayOfWeek],
        isDoctorAvailable: false,
        message: `Dr. ${doctor.name} is not available on ${dayNames[dayOfWeek]}`,
        slots: [],
      };
    }

    const allSlots: any[] = [];

    // Add recurring slots
    if (recurringSession) {
      const slots = this.generateSlots(recurringSession, 'recurring');
      allSlots.push(...slots);
    }

    // Add non-recurring slots on top
    for (const session of nonRecurringSessions) {
      const slots = this.generateSlots(session, 'non-recurring (extra)');
      allSlots.push(...slots);
    }

    return {
      doctorName: doctor.name,
      specialization: doctor.specialization,
      date,
      dayName: dayNames[dayOfWeek],
      isDoctorAvailable: true,
      totalSlots: allSlots.length,
      slots: allSlots,
    };
  }

  // ─────────────────────────────────────────────────────────
  // HELPER — Generate slots from a session
  // ─────────────────────────────────────────────────────────
  generateSlots(session: DoctorAvailability, label: string) {
    const [sh, sm] = (session.startTime ?? '00:00').split(':').map(Number);
    const [eh, em] = (session.endTime ?? '00:00').split(':').map(Number);
    const totalMins = eh * 60 + em - (sh * 60 + sm);
    const totalSlots = Math.min(
      session.maxPatients,
      Math.floor(totalMins / session.durationMins),
    );

    const slots: any[] = [];
    for (let i = 0; i < totalSlots; i++) {
      const slotMins = sh * 60 + sm + i * session.durationMins;
      const slotHour = Math.floor(slotMins / 60);
      const slotMin = slotMins % 60;
      const slotTime = `${String(slotHour).padStart(2, '0')}:${String(slotMin).padStart(2, '0')}`;
      slots.push({
        tokenNumber: i + 1,
        slotTime,
        sessionType: label,
        schedulingType: session.schedulingType,
        durationMins: session.durationMins,
      });
    }
    return slots;
  }
}