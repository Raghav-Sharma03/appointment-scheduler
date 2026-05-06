import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DoctorsModule } from './doctors/doctors.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { User } from './users/user.entity';
import { Doctor } from './doctors/doctor.entity';
import { DoctorAvailability } from './doctors/doctor-availability.entity';
import { Appointment } from './appointments/appointment.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        ssl: { rejectUnauthorized: false },
        entities: [User, Doctor, DoctorAvailability, Appointment],
        synchronize: configService.get<string>('NODE_ENV') !== 'production',
        logging: true,
    }),
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    DoctorsModule,
    AppointmentsModule,
  ],
})
export class AppModule {}