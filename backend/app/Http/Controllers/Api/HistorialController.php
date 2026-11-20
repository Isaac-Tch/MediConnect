<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class HistorialController extends Controller
{
    private const ZONA = 'America/El_Salvador';

    public function medico(Request $request): JsonResponse
    {
        $consulta = $this->consultaBase()
            ->where('pm.usuario_id', $request->user()->id)
            ->whereIn('c.estado', ['confirmada', 'completada']);

        return $this->listar($consulta, true);
    }

    public function paciente(Request $request): JsonResponse
    {
        $consulta = $this->consultaBase()
            ->where('pp.usuario_id', $request->user()->id)
            ->whereNotNull('hc.id')
            ->whereNotNull('hc.firmado_en');

        return $this->listar($consulta, false);
    }

    public function store(Request $request, int $cita): JsonResponse
    {
        foreach (
            ['sintomas', 'diagnostico', 'plan_tratamiento', 'observaciones']
            as $campo
        ) {
            if (is_string($request->input($campo))) {
                $valor = trim($request->input($campo));

                $request->merge([
                    $campo => $valor === '' ? null : $valor,
                ]);
            }
        }

        $datos = $request->validate([
            'sintomas' => ['required', 'string', 'max:10000'],
            'diagnostico' => ['required', 'string', 'max:10000'],
            'plan_tratamiento' => ['nullable', 'string', 'max:10000'],
            'observaciones' => ['nullable', 'string', 'max:10000'],
            'confirmacion' => ['accepted'],
        ], [
            'sintomas.required' => 'Describe los síntomas de la consulta.',
            'diagnostico.required' => 'Escribe el diagnóstico.',
            'max.string' => 'El campo :attribute admite hasta :max caracteres.',
            'confirmacion.accepted' =>
                'Confirma que revisaste la información antes de finalizar.',
        ]);

        try {
            $id = DB::transaction(function () use ($request, $cita, $datos) {
                $referencia = DB::table('citas as c')
                    ->join(
                        'horarios_cita as h',
                        'h.id',
                        '=',
                        'c.horario_id'
                    )
                    ->join(
                        'perfiles_medico as pm',
                        'pm.id',
                        '=',
                        'h.medico_id'
                    )
                    ->where('c.id', $cita)
                    ->where('pm.usuario_id', $request->user()->id)
                    ->select('c.horario_id', 'pm.id as medico_id')
                    ->first();

                abort_unless($referencia, 404, 'Cita no encontrada.');

                // Se conserva el orden de bloqueo usado por la agenda.
                $horario = DB::table('horarios_cita')
                    ->where('id', $referencia->horario_id)
                    ->where('medico_id', $referencia->medico_id)
                    ->lockForUpdate()
                    ->first();

                abort_unless($horario, 404, 'Horario no encontrado.');

                $registro = DB::table('citas')
                    ->where('id', $cita)
                    ->where('horario_id', $horario->id)
                    ->lockForUpdate()
                    ->first();

                abort_unless($registro, 404, 'Cita no encontrada.');

                abort_unless(
                    in_array(
                        $registro->estado,
                        ['confirmada', 'completada'],
                        true
                    ),
                    409,
                    'Solo puedes registrar la atención de una cita confirmada o completada.'
                );

                $inicio = CarbonImmutable::parse(
                    $registro->inicia_en,
                    self::ZONA
                );

                abort_if(
                    $inicio->isAfter($this->ahora()),
                    409,
                    'Todavía no ha llegado la hora de esta consulta.'
                );

                $existe = DB::table('historiales_clinicos')
                    ->where('cita_id', $cita)
                    ->exists();

                abort_if(
                    $existe,
                    409,
                    'Esta cita ya tiene un registro clínico. No se sobrescribirá.'
                );

                $ahora = $this->ahora()->toDateTimeString();

                $historialId = DB::table('historiales_clinicos')
                    ->insertGetId([
                        'cita_id' => $cita,
                        'sintomas' => $datos['sintomas'],
                        'diagnostico' => $datos['diagnostico'],
                        'plan_tratamiento' =>
                            $datos['plan_tratamiento'] ?? null,
                        'observaciones' => $datos['observaciones'] ?? null,
                        'registrado_en' => $ahora,
                        'firmado_en' => $ahora,
                        'creado_en' => $ahora,
                        'actualizado_en' => $ahora,
                    ]);

                DB::table('citas')
                    ->where('id', $cita)
                    ->update([
                        'estado' => 'completada',
                        'actualizado_en' => $ahora,
                    ]);

                // Guarda quién realizó la acción, sin copiar el diagnóstico.
                DB::table('registros_auditoria')->insert([
                    'usuario_actor_id' => $request->user()->id,
                    'accion' => 'historial_clinico.creado',
                    'tipo_recurso' => 'historial_clinico',
                    'recurso_id' => $historialId,
                    'ocurrido_en' => $ahora,
                    'solicitud_id' => (string) Str::uuid(),
                    'direccion_ip' => $request->ip(),
                    'detalles' => json_encode([
                        'cita_id' => $cita,
                    ], JSON_THROW_ON_ERROR),
                    'creado_en' => $ahora,
                    'actualizado_en' => $ahora,
                ]);

                return $historialId;
            });
        } catch (QueryException $error) {
            if ((int) ($error->errorInfo[1] ?? 0) === 1062) {
                throw ValidationException::withMessages([
                    'historial' =>
                        'Esta cita ya tiene un historial registrado. Actualiza el listado.',
                ]);
            }

            throw $error;
        }

        return response()->json([
            'message' =>
                'Atención registrada. La cita quedó completada y el paciente puede consultar el historial.',
            'id' => $id,
        ], 201);
    }

    private function consultaBase(): Builder
    {
        return DB::table('citas as c')
            ->join('horarios_cita as h', 'h.id', '=', 'c.horario_id')
            ->join('perfiles_medico as pm', 'pm.id', '=', 'h.medico_id')
            ->join('usuarios as um', 'um.id', '=', 'pm.usuario_id')
            ->join('perfiles_paciente as pp', 'pp.id', '=', 'c.paciente_id')
            ->join('usuarios as up', 'up.id', '=', 'pp.usuario_id')
            ->leftJoin(
                'historiales_clinicos as hc',
                'hc.cita_id',
                '=',
                'c.id'
            )
            ->select([
                'c.id as cita_id',
                'c.inicia_en',
                'c.estado',
                'c.motivo',
                'um.nombre as medico',
                'up.nombre as paciente',
                'hc.id as historial_id',
                'hc.sintomas',
                'hc.diagnostico',
                'hc.plan_tratamiento',
                'hc.observaciones',
                'hc.registrado_en',
                'hc.firmado_en',
            ]);
    }

    private function listar(
        Builder $consulta,
        bool $esMedico
    ): JsonResponse {
        $resultado = $consulta
            ->orderByDesc('c.inicia_en')
            ->orderByDesc('c.id')
            ->paginate(10)
            ->through(function ($fila) use ($esMedico) {
                $puedeRegistrar =
                    $esMedico &&
                    $fila->historial_id === null &&
                    in_array(
                        $fila->estado,
                        ['confirmada', 'completada'],
                        true
                    ) &&
                    ! CarbonImmutable::parse(
                        $fila->inicia_en,
                        self::ZONA
                    )->isAfter($this->ahora());

                return [
                    'cita_id' => $fila->cita_id,
                    'inicia_en' => $fila->inicia_en,
                    'estado' => $fila->estado,
                    'motivo' => $fila->motivo,
                    'medico' => $fila->medico,
                    'paciente' => $fila->paciente,
                    'puede_registrar' => $puedeRegistrar,
                    'historial' => $fila->historial_id === null
                        ? null
                        : [
                            'id' => $fila->historial_id,
                            'sintomas' => $fila->sintomas,
                            'diagnostico' => $fila->diagnostico,
                            'plan_tratamiento' => $fila->plan_tratamiento,
                            'observaciones' => $fila->observaciones,
                            'registrado_en' => $fila->registrado_en,
                            'firmado_en' => $fila->firmado_en,
                        ],
                ];
            });

        return response()->json($resultado);
    }

    private function ahora(): CarbonImmutable
    {
        return CarbonImmutable::now(self::ZONA);
    }
}
