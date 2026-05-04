# Appointment Scheduling System

## Problem Statement
The biggest challenge in doctor appointment booking is —
patient calls clinic, today is full, nobody tells them WHEN 
exactly the next slot is available. This system solves that 
automatically.

## My Approach
I analyzed the requirement and identified 5 core scenarios:
1. Today has slots → Book today
2. Today full → Auto book tomorrow  
3. Multiple days full → Find next available day
4. Non-working days → Skip automatically
5. Cancellations → Slot reopens immediately

## Tech Stack
- **Framework**: NestJS + TypeScript
- **Database**: PostgreSQL
- **ORM**: TypeORM
- **Authentication**: JWT

## System Architecture

     Patient Request
            ↓
     Auth Guard (JWT)
            ↓
     Appointment Controller
            ↓
     Appointment Service
            ↓
┌─────────────────────────────┐
│     Scheduling Engine       │
│  Stream | Wave | Modified   │
└─────────────────────────────┘
            ↓
     Doctor Availability Checker
            ↓
     Next Available Day Finder
            ↓
     Database (PostgreSQL)

## Modules

### 1. Auth Module
Handles user registration and login with JWT protection.

### 2. Doctor Module
Manages doctor profiles, working hours, slot configuration
and scheduling type (Stream/Wave/Modified Wave).

### 3. Appointment Module
Core booking logic with all 5 scenarios, preferred date/time
booking, emergency slots and cancellation handling.

## Scheduling Types

| Type | Description | Best For |
|------|-------------|----------|
| Stream | Fixed individual time slots | Specialist doctors |
| Wave | 3 patients grouped per hour | High volume clinics |
| Modified Wave | 2 at hour, 1 at half hour | Multi-doctor clinics |

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/auth/register | Register user |
| POST | /api/v1/auth/login | Login |
| GET | /api/v1/auth/profile | Get profile (JWT) |

### Doctors
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/doctors | Create doctor |
| GET | /api/v1/doctors | Get all doctors |
| GET | /api/v1/doctors/:id | Get doctor |
| POST | /api/v1/doctors/:id/availability | Set availability |
| GET | /api/v1/doctors/:id/slots | Get slot info |

### Appointments
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/appointments | Book appointment |
| GET | /api/v1/appointments/available-slots/:id | Check slots for date |
| GET | /api/v1/appointments/next-available/:id | Next available slot |
| GET | /api/v1/appointments/summary/:id | Daily slot summary |
| GET | /api/v1/appointments/doctor/:id | All appointments |
| PATCH | /api/v1/appointments/:id/cancel | Cancel appointment |

## Database Design

### Entities
- **Users** — Authentication (email, password, role)
- **Doctors** — Profile, scheduling type, slot config
- **Doctor Availability** — Working days and hours per doctor
- **Appointments** — Bookings with token, time, status

## Key Features

### Smart Next Available Day

     Check today   →   Doctor working?  →  Slots available?
          ↓ NO               ↓ NO
     Skip to next       Check tomorrow
     working day             ↓
    
    Repeat up to 7 days

### Cancellation Logic
When appointment is cancelled → status changes to CANCELLED
→ that slot is immediately available for new patients
→ next booking automatically fills the freed slot

### Emergency Slots
Doctor can reserve N slots per session for emergency patients.
Emergency patients get priority token after regular slots.

## Setup

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Add your database credentials to .env

# Start development server
npm run start:dev
```

## Environment Variables

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_NAME=appointment_scheduler
JWT_SECRET=your_secret_key
JWT_EXPIRES_IN=7d
PORT=3000
```

## Trade-offs & Decisions

### Patient as embedded fields vs separate module
Patient details (phone, name, reason) are embedded in the
appointment entity. This matches real clinic workflow where
patients don't need to register — they just give their phone
number. A dedicated patient module with login and history
is planned as the next enhancement.

### synchronize: true
TypeORM auto-creates database tables in development.
In production this should be replaced with migrations.

## Progress
- [x] Day 1: Project setup + Auth module
- [x] Day 2: Doctor module + Availability config
- [x] Day 3: Appointment booking + All 5 scenarios
- [x] Day 4: Wave scheduling + Emergency slots + Preferred booking
- [x] Day 5: Documentation + Final polish