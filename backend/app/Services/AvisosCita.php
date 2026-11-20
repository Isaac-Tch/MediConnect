<?php

namespace App\Services;

use App\Jobs\EnviarAvisoCita;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class AvisosCita
{
    public function registrar(int $citaId, string $evento): void
    {
        if (! in_array($evento, ['solicitada', 'confirmada', 'cancelada', 'recordatorio'], true)) {
            throw new InvalidArgumentException('Evento de cita desconocido.');
        }

        // La cola usa el mismo MySQL que la cita: ambos se confirman o revierten juntos.
        DB::transaction(function () use ($citaId, $evento) {
            $cita = DB::table('citas')->where('id', $citaId)->lockForUpdate()->first();
            if (! $cita) {
                return;
            }

            $ahora = CarbonImmutable::now('America/El_Salvador');
            if ($evento === 'recordatorio' && (
                $cita->estado !== 'confirmada' ||
                ! CarbonImmutable::parse($cita->inicia_en, 'America/El_Salvador')->isAfter($ahora)
            )) {
                return;
            }

            $pacienteId = DB::table('perfiles_paciente')
                ->where('id', $cita->paciente_id)->value('usuario_id');
            $medicoId = DB::table('horarios_cita as h')
                ->join('perfiles_medico as m', 'm.id', '=', 'h.medico_id')
                ->where('h.id', $cita->horario_id)->value('m.usuario_id');

            $this->notificarEnApp($cita, $citaId, $evento, (int) $pacienteId, (int) $medicoId, $ahora);

            $usuarios = DB::table('usuarios')->whereIn('id', [$pacienteId, $medicoId])
                ->where('activo', true)->whereNull('eliminado_en')->get(['id', 'correo']);

            foreach ($usuarios as $usuario) {
                $clave = "correo:cita:{$citaId}:{$evento}:{$usuario->id}";

                // La clave única hace que un reintento o una solicitud
                // concurrente no cree un segundo aviso.
                $insertado = DB::table('envios_notificaciones')->insertOrIgnore([
                    'usuario_id' => $usuario->id,
                    'cita_id' => $citaId,
                    'canal' => 'correo',
                    'destinatario' => $usuario->correo,
                    'codigo_plantilla' => 'cita_'.$evento,
                    'clave_deduplicacion' => $clave,
                    'estado' => 'pendiente',
                    'programado_en' => $ahora->toDateTimeString(),
                    'intentos' => 0,
                    'creado_en' => $ahora->toDateTimeString(),
                    'actualizado_en' => $ahora->toDateTimeString(),
                ]);

                if ($insertado === 0) {
                    continue;
                }

                $id = DB::table('envios_notificaciones')
                    ->where('clave_deduplicacion', $clave)
                    ->value('id');

                if (! $id) {
                    continue;
                }

                // afterCommit garantiza que SQS (AWS) reciba el job solo
                // cuando la cita y el aviso ya estén confirmados en la BD.
                Bus::dispatch((new EnviarAvisoCita((int) $id))
                    ->onConnection('notificaciones')
                    ->onQueue('notificaciones')
                    ->afterCommit());
            }
        });
    }

    private function notificarEnApp(object $cita, int $citaId, string $evento, int $pacienteId, int $medicoId, CarbonImmutable $ahora): void
    {
        $fecha = CarbonImmutable::parse($cita->inicia_en, 'America/El_Salvador')->format('d/m/Y H:i');

        // Enlace de videollamada: solo al confirmar y en el recordatorio.
        $url = in_array($evento, ['confirmada', 'recordatorio'], true)
            ? (new JitsiVideoProvider)->crearSala($citaId)->url
            : null;

        $mensajes = match ($evento) {
            'solicitada' => [
                $medicoId => ['Nueva solicitud de cita', "Un paciente solicitó la cita #{$citaId} para el {$fecha}. Revisa tu agenda para confirmarla."],
            ],
            'confirmada' => [
                $pacienteId => ['Cita confirmada', "Tu cita #{$citaId} del {$fecha} fue confirmada. Usa el enlace para la videollamada."],
                $medicoId => ['Cita confirmada', "Confirmaste la cita #{$citaId} del {$fecha}. Enlace de videollamada listo."],
            ],
            'cancelada' => [
                $pacienteId => ['Cita cancelada', "La cita #{$citaId} del {$fecha} fue cancelada."],
                $medicoId => ['Cita cancelada', "La cita #{$citaId} del {$fecha} fue cancelada."],
            ],
            'recordatorio' => [
                $pacienteId => ['Recordatorio de cita', "Tu cita #{$citaId} es el {$fecha}."],
                $medicoId => ['Recordatorio de cita', "Tienes la cita #{$citaId} el {$fecha}."],
            ],
        };

        foreach ($mensajes as $usuarioId => [$titulo, $mensaje]) {
            DB::table('notificaciones_app')->insertOrIgnore([
                'usuario_id' => $usuarioId,
                'cita_id' => $citaId,
                'tipo' => 'cita_'.$evento,
                'titulo' => $titulo,
                'mensaje' => $mensaje,
                'url' => $url,
                'clave_deduplicacion' => "app:cita:{$citaId}:{$evento}:{$usuarioId}",
                'creado_en' => $ahora->toDateTimeString(),
            ]);
        }
    }
}
