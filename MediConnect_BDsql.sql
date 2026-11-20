-- MediConnect: base de datos para el proyecto de telemedicina (nombres en español).
-- Requiere MySQL 8.0.16 o superior (antes de esa versión las restricciones CHECK se ignoran).
-- Verificado en MySQL 8.0.46. Ejecutar una sola vez sobre una base nueva.
-- Si MediConnect ya existe o aparece un error, detener la ejecución.
-- No se elimina ninguna base existente.
--
-- Convenciones: tablas en plural y columnas en singular, todo en snake_case y sin tildes ni ñ
-- en los identificadores. Se conserva "id" como nombre de llave primaria.
-- Los valores de catálogo (roles, estados, etc.) también están en español.
--
-- Fechas: se utiliza la zona horaria de la sesión MySQL.
-- Al conectar Laravel y al desplegar en AWS, unificar la zona horaria.
-- Guardar y abrir este archivo como UTF-8; usar una conexión utf8mb4.
-- Se conserva el modo SQL configurado en el servidor.
--
-- Los datos son ficticios. Los usuarios se crean inactivos y el hash de ejemplo
-- corresponde a 'password'; asignar contraseñas individuales antes de activarlos.
-- Las rutas de archivos, pagos y videollamadas son ejemplos, no servicios activos.
-- Citas de 30 minutos; cancelar libera el horario sin borrar la cita.
-- Los permisos, las transiciones de estado, las fechas de nacimiento y las
-- reservas futuras deben validarse también en Laravel. No borrar historiales.
-- No ejecutar migraciones iniciales de Laravel sin adaptarlas a estas tablas.
--
-- LARAVEL con nombres en español: cada modelo necesita $table (y $fillable/$guarded) y, para
-- las marcas de tiempo, const CREATED_AT = 'creado_en'; const UPDATED_AT = 'actualizado_en';
-- (SoftDeletes: const DELETED_AT = 'eliminado_en'). El modelo Usuario debe sobrescribir
-- getAuthPassword() (columna contrasena) y getRememberTokenName() (columna token_recordatorio).

CREATE DATABASE MediConnect CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE MediConnect;


-- Cuentas: contrasena contiene el hash, nunca texto legible.
CREATE TABLE usuarios (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  correo VARCHAR(254) NOT NULL UNIQUE,
  correo_verificado_en DATETIME NULL,
  contrasena VARCHAR(255) NOT NULL,
  rol VARCHAR(15) NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT FALSE,
  token_recordatorio VARCHAR(100) NULL,
  eliminado_en DATETIME NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uni_usuario_rol (id, rol),
  CHECK (rol IN ('administrador','medico','paciente')),
  CHECK (activo IN (0,1)),
  CHECK (CHAR_LENGTH(TRIM(nombre)) > 0),
  CHECK (correo LIKE '%_@_%._%' AND correo NOT LIKE '% %'),
  CHECK (CHAR_LENGTH(contrasena) >= 60)
) ENGINE=InnoDB;


-- Catálogo de especialidades.
CREATE TABLE especialidades (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  descripcion VARCHAR(500) NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CHECK (CHAR_LENGTH(TRIM(nombre)) > 0)
) ENGINE=InnoDB;


-- Paciente; la FK compuesta exige una cuenta con rol paciente.
CREATE TABLE perfiles_paciente (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NOT NULL UNIQUE,
  usuario_rol VARCHAR(15) NOT NULL DEFAULT 'paciente',
  fecha_nacimiento DATE NOT NULL,
  telefono VARCHAR(16) NULL,
  direccion VARCHAR(500) NULL,
  contacto_emergencia_nombre VARCHAR(150) NULL,
  contacto_emergencia_telefono VARCHAR(16) NULL,
  alergias TEXT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CHECK (usuario_rol = 'paciente'),
  CHECK (fecha_nacimiento >= '1900-01-01'),
  FOREIGN KEY (usuario_id, usuario_rol) REFERENCES usuarios(id, rol)
) ENGINE=InnoDB;


-- Médico con especialidad principal y licencia ficticia en los ejemplos.
CREATE TABLE perfiles_medico (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NOT NULL UNIQUE,
  usuario_rol VARCHAR(15) NOT NULL DEFAULT 'medico',
  especialidad_id BIGINT UNSIGNED NOT NULL,
  numero_licencia VARCHAR(50) NOT NULL UNIQUE,
  biografia TEXT NULL,
  tarifa_consulta DECIMAL(10,2) NOT NULL DEFAULT 0,
  moneda CHAR(3) NOT NULL DEFAULT 'USD',
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CHECK (usuario_rol = 'medico'),
  CHECK (tarifa_consulta >= 0),
  CHECK (moneda = 'USD'),
  FOREIGN KEY (usuario_id, usuario_rol) REFERENCES usuarios(id, rol),
  FOREIGN KEY (especialidad_id) REFERENCES especialidades(id)
) ENGINE=InnoDB;


-- Agenda: los intervalos fijos y el índice único impiden solapamientos.
CREATE TABLE horarios_cita (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  medico_id BIGINT UNSIGNED NOT NULL,
  inicia_en DATETIME NOT NULL,
  termina_en DATETIME NOT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uni_medico_inicio (medico_id, inicia_en),
  UNIQUE KEY uni_horario_inicio (id, inicia_en),
  CHECK (MINUTE(inicia_en) IN (0,30) AND SECOND(inicia_en) = 0),
  CHECK (termina_en = DATE_ADD(inicia_en, INTERVAL 30 MINUTE)),
  FOREIGN KEY (medico_id) REFERENCES perfiles_medico(id)
) ENGINE=InnoDB;


-- Reservas: las restricciones únicas protegen incluso ante solicitudes concurrentes.
-- horario_reservado_id e inicio_reservado son columnas generadas (NULL si la cita está cancelada).
CREATE TABLE citas (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  horario_id BIGINT UNSIGNED NOT NULL,
  paciente_id BIGINT UNSIGNED NOT NULL,
  inicia_en DATETIME NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  motivo VARCHAR(1000) NOT NULL,
  motivo_cancelacion VARCHAR(1000) NULL,
  cancelada_en DATETIME NULL,
  reservada_por BIGINT UNSIGNED NOT NULL,
  precio DECIMAL(10,2) NOT NULL,
  moneda CHAR(3) NOT NULL DEFAULT 'USD',
  horario_reservado_id BIGINT UNSIGNED GENERATED ALWAYS AS
    (CASE WHEN estado <> 'cancelada' THEN horario_id ELSE NULL END) STORED,
  inicio_reservado DATETIME GENERATED ALWAYS AS
    (CASE WHEN estado <> 'cancelada' THEN inicia_en ELSE NULL END) STORED,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uni_horario_reservado (horario_reservado_id),
  UNIQUE KEY uni_paciente_inicio (paciente_id, inicio_reservado),
  UNIQUE KEY uni_cita_paciente (id, paciente_id),
  INDEX idx_estado_inicio (estado, inicia_en),
  CHECK (estado IN ('pendiente','confirmada','completada','cancelada','no_asistio')),
  CHECK (CHAR_LENGTH(TRIM(motivo)) > 0),
  CHECK (precio >= 0 AND moneda = 'USD'),
  CHECK ((estado = 'cancelada' AND cancelada_en IS NOT NULL AND motivo_cancelacion IS NOT NULL)
      OR (estado <> 'cancelada' AND cancelada_en IS NULL AND motivo_cancelacion IS NULL)),
  FOREIGN KEY (horario_id, inicia_en) REFERENCES horarios_cita(id, inicia_en),
  FOREIGN KEY (paciente_id) REFERENCES perfiles_paciente(id),
  FOREIGN KEY (reservada_por) REFERENCES usuarios(id)
) ENGINE=InnoDB;


-- Nota clínica: paciente y médico se obtienen a través de la cita.
CREATE TABLE historiales_clinicos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cita_id BIGINT UNSIGNED NOT NULL UNIQUE,
  sintomas TEXT NOT NULL,
  diagnostico TEXT NOT NULL,
  plan_tratamiento TEXT NULL,
  observaciones TEXT NULL,
  registrado_en DATETIME NOT NULL,
  firmado_en DATETIME NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CHECK (CHAR_LENGTH(TRIM(diagnostico)) > 0),
  CHECK (firmado_en IS NULL OR firmado_en >= registrado_en),
  FOREIGN KEY (cita_id) REFERENCES citas(id)
) ENGINE=InnoDB;


-- Receta: la emisión y la firma profesional se validan en la aplicación.
CREATE TABLE recetas (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  historial_clinico_id BIGINT UNSIGNED NOT NULL,
  numero_receta VARCHAR(50) NOT NULL UNIQUE,
  emitida_en DATETIME NOT NULL,
  vence_en DATETIME NULL,
  indicaciones TEXT NULL,
  estado VARCHAR(15) NOT NULL DEFAULT 'borrador',
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CHECK (estado IN ('borrador','emitida','anulada')),
  CHECK (vence_en IS NULL OR vence_en > emitida_en),
  FOREIGN KEY (historial_clinico_id) REFERENCES historiales_clinicos(id)
) ENGINE=InnoDB;


-- Detalle de medicamentos; los ejemplos no son utilizables como indicación médica.
CREATE TABLE detalles_receta (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  receta_id BIGINT UNSIGNED NOT NULL,
  medicamento VARCHAR(200) NOT NULL,
  dosis VARCHAR(100) NOT NULL,
  frecuencia VARCHAR(150) NOT NULL,
  duracion_dias SMALLINT UNSIGNED NOT NULL,
  via_administracion VARCHAR(100) NOT NULL,
  cantidad DECIMAL(10,2) NOT NULL,
  indicaciones TEXT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CHECK (CHAR_LENGTH(TRIM(medicamento)) > 0),
  CHECK (CHAR_LENGTH(TRIM(dosis)) > 0),
  CHECK (duracion_dias > 0 AND cantidad > 0),
  FOREIGN KEY (receta_id) REFERENCES recetas(id)
) ENGINE=InnoDB;


-- Metadatos de archivo privado: no almacenar URL públicas ni enlaces firmados permanentes.
CREATE TABLE archivos_medicos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  paciente_id BIGINT UNSIGNED NOT NULL,
  cita_id BIGINT UNSIGNED NULL,
  subido_por BIGINT UNSIGNED NOT NULL,
  nombre_original VARCHAR(255) NOT NULL,
  disco_almacenamiento VARCHAR(15) NOT NULL,
  clave_objeto VARCHAR(512) NOT NULL,
  tipo_mime VARCHAR(100) NOT NULL,
  tamano_bytes BIGINT UNSIGNED NOT NULL,
  hash_sha256 CHAR(64) NULL,
  estado VARCHAR(15) NOT NULL DEFAULT 'pendiente',
  eliminado_en DATETIME NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uni_archivo_objeto (disco_almacenamiento, clave_objeto),
  CHECK (disco_almacenamiento IN ('local','s3')),
  CHECK (estado IN ('pendiente','disponible','cuarentena','eliminado')),
  CHECK (tamano_bytes > 0),
  CHECK (tipo_mime IN ('application/pdf','image/jpeg','image/png','application/dicom')),
  FOREIGN KEY (paciente_id) REFERENCES perfiles_paciente(id),
  FOREIGN KEY (cita_id, paciente_id) REFERENCES citas(id, paciente_id),
  FOREIGN KEY (subido_por) REFERENCES usuarios(id)
) ENGINE=InnoDB;


-- Videoconsulta: no guardar tokens de acceso ni grabaciones en esta tabla.
CREATE TABLE videoconsultas (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cita_id BIGINT UNSIGNED NOT NULL UNIQUE,
  proveedor VARCHAR(50) NOT NULL,
  reunion_externa_id VARCHAR(200) NULL UNIQUE,
  estado VARCHAR(15) NOT NULL DEFAULT 'programada',
  iniciada_en DATETIME NULL,
  finalizada_en DATETIME NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CHECK (estado IN ('programada','activa','finalizada','fallida')),
  CHECK (finalizada_en IS NULL OR (iniciada_en IS NOT NULL AND finalizada_en >= iniciada_en)),
  CHECK (estado NOT IN ('activa','finalizada') OR iniciada_en IS NOT NULL),
  CHECK (estado <> 'finalizada' OR finalizada_en IS NOT NULL),
  FOREIGN KEY (cita_id) REFERENCES citas(id)
) ENGINE=InnoDB;


-- Registro de pagos, no tarjetas ni CVV; conciliar los importes en Laravel con el proveedor.
CREATE TABLE pagos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cita_id BIGINT UNSIGNED NOT NULL,
  proveedor VARCHAR(50) NOT NULL,
  pago_externo_id VARCHAR(200) NULL,
  clave_idempotencia VARCHAR(100) NOT NULL UNIQUE,
  monto DECIMAL(10,2) NOT NULL,
  moneda CHAR(3) NOT NULL DEFAULT 'USD',
  estado VARCHAR(15) NOT NULL DEFAULT 'pendiente',
  pagado_en DATETIME NULL,
  monto_reembolsado DECIMAL(10,2) NOT NULL DEFAULT 0,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uni_proveedor_pago (proveedor, pago_externo_id),
  CHECK (monto > 0 AND moneda = 'USD'),
  CHECK (estado IN ('pendiente','pagado','fallido','reembolsado')),
  CHECK (monto_reembolsado >= 0 AND monto_reembolsado <= monto),
  CHECK (estado NOT IN ('pagado','reembolsado') OR pagado_en IS NOT NULL),
  CHECK (estado <> 'reembolsado' OR monto_reembolsado = monto),
  FOREIGN KEY (cita_id) REFERENCES citas(id)
) ENGINE=InnoDB;


-- Seguimiento de envíos; no incluir diagnósticos en mensajes ni en logs.
CREATE TABLE envios_notificaciones (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id BIGINT UNSIGNED NOT NULL,
  cita_id BIGINT UNSIGNED NULL,
  canal VARCHAR(10) NOT NULL,
  destinatario VARCHAR(254) NOT NULL,
  codigo_plantilla VARCHAR(100) NOT NULL,
  clave_deduplicacion VARCHAR(150) NOT NULL UNIQUE,
  estado VARCHAR(15) NOT NULL DEFAULT 'pendiente',
  programado_en DATETIME NOT NULL,
  enviado_en DATETIME NULL,
  intentos SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  mensaje_proveedor_id VARCHAR(200) NULL,
  codigo_error VARCHAR(100) NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cola_notificaciones (estado, programado_en),
  CHECK (canal IN ('correo','sms')),
  CHECK (estado IN ('pendiente','procesando','enviado','fallido','cancelado')),
  CHECK (estado <> 'enviado' OR enviado_en IS NOT NULL),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (cita_id) REFERENCES citas(id)
) ENGINE=InnoDB;


-- Control de reportes; un worker separado genera el archivo, SQL no lo ejecuta.
CREATE TABLE solicitudes_reporte (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  solicitado_por BIGINT UNSIGNED NOT NULL,
  tipo_reporte VARCHAR(30) NOT NULL,
  periodo_inicio DATE NOT NULL,
  periodo_fin DATE NOT NULL,
  estado VARCHAR(15) NOT NULL DEFAULT 'pendiente',
  clave_deduplicacion VARCHAR(150) NOT NULL UNIQUE,
  disco_salida VARCHAR(15) NULL,
  clave_salida VARCHAR(512) NULL,
  iniciado_en DATETIME NULL,
  completado_en DATETIME NULL,
  intentos SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  codigo_error VARCHAR(100) NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cola_reportes (estado, creado_en),
  CHECK (tipo_reporte IN ('estadisticas_semanales','citas','pagos')),
  CHECK (estado IN ('pendiente','procesando','completado','fallido')),
  CHECK (periodo_fin >= periodo_inicio),
  CHECK (disco_salida IS NULL OR disco_salida IN ('local','s3')),
  CHECK (estado <> 'completado' OR (iniciado_en IS NOT NULL AND completado_en IS NOT NULL AND clave_salida IS NOT NULL AND disco_salida IS NOT NULL)),
  CHECK (completado_en IS NULL OR (iniciado_en IS NOT NULL AND completado_en >= iniciado_en)),
  FOREIGN KEY (solicitado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB;


-- Registro demostrativo de aceptaciones; el texto legal y su vigencia se gestionan aparte.
CREATE TABLE consentimientos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  paciente_id BIGINT UNSIGNED NOT NULL,
  finalidad VARCHAR(40) NOT NULL,
  version_politica VARCHAR(30) NOT NULL,
  aceptado_en DATETIME NOT NULL,
  revocado_en DATETIME NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CHECK (finalidad IN ('telemedicina','tratamiento_datos','notificaciones')),
  CHECK (revocado_en IS NULL OR revocado_en >= aceptado_en),
  FOREIGN KEY (paciente_id) REFERENCES perfiles_paciente(id)
) ENGINE=InnoDB;


-- Eventos de acceso y cambios; los detalles no deben incluir contraseñas ni contenido clínico.
CREATE TABLE registros_auditoria (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_actor_id BIGINT UNSIGNED NULL,
  accion VARCHAR(100) NOT NULL,
  tipo_recurso VARCHAR(100) NOT NULL,
  recurso_id BIGINT UNSIGNED NULL,
  ocurrido_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  solicitud_id VARCHAR(100) NOT NULL,
  direccion_ip VARCHAR(45) NULL,
  detalles JSON NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_auditoria_recurso (tipo_recurso, recurso_id, ocurrido_en),
  FOREIGN KEY (usuario_actor_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;


-- DATOS DE PRUEBA. Transacción solo para INSERT (la estructura ya está creada).
START TRANSACTION;
SET @hash_demo = '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';
SET @pasado = TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY), '15:00:00');
SET @futuro = TIMESTAMP(DATE_ADD(CURRENT_DATE(), INTERVAL 7 DAY), '15:00:00');

INSERT INTO usuarios (id,nombre,correo,contrasena,rol) VALUES
(1,'Administrador Demo','admin@mediconnect.test',@hash_demo,'administrador'),
(2,'Carlos Demo','carlos@mediconnect.test',@hash_demo,'medico'),
(3,'Lucía Demo','lucia@mediconnect.test',@hash_demo,'medico'),
(4,'Ana Demo','ana@mediconnect.test',@hash_demo,'paciente'),
(5,'Luis Demo','luis@mediconnect.test',@hash_demo,'paciente'),
(6,'Marta Demo','marta@mediconnect.test',@hash_demo,'paciente');
INSERT INTO especialidades (id,nombre,descripcion) VALUES
(1,'Medicina general','Especialidad de demostración'),
(2,'Pediatría','Especialidad de demostración');
INSERT INTO perfiles_paciente (id,usuario_id,fecha_nacimiento,direccion,alergias) VALUES
(1,4,'1995-04-10','Dirección ficticia A','No evaluadas; dato ficticio'),
(2,5,'1990-08-20','Dirección ficticia B','No evaluadas; dato ficticio'),
(3,6,'2000-01-15','Dirección ficticia C','No evaluadas; dato ficticio');
INSERT INTO perfiles_medico (id,usuario_id,especialidad_id,numero_licencia,biografia,tarifa_consulta) VALUES
(1,2,1,'DEMO-LIC-001','Perfil ficticio sin validez profesional',25.00),
(2,3,2,'DEMO-LIC-002','Perfil ficticio sin validez profesional',30.00);
INSERT INTO horarios_cita (id,medico_id,inicia_en,termina_en) VALUES
(1,1,@pasado,DATE_ADD(@pasado,INTERVAL 30 MINUTE)),
(2,1,@futuro,DATE_ADD(@futuro,INTERVAL 30 MINUTE)),
(3,1,DATE_ADD(@futuro,INTERVAL 30 MINUTE),DATE_ADD(@futuro,INTERVAL 60 MINUTE)),
(4,1,DATE_ADD(@futuro,INTERVAL 60 MINUTE),DATE_ADD(@futuro,INTERVAL 90 MINUTE)),
(5,2,@futuro,DATE_ADD(@futuro,INTERVAL 30 MINUTE)),
(6,2,DATE_ADD(@futuro,INTERVAL 30 MINUTE),DATE_ADD(@futuro,INTERVAL 60 MINUTE));
INSERT INTO citas (id,horario_id,paciente_id,inicia_en,estado,motivo,reservada_por,precio,motivo_cancelacion,cancelada_en) VALUES
(1,1,1,@pasado,'completada','Consulta de prueba finalizada',4,25,NULL,NULL),
(2,2,1,@futuro,'confirmada','Consulta de seguimiento ficticia',4,25,NULL,NULL),
(3,3,2,DATE_ADD(@futuro,INTERVAL 30 MINUTE),'pendiente','Reserva de demostración',5,25,NULL,NULL),
(4,5,3,@futuro,'cancelada','Prueba de cancelación',6,30,'Cambio de horario de prueba',CURRENT_TIMESTAMP()),
(5,5,2,@futuro,'confirmada','Horario liberado por cancelación',5,30,NULL,NULL);
INSERT INTO historiales_clinicos (id,cita_id,sintomas,diagnostico,plan_tratamiento,observaciones,registrado_en,firmado_en) VALUES
(1,1,'Texto ficticio de síntomas','Diagnóstico DEMO, sin valor médico','Plan simulado; no constituye indicación médica','Solo para probar el sistema',DATE_ADD(@pasado,INTERVAL 20 MINUTE),DATE_ADD(@pasado,INTERVAL 25 MINUTE));
INSERT INTO recetas (id,historial_clinico_id,numero_receta,emitida_en,vence_en,indicaciones,estado) VALUES
(1,1,'DEMO-RX-0001',DATE_ADD(@pasado,INTERVAL 25 MINUTE),DATE_ADD(@pasado,INTERVAL 30 DAY),'Documento ficticio. No dispensar medicamentos.','borrador');
INSERT INTO detalles_receta (receta_id,medicamento,dosis,frecuencia,duracion_dias,via_administracion,cantidad,indicaciones) VALUES
(1,'PRODUCTO FICTICIO A','Dosis de ejemplo no aplicable','Frecuencia de prueba',1,'No aplicable',1,'NO ADMINISTRAR. Solo demostración.'),
(1,'PRODUCTO FICTICIO B','Dosis de ejemplo no aplicable','Frecuencia de prueba',2,'No aplicable',2,'NO ADMINISTRAR. Solo demostración.');
INSERT INTO archivos_medicos (paciente_id,cita_id,subido_por,nombre_original,disco_almacenamiento,clave_objeto,tipo_mime,tamano_bytes,estado) VALUES
(1,1,2,'receta_demo.pdf','local','privado/demo/receta_demo.pdf','application/pdf',1024,'pendiente');
INSERT INTO videoconsultas (cita_id,proveedor,estado) VALUES
(2,'demo','programada'),(5,'demo','programada');
INSERT INTO pagos (cita_id,proveedor,pago_externo_id,clave_idempotencia,monto,estado,pagado_en) VALUES
(1,'sandbox','DEMO-PAY-001','demo-pago-001',25,'pagado',DATE_SUB(@pasado,INTERVAL 1 HOUR)),
(2,'sandbox',NULL,'demo-pago-002',25,'pendiente',NULL);
INSERT INTO envios_notificaciones (usuario_id,cita_id,canal,destinatario,codigo_plantilla,clave_deduplicacion,estado,programado_en) VALUES
(4,2,'correo','ana@mediconnect.test','confirmacion_cita','demo-correo-002','pendiente',CURRENT_TIMESTAMP()),
(5,3,'sms','DEMO-NO-ENVIAR','recordatorio_cita','demo-sms-003','cancelado',DATE_SUB(@futuro,INTERVAL 1 DAY));
INSERT INTO solicitudes_reporte (solicitado_por,tipo_reporte,periodo_inicio,periodo_fin,clave_deduplicacion) VALUES
(1,'estadisticas_semanales',DATE_SUB(CURRENT_DATE(),INTERVAL 7 DAY),DATE_SUB(CURRENT_DATE(),INTERVAL 1 DAY),'demo-semanal-001');
INSERT INTO consentimientos (paciente_id,finalidad,version_politica,aceptado_en) VALUES
(1,'telemedicina','DEMO-v1',DATE_SUB(@pasado,INTERVAL 1 DAY)),
(2,'telemedicina','DEMO-v1',CURRENT_TIMESTAMP()),
(3,'tratamiento_datos','DEMO-v1',CURRENT_TIMESTAMP());
INSERT INTO registros_auditoria (usuario_actor_id,accion,tipo_recurso,recurso_id,solicitud_id,direccion_ip,detalles) VALUES
(1,'demo.carga_inicial','base_de_datos',NULL,'demo-solicitud-001','127.0.0.1',JSON_OBJECT('demo',TRUE,'mensaje','Carga ficticia inicial')),
(4,'cita.crear','citas',2,'demo-solicitud-002','127.0.0.1',JSON_OBJECT('demo',TRUE));
COMMIT;

-- CONSULTAS DE COMPROBACIÓN (no modifican datos)
SELECT VERSION() AS version_mysql, DATABASE() AS base_actual;

SELECT 'usuarios' AS tabla, COUNT(*) AS registros FROM usuarios
UNION ALL
SELECT 'especialidades', COUNT(*) FROM especialidades
UNION ALL
SELECT 'perfiles_paciente', COUNT(*) FROM perfiles_paciente
UNION ALL
SELECT 'perfiles_medico', COUNT(*) FROM perfiles_medico
UNION ALL
SELECT 'horarios_cita', COUNT(*) FROM horarios_cita
UNION ALL
SELECT 'citas', COUNT(*) FROM citas
UNION ALL
SELECT 'historiales_clinicos', COUNT(*) FROM historiales_clinicos
UNION ALL
SELECT 'recetas', COUNT(*) FROM recetas
UNION ALL
SELECT 'detalles_receta', COUNT(*) FROM detalles_receta
UNION ALL
SELECT 'archivos_medicos', COUNT(*) FROM archivos_medicos
UNION ALL
SELECT 'videoconsultas', COUNT(*) FROM videoconsultas
UNION ALL
SELECT 'pagos', COUNT(*) FROM pagos
UNION ALL
SELECT 'envios_notificaciones', COUNT(*) FROM envios_notificaciones
UNION ALL
SELECT 'solicitudes_reporte', COUNT(*) FROM solicitudes_reporte
UNION ALL
SELECT 'consentimientos', COUNT(*) FROM consentimientos
UNION ALL
SELECT 'registros_auditoria', COUNT(*) FROM registros_auditoria;


SELECT c.id, pu.nombre AS paciente, mu.nombre AS medico, c.inicia_en AS inicio,
       c.estado AS estado, c.precio AS precio_usd
FROM citas c
JOIN perfiles_paciente p ON p.id = c.paciente_id JOIN usuarios pu ON pu.id = p.usuario_id
JOIN horarios_cita h ON h.id = c.horario_id
JOIN perfiles_medico m ON m.id = h.medico_id JOIN usuarios mu ON mu.id = m.usuario_id
ORDER BY c.inicia_en, c.id;

-- Horarios libres futuros: deben salir 2 con estos datos.
SELECT h.id, h.medico_id, h.inicia_en, h.termina_en
FROM horarios_cita h
LEFT JOIN citas c ON c.horario_id = h.id AND c.estado <> 'cancelada'
WHERE c.id IS NULL AND h.inicia_en > CURRENT_TIMESTAMP();

-- PRUEBAS NEGATIVAS OPCIONALES: descomentar UNA por vez, deben fallar.
-- 1) Correo duplicado (UNIQUE):
-- INSERT INTO usuarios(nombre,correo,contrasena,rol) VALUES ('Duplicado','ana@mediconnect.test',@hash_demo,'paciente');
-- 2) Perfil de médico para un usuario paciente (FK compuesta):
-- INSERT INTO perfiles_medico(usuario_id,especialidad_id,numero_licencia) VALUES (4,1,'DEMO-INVALIDO');
-- 3) Horario de duración incorrecta (CHECK):
-- INSERT INTO horarios_cita(medico_id,inicia_en,termina_en) VALUES (1,DATE_ADD(@futuro,INTERVAL 2 HOUR),DATE_ADD(@futuro,INTERVAL 3 HOUR));
-- 4) Doble reserva de horario (UNIQUE):
-- INSERT INTO citas(horario_id,paciente_id,inicia_en,motivo,reservada_por,precio) VALUES (2,3,@futuro,'Prueba inválida',6,25);
-- 5) Cita inexistente para la nota clínica (FK):
-- INSERT INTO historiales_clinicos(cita_id,sintomas,diagnostico,registrado_en) VALUES (999999,'Demo','Demo',CURRENT_TIMESTAMP());
-- 6) Paciente en dos horarios simultáneos con médicos distintos (UNIQUE):
-- INSERT INTO citas(horario_id,paciente_id,inicia_en,motivo,reservada_por,precio) VALUES (6,2,DATE_ADD(@futuro,INTERVAL 30 MINUTE),'Prueba inválida',5,30);
-- 7) Archivo asociado a la cita de otro paciente (FK compuesta):
-- INSERT INTO archivos_medicos(paciente_id,cita_id,subido_por,nombre_original,disco_almacenamiento,clave_objeto,tipo_mime,tamano_bytes) VALUES (2,1,2,'x.pdf','local','demo/x.pdf','application/pdf',100);
-- 8) Videoconsulta finalizada sin fecha de fin (CHECK):
-- INSERT INTO videoconsultas(cita_id,proveedor,estado,iniciada_en) VALUES (3,'demo','finalizada',@futuro);

-- INTEGRACIÓN POSTERIOR CON LARAVEL:
-- DB_DATABASE=MediConnect; DB_HOST=127.0.0.1; DB_PORT=3306
-- Configurar credenciales solo en .env local / Secrets Manager en AWS.
-- No incluir las columnas generadas horario_reservado_id/inicio_reservado en INSERT/UPDATE.
-- Proteger rol/activo/precio en asignación masiva; no aceptar el autor desde el cliente.
-- Crear modelos y policies; adaptar/baselinar migraciones antes de php artisan migrate.
-- En AWS crear un usuario de aplicación con permisos mínimos, no usar root.
