import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Doctor } from './doctor.entity';
import { DoctorAvailability } from './doctor-availability.entity';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { SetAvailabilityDto } from './dto/set-availability.dto';

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
      slotDurationMins: createDoctorDto.slotDurationMins || 15,
      maxSlotsOverride: createDoctorDto.maxSlotsOverride,
      schedulingType: createDoctorDto.schedulingType,
      emergencySlotsPerSession: createDoctorDto.emergencySlotsPerSession || 0,
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
        `Doctor "${doctor.name}" is currently not active. Please choose another doctor.`,
      );
    }
    return doctor;
  }

  async setAvailability(
    doctorId: string,
    availabilityDtos: SetAvailabilityDto[],
  ): Promise<Doctor> {
    const doctor = await this.getDoctorById(doctorId);
    await this.availabilityRepository.delete({ doctor: { id: doctorId } });
    const availabilities = availabilityDtos.map((dto) =>
      this.availabilityRepository.create({
        doctor: doctor,
        dayOfWeek: dto.dayOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        isWorkingDay: dto.isWorkingDay ?? true,
      }),
    );
    await this.availabilityRepository.save(availabilities);
    return this.getDoctorById(doctorId);
  }

  async getDoctorSlots(doctorId: string) {
    const doctor = await this.getDoctorById(doctorId);
    if (!doctor.availability || doctor.availability.length === 0) {
      throw new BadRequestException(
        'Doctor has no availability configured yet',
      );
    }
    const workingDay = doctor.availability.find((a) => a.isWorkingDay);
    if (!workingDay) {
      throw new BadRequestException('Doctor has no working days configured');
    }
    const [startHour, startMin] = workingDay.startTime.split(':').map(Number);
    const [endHour, endMin] = workingDay.endTime.split(':').map(Number);
    const totalMinutes = endHour * 60 + endMin - (startHour * 60 + startMin);
    const autoCalculatedSlots = Math.floor(
      totalMinutes / doctor.slotDurationMins,
    );
    const totalSlots = doctor.maxSlotsOverride || autoCalculatedSlots;
    const regularSlots = totalSlots - doctor.emergencySlotsPerSession;

    return {
      doctor: {
        id: doctor.id,
        name: doctor.name,
        specialization: doctor.specialization,
        schedulingType: doctor.schedulingType,
      },
      slotDurationMins: doctor.slotDurationMins,
      autoCalculatedSlots,
      totalSlotsPerSession: totalSlots,
      regularSlots,
      emergencySlots: doctor.emergencySlotsPerSession,
      workingHours: `${workingDay.startTime} - ${workingDay.endTime}`,
    };
  }
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

  // Check if doctor works on this day
      const availability = doctor.availability.find(
        (a) => a.dayOfWeek === dayOfWeek,
      );

      if (!availability || !availability.isWorkingDay) {
        return {
          doctorName: doctor.name,
          date,
          dayName: dayNames[dayOfWeek],
          isDoctorAvailable: false,
          message: `Dr. ${doctor.name} is not available on ${dayNames[dayOfWeek]}`,
          availableSlots: [],
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

  // Generate all slot times
    const allSlots: { tokenNumber: number; slotTime: string; status: string }[] = [];
    for (let i = 0; i < regularSlots; i++) {
      const slotMins = sh * 60 + sm + i * doctor.slotDurationMins;
      const slotHour = Math.floor(slotMins / 60);
      const slotMin = slotMins % 60;
      const slotTime = `${String(slotHour).padStart(2, '0')}:${String(slotMin).padStart(2, '0')}`;
      allSlots.push({
        tokenNumber: i + 1,
        slotTime,
        status: 'available',
      });
    }

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
      availableSlots: allSlots,
    };
  }
}