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
      throw new NotFoundException(`Doctor with ID ${id} not found`);
    }
    return doctor;
  }

  async setAvailability(
    doctorId: string,
    availabilityDtos: SetAvailabilityDto[],
  ): Promise<Doctor> {
    const doctor = await this.getDoctorById(doctorId);

    // Delete existing availability for this doctor
    await this.availabilityRepository.delete({ doctor: { id: doctorId } });

    // Create new availability records
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

  async getDoctorSlots(doctorId: string): Promise<{
    doctor: Doctor;
    totalSlotsPerSession: number;
    slotDurationMins: number;
  }> {
    const doctor = await this.getDoctorById(doctorId);

    if (!doctor.availability || doctor.availability.length === 0) {
      throw new BadRequestException(
        'Doctor has no availability configured yet',
      );
    }

    // Get first working day availability to calculate slots
    const workingDay = doctor.availability.find((a) => a.isWorkingDay);
    if (!workingDay) {
      throw new BadRequestException('Doctor has no working days configured');
    }

    const [startHour, startMin] = workingDay.startTime.split(':').map(Number);
    const [endHour, endMin] = workingDay.endTime.split(':').map(Number);

    const totalMinutes =
      endHour * 60 + endMin - (startHour * 60 + startMin);
    const totalSlots = doctor.maxSlotsOverride
      ? doctor.maxSlotsOverride
      : Math.floor(totalMinutes / doctor.slotDurationMins);

    return {
      doctor,
      totalSlotsPerSession: totalSlots,
      slotDurationMins: doctor.slotDurationMins,
    };
  }
}