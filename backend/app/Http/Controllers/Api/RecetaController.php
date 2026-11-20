<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class RecetaController extends Controller
{
    private const ZONA = 'America/El_Salvador';

    public function medico(Request $request): JsonResponse
    {
        return $this->listar(
            $this->consultaBase()
                ->where('pm.usuario_id', $request->user()->id)
        );
    }

    public function paciente(Request $request): JsonResponse
    {
        return $this->listar(
            $this->consultaBase()
                ->where('pp.usuario_id', $request->user()->id)
                ->whereIn('r.estado', ['emitida', 'anulada'])
                ->whereNotNull('hc.firmado_en')
        );
    }

    public function atenciones(Request $request): JsonResponse
    {
        $atenciones = DB::table('historiales_clinicos as hc')
            ->join('citas as c', 'c.id', '=', 'hc.cita_id')
            ->join('horarios_cita as h', 'h.id', '=', 'c.horario_id')
            ->join('perfiles_medico as pm', 'pm.id', '=', 'h.medico_id')
            ->join('perfiles_paciente as pp', 'pp.id', '=', 'c.paciente_id')
            ->join('usuarios as up', 'up.id', '=', 'pp.usuario_id')
            ->where('pm.usuario_id', $request->user()->id)
            ->where('c.estado', 'completada')
            ->whereNotNull('hc.firmado_en')
            ->whereNotExists(function ($query) {
                $query->selectRaw('1')
                    ->from('recetas as r')
                    ->whereColumn('r.historial_clinico_id', 'hc.id')
                    ->where('r.estado', 'emitida');
            })
            ->select([
                'hc.id',
                'c.id as cita_id',
                'c.inicia_en',
                'up.nombre as paciente',
            ])
            ->orderByDesc('c.inicia_en')
            ->orderByDesc('hc.id')
            ->paginate(10);

        return response()->json($atenciones);
    }

    public function store(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'historial_clinico_id' => ['required', 'integer', 'min:1'],
            'vence_fecha' => [
                'nullable',
                'date_format:Y-m-d',
                'after_or_equal:'.$this->ahora()->toDateString(),
            ],
            'indicaciones' => ['nullable', 'string', 'max:5000'],
            'confirmacion' => ['accepted'],
            'medicamentos' => ['required', 'array', 'min:1', 'max:20'],
            'medicamentos.*' => [
                'required',
                'array:medicamento,dosis,frecuencia,duracion_dias,via_administracion,cantidad,indicaciones',
            ],
            'medicamentos.*.medicamento' => [
                'required', 'string', 'max:200',
            ],
            'medicamentos.*.dosis' => [
                'required', 'string', 'max:100',
            ],
            'medicamentos.*.frecuencia' => [
                'required', 'string', 'max:150',
            ],
            'medicamentos.*.duracion_dias' => [
                'required', 'integer', 'min:1', 'max:65535',
            ],
            'medicamentos.*.via_administracion' => [
                'required', 'string', 'max:100',
            ],
            'medicamentos.*.cantidad' => [
                'required',
                'numeric',
                'decimal:0,2',
                'gt:0',
                'max:99999999.99',
            ],
            'medicamentos.*.indicaciones' => [
                'nullable', 'string', 'max:5000',
            ],
        ], [
            'historial_clinico_id.required' =>
                'Selecciona una atención clínica.',
            'vence_fecha.after_or_equal' =>
                'La fecha de vencimiento no puede estar en el pasado.',
            'confirmacion.accepted' =>
                'Confirma que revisaste la receta.',
            'medicamentos.required' =>
                'Agrega al menos un medicamento.',
            'medicamentos.max' =>
                'Puedes incluir hasta 20 medicamentos.',
            'medicamentos.*.medicamento.required' =>
                'Indica el nombre del medicamento en la fila :position.',
            'medicamentos.*.dosis.required' =>
                'Indica la dosis en la fila :position.',
            'medicamentos.*.frecuencia.required' =>
                'Indica la frecuencia en la fila :position.',
            'medicamentos.*.via_administracion.required' =>
                'Indica la vía de administración en la fila :position.',
            'medicamentos.*.duracion_dias.min' =>
                'La duración debe ser mayor que cero.',
            'medicamentos.*.cantidad.gt' =>
                'La cantidad debe ser mayor que cero.',
        ]);

        $numero = DB::transaction(function () use ($request, $datos) {
            $referencia = DB::table('historiales_clinicos as hc')
                ->join('citas as c', 'c.id', '=', 'hc.cita_id')
                ->join('horarios_cita as h', 'h.id', '=', 'c.horario_id')
                ->join('perfiles_medico as pm', 'pm.id', '=', 'h.medico_id')
                ->where('hc.id', $datos['historial_clinico_id'])
                ->where('pm.usuario_id', $request->user()->id)
                ->select('hc.id', 'c.id as cita_id')
                ->first();

            abort_unless(
                $referencia,
                404,
                'Atención clínica no encontrada.'
            );

            $historial = DB::table('historiales_clinicos')
                ->where('id', $referencia->id)
                ->lockForUpdate()
                ->first();

            abort_unless(
                $historial && $historial->firmado_en !== null,
                409,
                'Primero debes finalizar la atención clínica.'
            );

            $citaCompletada = DB::table('citas')
                ->where('id', $referencia->cita_id)
                ->where('estado', 'completada')
                ->exists();

            abort_unless(
                $citaCompletada,
                409,
                'La cita debe estar completada.'
            );

            $existe = DB::table('recetas')
                ->where('historial_clinico_id', $historial->id)
                ->where('estado', 'emitida')
                ->exists();

            abort_if(
                $existe,
                409,
                'Esta atención ya tiene una receta emitida. Si necesitas reemplazarla, anula la anterior.'
            );

            $ahora = $this->ahora();
            $vence = ! empty($datos['vence_fecha'])
                ? CarbonImmutable::parse(
                    $datos['vence_fecha'],
                    self::ZONA
                )->endOfDay()->setMicrosecond(0)
                : null;

            abort_if(
                $vence && ! $vence->isAfter($ahora),
                422,
                'La fecha de vencimiento debe ser posterior a la emisión.'
            );

            $numero = 'REC-'.Str::uuid();
            $marca = $ahora->toDateTimeString();

            $recetaId = DB::table('recetas')->insertGetId([
                'historial_clinico_id' => $historial->id,
                'numero_receta' => $numero,
                'emitida_en' => $marca,
                'vence_en' => $vence?->toDateTimeString(),
                'indicaciones' => $datos['indicaciones'] ?? null,
                'estado' => 'emitida',
                'creado_en' => $marca,
                'actualizado_en' => $marca,
            ]);

            foreach ($datos['medicamentos'] as $medicamento) {
                DB::table('detalles_receta')->insert([
                    'receta_id' => $recetaId,
                    'medicamento' => $medicamento['medicamento'],
                    'dosis' => $medicamento['dosis'],
                    'frecuencia' => $medicamento['frecuencia'],
                    'duracion_dias' => $medicamento['duracion_dias'],
                    'via_administracion' =>
                        $medicamento['via_administracion'],
                    'cantidad' => $medicamento['cantidad'],
                    'indicaciones' =>
                        $medicamento['indicaciones'] ?? null,
                    'creado_en' => $marca,
                    'actualizado_en' => $marca,
                ]);
            }

            $this->auditar(
                $request,
                'receta.emitida',
                $recetaId,
                ['historial_clinico_id' => $historial->id]
            );

            return $numero;
        });

        return response()->json([
            'message' => 'Receta emitida correctamente.',
            'numero_receta' => $numero,
        ], 201);
    }

    public function anular(Request $request, int $receta): JsonResponse
    {
        $datos = $request->validate([
            'motivo' => ['required', 'string', 'max:1000'],
        ], [
            'motivo.required' => 'Indica el motivo de la anulación.',
        ]);

        abort_if(
            trim($datos['motivo']) === '',
            422,
            'Indica el motivo de la anulación.'
        );

        DB::transaction(function () use ($request, $receta, $datos) {
            $referencia = $this->consultaBase()
                ->where('r.id', $receta)
                ->where('pm.usuario_id', $request->user()->id)
                ->first(['r.historial_clinico_id']);

            abort_unless($referencia, 404, 'Receta no encontrada.');

            // Mismo bloqueo usado al emitir una receta.
            DB::table('historiales_clinicos')
                ->where('id', $referencia->historial_clinico_id)
                ->lockForUpdate()
                ->first();

            $registro = DB::table('recetas')
                ->where('id', $receta)
                ->lockForUpdate()
                ->first();

            abort_unless(
                $registro && $registro->estado === 'emitida',
                409,
                'Solo puedes anular una receta emitida.'
            );

            DB::table('recetas')
                ->where('id', $receta)
                ->update([
                    'estado' => 'anulada',
                    'actualizado_en' => $this->ahora()->toDateTimeString(),
                ]);

            $this->auditar(
                $request,
                'receta.anulada',
                $receta,
                ['motivo' => trim($datos['motivo'])]
            );
        });

        return response()->json([
            'message' => 'Receta anulada. Ahora puedes emitir una nueva.',
        ]);
    }

    private function consultaBase(): Builder
    {
        return DB::table('recetas as r')
            ->join(
                'historiales_clinicos as hc',
                'hc.id',
                '=',
                'r.historial_clinico_id'
            )
            ->join('citas as c', 'c.id', '=', 'hc.cita_id')
            ->join('horarios_cita as h', 'h.id', '=', 'c.horario_id')
            ->join('perfiles_medico as pm', 'pm.id', '=', 'h.medico_id')
            ->join('usuarios as um', 'um.id', '=', 'pm.usuario_id')
            ->join('perfiles_paciente as pp', 'pp.id', '=', 'c.paciente_id')
            ->join('usuarios as up', 'up.id', '=', 'pp.usuario_id');
    }

    private function listar(Builder $consulta): JsonResponse
    {
        $pagina = $consulta
            ->select([
                'r.id',
                'r.numero_receta',
                'r.emitida_en',
                'r.vence_en',
                'r.estado',
                'r.indicaciones',
                'c.id as cita_id',
                'um.nombre as medico',
                'up.nombre as paciente',
            ])
            ->orderByDesc('r.id')
            ->paginate(10);

        $detalles = DB::table('detalles_receta')
            ->whereIn('receta_id', $pagina->getCollection()->pluck('id'))
            ->orderBy('id')
            ->get([
                'receta_id',
                'medicamento',
                'dosis',
                'frecuencia',
                'duracion_dias',
                'via_administracion',
                'cantidad',
                'indicaciones',
            ])
            ->groupBy('receta_id');

        $pagina->through(function ($receta) use ($detalles) {
            $receta->vencida = $receta->vence_en !== null &&
                CarbonImmutable::parse(
                    $receta->vence_en,
                    self::ZONA
                )->lessThanOrEqualTo($this->ahora());

            $receta->medicamentos = $detalles
                ->get($receta->id, collect())
                ->values();

            return $receta;
        });

        return response()->json($pagina);
    }

    private function auditar(
        Request $request,
        string $accion,
        int $recetaId,
        array $detalles
    ): void {
        $marca = $this->ahora()->toDateTimeString();

        DB::table('registros_auditoria')->insert([
            'usuario_actor_id' => $request->user()->id,
            'accion' => $accion,
            'tipo_recurso' => 'receta',
            'recurso_id' => $recetaId,
            'ocurrido_en' => $marca,
            'solicitud_id' => (string) Str::uuid(),
            'direccion_ip' => $request->ip(),
            'detalles' => json_encode($detalles, JSON_THROW_ON_ERROR),
            'creado_en' => $marca,
            'actualizado_en' => $marca,
        ]);
    }

    private function ahora(): CarbonImmutable
    {
        return CarbonImmutable::now(self::ZONA);
    }
}

