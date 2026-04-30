import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Doctor } from '../doctors/doctor.entity';

export enum AppointmentStatus {
  BOOKED = 'booked',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
  WAITLISTED = 'waitlisted',
}

@Entity('appointments')
export class Appointment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Doctor)
  @JoinColumn({ name: 'doctor_id' })
  doctor: Doctor;

  @Column({ name: 'patient_phone' })
  patientPhone: string;

  @Column({ name: 'patient_name', nullable: true })
  patientName: string;

  @Column({ name: 'appointment_date', type: 'date' })
  appointmentDate: string;

  @Column({ name: 'slot_time', type: 'time' })
  slotTime: string;

  @Column({ name: 'token_number', type: 'int' })
  tokenNumber: number;

  @Column({
    type: 'enum',
    enum: AppointmentStatus,
    default: AppointmentStatus.BOOKED,
  })
  status: AppointmentStatus;

  @Column({ name: 'reason', nullable: true })
  reason: string;

  @CreateDateColumn({ name: 'booked_at' })
  bookedAt: Date;

  @Column({ name: 'cancelled_at', nullable: true, type: 'timestamp' })
  cancelledAt: Date;
}