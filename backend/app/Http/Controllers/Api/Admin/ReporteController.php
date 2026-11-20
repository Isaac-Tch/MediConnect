<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Jobs\GenerarReporte;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReporteController extends Controller
{
    private const ZONA = 'America/El_Salvador';

    public function index(): JsonResponse
    {
        $reportes = DB::table('solicitudes_reporte as r')
            ->join('usuarios as u', 'u.id', '=', 'r.solicitado_por')
            ->select([
                'r.id',
                'r.tipo_reporte',
                'r.periodo_inicio',
                'r.periodo_fin',
                'r.estado',
                'r.creado_en',
                'r.iniciado_en',
                'r.completado_en',
                'r.intentos',
                'r.codigo_error',
                'u.nombre as solicitado_por_nombre',
            ])
            ->orderByDesc('r.id')
            ->paginate(10);

        return response()->json($reportes);
    }

    public function store(Request $request): JsonResponse
    {
        $hoy = CarbonImmutable::now(self::ZONA)->toDateString();

        $datos = $request->validate([
            'tipo_reporte' => [
                'required',
                Rule::in(['citas', 'pagos', 'estadisticas_semanales']),
            ],
            'periodo_inicio' => [
                'required',
                'date_format:Y-m-d',
                'before_or_equal:'.$hoy,
            ],
            'periodo_fin' => [
                'required',
                'date_format:Y-m-d',
                'after_or_equal:periodo_inicio',
                'before_or_equal:'.$hoy,
            ],
            'clave_solicitud' => ['required', 'uuid'],
        ], [
            'tipo_reporte.in' => 'Selecciona un tipo de reporte válido.',
            'periodo_fin.after_or_equal' =>
                'La fecha final no puede ser anterior a la inicial.',
            'periodo_inicio.before_or_equal' =>
                'No puedes solicitar reportes de fechas futuras.',
            'periodo_fin.before_or_equal' =>
                'No puedes solicitar reportes de fechas futuras.',
        ]);

        $inicio = CarbonImmutable::parse($datos['periodo_inicio'], self::ZONA);
        $fin = CarbonImmutable::parse($datos['periodo_fin'], self::ZONA);
        $dias = (int) $inicio->diffInDays($fin) + 1;

        if ($dias > 366) {
            throw ValidationException::withMessages([
                'periodo_fin' => 'Selecciona un período de hasta 366 días.',
            ]);
        }

        if (
            $datos['tipo_reporte'] === 'estadisticas_semanales' &&
            $dias !== 7
        ) {
            throw ValidationException::withMessages([
                'periodo_fin' =>
                    'El resumen semanal debe incluir exactamente siete días.',
            ]);
        }

        $clave = $request->user()->id.':'.$datos['clave_solicitud'];

        try {
            $id = DB::transaction(function () use ($request, $datos, $clave) {
                $existente = DB::table('solicitudes_reporte')
                    ->where('clave_deduplicacion', $clave)
                    ->first();

                if ($existente) {
                    $this->comprobarSolicitud($existente, $datos);
                    return $existente->id;
                }

                $marca = CarbonImmutable::now(self::ZONA)->toDateTimeString();

                $id = DB::table('solicitudes_reporte')->insertGetId([
                    'solicitado_por' => $request->user()->id,
                    'tipo_reporte' => $datos['tipo_reporte'],
                    'periodo_inicio' => $datos['periodo_inicio'],
                    'periodo_fin' => $datos['periodo_fin'],
                    'estado' => 'pendiente',
                    'clave_deduplicacion' => $clave,
                    'intentos' => 0,
                    'creado_en' => $marca,
                    'actualizado_en' => $marca,
                ]);

                // La cola y la solicitud usan la misma conexión en local.
                // afterCommit evita enviar el job a SQS antes de confirmar la BD.
                Bus::dispatch(
                    (new GenerarReporte($id))
                        ->onConnection('reportes')
                        ->onQueue('reportes')
                        ->afterCommit()
                );

                $this->auditar($request, 'reporte.solicitado', $id);

                return $id;
            });
        } catch (QueryException $error) {
            if ((int) ($error->errorInfo[1] ?? 0) !== 1062) {
                throw $error;
            }

            $existente = DB::table('solicitudes_reporte')
                ->where('clave_deduplicacion', $clave)
                ->first();

            if (! $existente) {
                throw $error;
            }

            $this->comprobarSolicitud($existente, $datos);
            $id = $existente->id;
        }

        return response()->json([
            'message' => 'Solicitud registrada. El reporte se procesará en segundo plano.',
            'id' => $id,
        ], 202);
    }

    public function descargar(
        Request $request,
        int $reporte
    ): StreamedResponse {
        $registro = DB::table('solicitudes_reporte')
            ->where('id', $reporte)
            ->first();

        abort_unless($registro, 404, 'Reporte no encontrado.');

        abort_unless(
            $registro->estado === 'completado',
            409,
            'El reporte todavía no está disponible.'
        );

        abort_unless(
            in_array($registro->disco_salida, ['local', 's3'], true),
            404,
            'El almacenamiento del reporte no está disponible.'
        );

        /** @var FilesystemAdapter $disco */
        $disco = Storage::disk($registro->disco_salida);

        abort_unless(
            $disco->exists($registro->clave_salida),
            404,
            'El archivo del reporte no está disponible.'
        );

        $this->auditar($request, 'reporte.descargado', $reporte);

        return $disco->download(
            $registro->clave_salida,
            'reporte-'.$registro->id.'.csv',
            [
                'Content-Type' => 'text/csv; charset=UTF-8',
                'Cache-Control' => 'private, no-store, max-age=0',
                'X-Content-Type-Options' => 'nosniff',
            ]
        );
    }

    private function comprobarSolicitud(object $existente, array $datos): void
    {
        abort_unless(
            $existente->tipo_reporte === $datos['tipo_reporte'] &&
            $existente->periodo_inicio === $datos['periodo_inicio'] &&
            $existente->periodo_fin === $datos['periodo_fin'],
            409,
            'La solicitud ya fue utilizada con otros parámetros.'
        );
    }

    private function auditar(
        Request $request,
        string $accion,
        int $reporteId
    ): void {
        $marca = CarbonImmutable::now(self::ZONA)->toDateTimeString();

        DB::table('registros_auditoria')->insert([
            'usuario_actor_id' => $request->user()->id,
            'accion' => $accion,
            'tipo_recurso' => 'reporte',
            'recurso_id' => $reporteId,
            'ocurrido_en' => $marca,
            'solicitud_id' => (string) Str::uuid(),
            'direccion_ip' => $request->ip(),
            'detalles' => null,
            'creado_en' => $marca,
            'actualizado_en' => $marca,
        ]);
    }
}

