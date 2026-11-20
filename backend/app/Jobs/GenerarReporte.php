<?php

namespace App\Jobs;

use Carbon\CarbonImmutable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Throwable;

class GenerarReporte implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;
    public int $timeout = 1200;
    public bool $failOnTimeout = true;

    private const ZONA = 'America/El_Salvador';

    public function __construct(public int $reporteId)
    {
    }

    public function handle(): void
    {
        $reporte = DB::transaction(function () {
            $registro = DB::table('solicitudes_reporte')
                ->where('id', $this->reporteId)
                ->lockForUpdate()
                ->first();

            if (! $registro || $registro->estado === 'completado') {
                return null;
            }

            if ($registro->estado === 'fallido') {
                return null;
            }

            $marca = $this->ahora();

            DB::table('solicitudes_reporte')
                ->where('id', $registro->id)
                ->update([
                    'estado' => 'procesando',
                    'iniciado_en' => $marca,
                    'completado_en' => null,
                    'codigo_error' => null,
                    'intentos' => $registro->intentos + 1,
                    'actualizado_en' => $marca,
                ]);

            return $registro;
        });

        if (! $reporte) {
            return;
        }

        $stream = null;

        try {
            $stream = fopen('php://temp/maxmemory:5242880', 'w+b');

            if ($stream === false) {
                throw new RuntimeException(
                    'No se pudo preparar el CSV.'
                );
            }

            // Facilita la lectura de acentos en Excel.
            fwrite($stream, "\xEF\xBB\xBF");

            $this->fila($stream, [
                'seccion',
                'fecha',
                'especialidad',
                'estado',
                'cantidad',
                'moneda',
                'monto_cobrado',
                'monto_reembolsado',
                'monto_neto',
            ]);

            $inicio = $reporte->periodo_inicio.' 00:00:00';

            $fin = CarbonImmutable::parse(
                $reporte->periodo_fin,
                self::ZONA
            )
                ->addDay()
                ->startOfDay()
                ->toDateTimeString();

            if (in_array(
                $reporte->tipo_reporte,
                ['citas', 'estadisticas_semanales'],
                true
            )) {
                $filas = DB::table('citas as c')
                    ->join(
                        'horarios_cita as h',
                        'h.id',
                        '=',
                        'c.horario_id'
                    )
                    ->join(
                        'perfiles_medico as m',
                        'm.id',
                        '=',
                        'h.medico_id'
                    )
                    ->join(
                        'especialidades as e',
                        'e.id',
                        '=',
                        'm.especialidad_id'
                    )
                    ->where('c.inicia_en', '>=', $inicio)
                    ->where('c.inicia_en', '<', $fin)
                    ->selectRaw(
                        'DATE(c.inicia_en) as fecha,
                         e.nombre as especialidad,
                         c.estado,
                         COUNT(*) as cantidad'
                    )
                    ->groupByRaw(
                        'DATE(c.inicia_en), e.id, e.nombre, c.estado'
                    )
                    ->orderBy('fecha')
                    ->orderBy('e.nombre')
                    ->orderBy('c.estado')
                    ->cursor();

                foreach ($filas as $fila) {
                    $this->fila($stream, [
                        'citas',
                        $fila->fecha,
                        $fila->especialidad,
                        $fila->estado,
                        $fila->cantidad,
                        '',
                        '',
                        '',
                        '',
                    ]);
                }
            }

            if (in_array(
                $reporte->tipo_reporte,
                ['pagos', 'estadisticas_semanales'],
                true
            )) {
                $filas = DB::table('pagos')
                    ->whereIn('estado', ['pagado', 'reembolsado'])
                    ->where('pagado_en', '>=', $inicio)
                    ->where('pagado_en', '<', $fin)
                    ->selectRaw(
                        'DATE(pagado_en) as fecha,
                         estado,
                         moneda,
                         COUNT(*) as cantidad,
                         SUM(monto) as monto_cobrado,
                         SUM(monto_reembolsado) as monto_reembolsado,
                         SUM(monto - monto_reembolsado) as monto_neto'
                    )
                    ->groupByRaw('DATE(pagado_en), estado, moneda')
                    ->orderBy('fecha')
                    ->orderBy('estado')
                    ->cursor();

                foreach ($filas as $fila) {
                    $this->fila($stream, [
                        'pagos',
                        $fila->fecha,
                        '',
                        $fila->estado,
                        $fila->cantidad,
                        $fila->moneda,
                        $fila->monto_cobrado,
                        $fila->monto_reembolsado,
                        $fila->monto_neto,
                    ]);
                }
            }

            rewind($stream);

            $clave = 'reportes/reporte-'.$this->reporteId.'.csv';
            $disco = (string) config('filesystems.reports_disk', 'local');

            $guardado = Storage::disk($disco)->put($clave, $stream);

            if (! $guardado) {
                throw new RuntimeException(
                    'No se pudo guardar el reporte.'
                );
            }

            DB::table('solicitudes_reporte')
                ->where('id', $this->reporteId)
                ->update([
                    'estado' => 'completado',
                    'disco_salida' => $disco,
                    'clave_salida' => $clave,
                    'completado_en' => $this->ahora(),
                    'codigo_error' => null,
                    'actualizado_en' => $this->ahora(),
                ]);
        } catch (Throwable $error) {
            $this->marcarFallido();

            throw $error;
        } finally {
            if (is_resource($stream)) {
                fclose($stream);
            }
        }
    }

    public function failed(?Throwable $exception): void
    {
        $this->marcarFallido();
    }

    private function marcarFallido(): void
    {
        DB::table('solicitudes_reporte')
            ->where('id', $this->reporteId)
            ->where('estado', '<>', 'completado')
            ->update([
                'estado' => 'fallido',
                'codigo_error' => 'GENERACION_FALLIDA',
                'actualizado_en' => $this->ahora(),
            ]);
    }

    /**
     * @param resource $stream
     * @param array<int, mixed> $valores
     */
    private function fila($stream, array $valores): void
    {
        $seguros = array_map(function ($valor) {
            $texto = (string) ($valor ?? '');

            // Evita interpretar texto del CSV como fórmulas.
            if (preg_match('/^[\s]*[=+\-@]/u', $texto)) {
                $texto = "'".$texto;
            }

            return $texto;
        }, $valores);

        $resultado = fputcsv($stream, $seguros, ';', '"', '');

        if ($resultado === false) {
            throw new RuntimeException(
                'No se pudo escribir una fila.'
            );
        }
    }

    private function ahora(): string
    {
        return CarbonImmutable::now(self::ZONA)->toDateTimeString();
    }
}

