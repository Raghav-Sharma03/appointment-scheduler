import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { DoctorAvailability } from './doctor-availability.entity';

export enum SchedulingType {
  STREAM = 'stream',
  WAVE = 'wave',
  MODIFIED_WAVE = 'modified_wave',
}

@Entity('doctors')
export class Doctor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  specialization: string;

  // Working hours — start and end time at doctor level
  @Column({ name: 'start_time', type: 'time' })
  startTime: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime: string;

  // How long each appointment takes
  @Column({ type: 'int', default: 15, name: 'slot_duration_mins' })
  slotDurationMins: number;

  // Optional manual override for max patients per day
  @Column({ type: 'int', nullable: true, name: 'max_slots_override' })
  maxSlotsOverride: number;

  @Column({
    type: 'enum',
    enum: SchedulingType,
    default: SchedulingType.STREAM,
    name: 'scheduling_type',
  })
  schedulingType: SchedulingType;

  @Column({ default: true, name: 'is_active' })
  isActive: boolean;

  @OneToMany(() => DoctorAvailability, (availability) => availability.doctor, {
    cascade: true,
  })
  availability: DoctorAvailability[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}