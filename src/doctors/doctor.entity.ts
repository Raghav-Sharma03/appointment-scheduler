import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { DoctorAvailability } from './doctor-availability.entity';

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

  @Column({ default: true, name: 'is_active' })
  isActive: boolean;

  @OneToMany(() => DoctorAvailability, (availability) => availability.doctor, {
    cascade: true,
  })
  availability: DoctorAvailability[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}