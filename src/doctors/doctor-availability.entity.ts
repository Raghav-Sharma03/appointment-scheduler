import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Doctor } from './doctor.entity';

export enum AvailabilityType {
  RECURRING = 'recurring',
  NON_RECURRING = 'non_recurring',
}

export enum SessionSchedulingType {
  WAVE = 'wave',
  STREAM = 'stream',
}

@Entity('doctor_availability')
export class DoctorAvailability {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Doctor, (doctor) => doctor.availability, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'doctor_id' })
  doctor: Doctor;

  @Column({
    type: 'enum',
    enum: AvailabilityType,
    default: AvailabilityType.RECURRING,
  })
  type: AvailabilityType;

  @Column({
    type: 'enum',
    enum: SessionSchedulingType,
    default: SessionSchedulingType.STREAM,
    name: 'scheduling_type',
  })
  schedulingType: SessionSchedulingType;

  @Column({ name: 'start_time', type: 'time' })
  startTime: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime: string;

  @Column({ name: 'duration_mins', type: 'int', default: 15 })
  durationMins: number;

  @Column({ name: 'max_patients', type: 'int', default: 4 })
  maxPatients: number;

  // For recurring — 0=Sunday, 1=Monday ... 6=Saturday
  @Column({ name: 'day_of_week', type: 'int', nullable: true })
  dayOfWeek: number | null;

  // For non-recurring — specific date like 2026-05-11
  @Column({ name: 'specific_date', type: 'date', nullable: true })
  specificDate: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}