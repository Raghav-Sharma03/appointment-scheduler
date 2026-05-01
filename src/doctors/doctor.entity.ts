import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { DoctorAvailability } from './doctor-availability.entity';

export enum SchedulingType {
  STREAM = 'stream',           // Fixed individual time slots
  WAVE = 'wave',               // Group patients at top of hour
  MODIFIED_WAVE = 'modified_wave', // 2 at hour, 1 at half hour
}

@Entity('doctors')
export class Doctor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  specialization: string;

  @Column({ type: 'int', default: 15, name: 'slot_duration_mins' })
  slotDurationMins: number;

  @Column({ type: 'int', nullable: true, name: 'max_slots_override' })
  maxSlotsOverride: number;

  @Column({
    type: 'enum',
    enum: SchedulingType,
    default: SchedulingType.STREAM,
    name: 'scheduling_type',
  })
  schedulingType: SchedulingType;

  @Column({ type: 'int', default: 0, name: 'emergency_slots_per_session' })
  emergencySlotsPerSession: number;

  @Column({ default: true, name: 'is_active' })
  isActive: boolean;

  @OneToMany(() => DoctorAvailability, (availability) => availability.doctor, {
    cascade: true,
  })
  availability: DoctorAvailability[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}