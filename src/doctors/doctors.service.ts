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

  async setAvailability(
    doctorId: string,
    availabilityDtos: SetAvailabilityDto[],
  ): Promise<Doctor> {
    const doctor = await this.getDoctorById(doctorId);

    // Delete existing availability
    await this.availabilityRepository.delete({ doctor: { id: doctorId } });

    // Create new availability records
    const availabilities = availabilityDtos.map((dto) =>
      this.availabilityRepository.create({
        doctor: doctor,
        dayOfWeek: dto.dayOfWeek,
        isWorkingDay: dto.isWorkingDay ?? true,
      }),
    );

    await this.availabilityRepository.save(availabilities);
    return this.getDoctorById(doctorId);
  }

  async getDoctorSlots(doctorId: string) {
    const doctor = await this.getDoctorById(doctorId);

    if (!doctor.startTime || !doctor.endTime) {
      throw new BadRequestException(
        'Doctor working hours not configured.',
      );
    }

    const [sh, sm] = doctor.startTime.split(':').map(Number);
    const [eh, em] = doctor.endTime.split(':').map(Number);
    const totalMinutes = eh * 60 + em - (sh * 60 + sm);
    const autoCalculatedSlots = Math.floor(
      totalMinutes / doctor.slotDurationMins,
    );
    const totalSlots = doctor.maxSlotsOverride || autoCalculatedSlots;

    return {
      doctor: {
        id: doctor.id,
        name: doctor.name,
        specialization: doctor.specialization,
        schedulingType: doctor.schedulingType,
      },
      workingHours: `${doctor.startTime} - ${doctor.endTime}`,
      slotDurationMins: doctor.slotDurationMins,
      autoCalculatedSlots,
      totalSlotsPerDay: totalSlots,
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

    const [sh, sm] = doctor.startTime.split(':').map(Number);
    const [eh, em] = doctor.endTime.split(':').map(Number);
    const totalMins = eh * 60 + em - (sh * 60 + sm);
    const totalSlots = doctor.maxSlotsOverride
      ? doctor.maxSlotsOverride
      : Math.floor(totalMins / doctor.slotDurationMins);

    const allSlots: {
      tokenNumber: number;
      slotTime: string;
      status: string;
    }[] = [];

    for (let i = 0; i < totalSlots; i++) {
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
      workingHours: `${doctor.startTime} - ${doctor.endTime}`,
      slotDurationMins: doctor.slotDurationMins,
      totalSlots,
      availableSlots: allSlots,
    };
  }
}