# MediConnect

Plataforma de telemedicina para El Salvador: conecta pacientes con médicos mediante reserva de citas, historial clínico digital, recetas electrónicas, documentos médicos y videoconsultas.

Este repositorio contiene un **prototipo funcional** (backend Laravel + frontend Next.js) y es parte de un proyecto académico de **migración a la nube en AWS**. La arquitectura AWS es una propuesta documentada en un informe técnico aparte; no hay recursos desplegados en AWS.

## Funcionalidades

| Rol | Funciones |
|---|---|
| Paciente | Reserva y seguimiento de citas, historial clínico, recetas, documentos, perfil |
| Médico | Horarios y agenda, confirmar o cancelar citas, atención e historiales, recetas, documentos |
| Administrador | Gestión de médicos y especialidades, reportes |

Funciones transversales:

- Autenticación por roles con Laravel Sanctum.
- **Campanita de notificaciones** dentro de la app (bienvenida, solicitud de cita, cita confirmada, cancelación, recordatorio).
- **Avisos por correo** procesados en cola, sin datos clínicos.
- **Videollamada** por cita, con enlace de Jitsi generado al confirmar.
- Generación de reportes en segundo plano (cola `reportes`).
- Almacenamiento de archivos médicos configurable (disco local o S3).

## Tecnologías

- **Backend:** Laravel (PHP), API REST, Sanctum, colas, scheduler.
- **Frontend:** Next.js 16 (App Router), TypeScript, Tailwind CSS, Axios.
- **Base de datos:** MySQL.
- **Videollamadas:** Jitsi (prototipo) detrás de una interfaz intercambiable por Amazon Chime SDK.

## Estructura del repositorio

```
MediConnect/
├── backend/                      API Laravel
│   ├── app/
│   │   ├── Console/Commands/         Recordatorios de citas
│   │   ├── Contracts/                Interfaz VideoProvider
│   │   ├── Http/Controllers/Api/     Controladores (admin, médico, paciente, notificaciones)
│   │   ├── Jobs/                     EnviarAvisoCita, GenerarReporte
│   │   ├── Mail/                     AvisoCita
│   │   ├── Services/                 AvisosCita, JitsiVideoProvider
│   │   └── Support/                  VideoRoom
│   ├── config/                       queue.php, video.php, filesystems.php, mail.php
│   ├── database/migrations/          Colas, notificaciones de la app
│   ├── routes/                       api.php, console.php
│   └── tests/
├── frontend/                     Aplicación Next.js
│   └── src/
│       ├── app/                      Rutas: paciente, medico, admin
│       ├── components/               PanelProtegido, CampanaNotificaciones
│       └── lib/                      api.ts (Axios), auth.ts
├── MediConnect_BDsql.sql         Script de la base de datos (esquema y datos de demostración)
└── README.md
```

## Requisitos

- PHP 8.2 o superior con las extensiones `pdo_mysql`, `mbstring`, `openssl` e `intl` (probado con PHP 8.5)
- Composer 2
- Node.js 20 o superior y npm
- MySQL 8

## Ejecución local

### 1. Base de datos

```bash
mysql -u root -p -e "CREATE DATABASE mediconnect CHARACTER SET utf8mb4;"
mysql -u root -p mediconnect -e "source MediConnect_BDsql.sql"
```

### 2. Backend

```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
```

En PowerShell, en lugar de `cp`: `Copy-Item .env.example .env`.

Edite `backend/.env` y configure como mínimo:

```
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=mediconnect
DB_USERNAME=su_usuario
DB_PASSWORD=su_contraseña
SESSION_DRIVER=file
CACHE_STORE=file
```

Cree las tablas de colas y de notificaciones. El script SQL ya incluye las tablas del dominio, por lo que **no** debe ejecutarse un `php artisan migrate` completo:

```bash
php artisan migrate --path=database/migrations/0001_01_01_000002_create_jobs_table.php
php artisan migrate --path=database/migrations/2026_11_20_000100_create_notificaciones_app_table.php
php artisan config:clear
php artisan serve --host=127.0.0.1 --port=8000
```

### 3. Colas y scheduler (cada comando en una terminal distinta)

```bash
php artisan queue:work notificaciones --queue=notificaciones
php artisan queue:work reportes --queue=reportes
php artisan schedule:work
```

El worker de `notificaciones` procesa los avisos por correo; `schedule:work` ejecuta los recordatorios de citas cada 10 minutos. La campanita de la app funciona sin workers.

### 4. Frontend

```bash
cd frontend
npm install
```

Cree `frontend/.env.local` con:

```
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

Y ejecute:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Abra `http://127.0.0.1:3000`. Los usuarios de demostración están en el script `MediConnect_BDsql.sql`.

## Variables de entorno

La misma base de código funciona en local y en AWS cambiando solo variables de entorno. No hay credenciales en el código.

| Variable | Local | AWS |
|---|---|---|
| `QUEUE_CONNECTION` | `database` | `sqs` |
| `MAIL_MAILER` | `log` | `ses` |
| `MEDICAL_FILES_DISK` | `local` | `s3` |
| `REPORTS_DISK` | `local` | `s3` |
| `VIDEO_PROVIDER` | `jitsi` | implementación con Amazon Chime SDK |
| `AWS_*`, `SQS_*` | vacías | credenciales por rol de la tarea ECS |

El archivo `backend/.env.example` documenta todas las variables.

## Notificaciones

- **En la app:** tabla `notificaciones_app`, consultada por la campanita (`GET /api/notificaciones`). Se genera una bienvenida al primer ingreso; el médico recibe la solicitud de cita; al confirmarla, paciente y médico reciben un aviso con el enlace de videollamada.
- **Por correo:** `AvisosCita` registra cada aviso con una clave de deduplicación única y lo encola en `notificaciones`. El job `EnviarAvisoCita` tiene 3 intentos con espera creciente, cola de fallidos (`failed_jobs`) y no incluye motivo de consulta ni datos clínicos. En local se escribe en `storage/logs/laravel.log`.
- No se implementa envío de SMS.

## Videollamadas

Al confirmar una cita, `JitsiVideoProvider` genera una sala con un nombre firmado (HMAC con `APP_KEY` y el id de la cita), que no se puede adivinar. La interfaz `VideoProvider` permite sustituir Jitsi por Amazon Chime SDK sin cambiar el resto del sistema.

Limitaciones del prototipo: cualquier persona con el enlace puede entrar, y el servicio público de Jitsi puede pedir inicio de sesión al primer participante.

## Arquitectura AWS propuesta

- **Acceso:** Route 53, CloudFront, AWS WAF, ACM y Application Load Balancer.
- **Aplicación:** Amazon ECS con AWS Fargate, servicios separados para Next.js, Laravel y workers.
- **Datos:** Amazon RDS for MySQL Multi-AZ en subredes privadas, con réplica de lectura para reportes.
- **Archivos:** Amazon S3 con versionado y cifrado.
- **Procesamiento desacoplado:** Amazon SQS y EventBridge Scheduler.
- **Seguridad y operación:** IAM, Secrets Manager, KMS, CloudWatch y CloudTrail.

El diagrama de arquitectura y la estimación de costos (AWS Pricing Calculator) se entregan junto con el informe técnico y no forman parte de este repositorio.

## Seguridad

- La base de datos nunca se expone a Internet en la arquitectura propuesta.
- Las credenciales se leen del entorno; `.env` no se versiona.
- Los avisos y registros no contienen información clínica.
- Acceso a recursos por rol (paciente, médico, administrador).

## Pruebas

```bash
cd backend
php artisan test
```

## Alcance

Prototipo académico. No hay despliegue en AWS ni certificación de cumplimiento normativo. El envío real de SMS no está implementado.

## Autor

Isaac Hernandez. Proyecto académico, noviembre de 2026.

