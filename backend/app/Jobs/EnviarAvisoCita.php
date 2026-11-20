<?php

namespace App\Jobs;

use App\Mail\AvisoCita;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Throwable;

class EnviarAvisoCita implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;
    public int $timeout = 60;
    public bool $failOnTimeout = true;

    public function __construct(public int $envioId) {}

    public function backoff(): array
    {
        return [15, 60];
    }

    public function handle(): void
    {
        // Bloquea solo este aviso durante su procesamiento por el worker.
        DB::transaction(function () {
            $envio = DB::table('envios_notificaciones')
                ->where('id', $this->envioId)->lockForUpdate()->first();

            if (! $envio || in_array($envio->estado, ['enviado', 'cancelado'], true)) {
                return;
            }

            $usuario = DB::table('usuarios')->where('id', $envio->usuario_id)
                ->where('activo', true)->whereNull('eliminado_en')->first();
            $cita = DB::table('citas')->where('id', $envio->cita_id)->first();
            $ahora = CarbonImmutable::now('America/El_Salvador');
            $esperado = match ($envio->codigo_plantilla) {
                'cita_solicitada' => 'pendiente',
                'cita_confirmada', 'cita_recordatorio' => 'confirmada',
                'cita_cancelada' => 'cancelada',
                default => null,
            };

            $obsoleto = ! $usuario || ! $cita || ! $esperado ||
                $cita->estado !== $esperado ||
                $usuario->correo !== $envio->destinatario;

            if (! $obsoleto && $envio->codigo_plantilla !== 'cita_cancelada') {
                $obsoleto = ! CarbonImmutable::parse(
                    $cita->inicia_en, 'America/El_Salvador'
                )->isAfter($ahora);
            }

            if ($obsoleto) {
                DB::table('envios_notificaciones')->where('id', $this->envioId)->update([
                    'estado' => 'cancelado',
                    'codigo_error' => 'AVISO_YA_NO_APLICA',
                    'actualizado_en' => $ahora->toDateTimeString(),
                ]);
                return;
            }

            $asunto = match ($envio->codigo_plantilla) {
                'cita_solicitada' => 'Solicitud de cita recibida',
                'cita_confirmada' => 'Cita confirmada',
                'cita_cancelada' => 'Cita cancelada',
                'cita_recordatorio' => 'Recordatorio de cita',
            };

            $inicio = CarbonImmutable::parse(
                $cita->inicia_en,
                'America/El_Salvador'
            );

            DB::table('envios_notificaciones')->where('id', $this->envioId)->update([
                'estado' => 'procesando',
                'intentos' => $this->attempts(),
                'actualizado_en' => $ahora->toDateTimeString(),
            ]);

            // Usa el mailer predeterminado de Laravel. En local es log y en
            // AWS es ses; el código no fuerza ningún transporte.
            Mail::to($envio->destinatario)->send(new AvisoCita(
                destinatarioNombre: $usuario->nombre,
                asuntoAviso: $asunto,
                citaId: (int) $cita->id,
                fechaHora: $inicio->format('d/m/Y H:i'),
            ));

            DB::table('envios_notificaciones')->where('id', $this->envioId)->update([
                'estado' => 'enviado',
                'enviado_en' => CarbonImmutable::now('America/El_Salvador')->toDateTimeString(),
                'mensaje_proveedor_id' => null,
                'codigo_error' => null,
                'actualizado_en' => CarbonImmutable::now('America/El_Salvador')->toDateTimeString(),
            ]);
        });
    }

    public function failed(?Throwable $error): void
    {
        DB::table('envios_notificaciones')->where('id', $this->envioId)
            ->whereNotIn('estado', ['enviado', 'cancelado'])->update([
                'estado' => 'fallido',
                'intentos' => $this->attempts(),
                'codigo_error' => 'PROCESAMIENTO_FALLIDO',
                'actualizado_en' => CarbonImmutable::now('America/El_Salvador')->toDateTimeString(),
            ]);
    }
}
