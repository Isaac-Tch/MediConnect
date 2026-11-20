<?php

namespace App\Http\Controllers\Api\Medico;

use App\Http\Controllers\Controller;
use App\Services\AvisosCita;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AgendaController extends Controller
{
    private const ZONA = 'America/El_Salvador';

    public function horarios(Request $request): JsonResponse
    {
        $medicoId = $this->medicoId($request);
        $fecha = $this->validarFecha($request);

        $horarios = DB::table('horarios_cita as h')
            ->where('h.medico_id', $medicoId)
            ->where('h.inicia_en', '>=', $fecha.' 00:00:00')
            ->where('h.inicia_en', '<', $this->diaSiguiente($fecha))
            ->select([
                'h.id',
                'h.inicia_en',
                'h.termina_en',
            ])
            ->selectSub(function ($query) {
                $query->from('citas')
                    ->selectRaw('COUNT(*)')
                    ->whereColumn('citas.horario_id', 'h.id');
            }, 'total_citas')
            ->selectSub(function ($query) {
                $query->from('citas')
                    ->selectRaw('COUNT(*)')
                    ->whereColumn('citas.horario_id', 'h.id')
                    ->where('estado', '<>', 'cancelada');
            }, 'citas_ocupantes')
            ->orderBy('h.inicia_en')
            ->get()
            ->map(function ($horario) {
                $futuro = CarbonImmutable::parse(
                    $horario->inicia_en,
                    self::ZONA
                )->isAfter($this->ahora());

                return [
                    'id' => $horario->id,
                    'inicia_en' => $horario->inicia_en,
                    'termina_en' => $horario->termina_en,
                    'total_citas' => (int) $horario->total_citas,
                    'ocupado' => (int) $horario->citas_ocupantes > 0,
                    'editable' => $futuro &&
                        (int) $horario->total_citas === 0,
                ];
            });

        return response()->json([
            'data' => $horarios,
            'zona_horaria' => self::ZONA,
        ]);
    }

    public function crearHorario(Request $request): JsonResponse
    {
        $medicoId = $this->medicoId($request);
        $inicio = $this->validarInicio($request);
        $ahora = $this->ahora()->toDateTimeString();

        try {
            $id = DB::table('horarios_cita')->insertGetId([
                'medico_id' => $medicoId,
                'inicia_en' => $inicio->toDateTimeString(),
                'termina_en' => $inicio->addMinutes(30)->toDateTimeString(),
                'creado_en' => $ahora,
                'actualizado_en' => $ahora,
            ]);
        } catch (QueryException $error) {
            $this->manejarConflicto($error);
        }

        return response()->json([
            'message' => 'Horario creado correctamente.',
            'id' => $id,
        ], 201);
    }

    public function editarHorario(
        Request $request,
        int $horario
    ): JsonResponse {
        $medicoId = $this->medicoId($request);
        $inicio = $this->validarInicio($request);

        try {
            DB::transaction(function () use ($medicoId, $horario, $inicio) {
                $registro = DB::table('horarios_cita')
                    ->where('id', $horario)
                    ->where('medico_id', $medicoId)
                    ->lockForUpdate()
                    ->first();

                abort_unless($registro, 404, 'Horario no encontrado.');

                $this->comprobarHorarioEditable($registro);

                DB::table('horarios_cita')
                    ->where('id', $horario)
                    ->update([
                        'inicia_en' => $inicio->toDateTimeString(),
                        'termina_en' =>
                            $inicio->addMinutes(30)->toDateTimeString(),
                        'actualizado_en' =>
                            $this->ahora()->toDateTimeString(),
                    ]);
            });
        } catch (QueryException $error) {
            $this->manejarConflicto($error);
        }

        return response()->json([
            'message' => 'Horario actualizado correctamente.',
        ]);
    }

    public function eliminarHorario(
        Request $request,
        int $horario
    ): JsonResponse {
        $medicoId = $this->medicoId($request);

        try {
            DB::transaction(function () use ($medicoId, $horario) {
                $registro = DB::table('horarios_cita')
                    ->where('id', $horario)
                    ->where('medico_id', $medicoId)
                    ->lockForUpdate()
                    ->first();

                abort_unless($registro, 404, 'Horario no encontrado.');

                $this->comprobarHorarioEditable($registro);

                DB::table('horarios_cita')
                    ->where('id', $horario)
                    ->delete();
            });
        } catch (QueryException $error) {
            $this->manejarConflicto($error);
        }

        return response()->json([
            'message' => 'Horario eliminado correctamente.',
        ]);
    }

    public function citas(Request $request): JsonResponse
    {
        $medicoId = $this->medicoId($request);
        $fecha = $this->validarFecha($request);

        $citas = DB::table('citas as c')
            ->join('horarios_cita as h', 'h.id', '=', 'c.horario_id')
            ->join('perfiles_paciente as p', 'p.id', '=', 'c.paciente_id')
            ->join('usuarios as u', 'u.id', '=', 'p.usuario_id')
            ->where('h.medico_id', $medicoId)
            ->where('c.inicia_en', '>=', $fecha.' 00:00:00')
            ->where('c.inicia_en', '<', $this->diaSiguiente($fecha))
            ->select([
                'c.id',
                'c.inicia_en',
                'h.termina_en',
                'c.estado',
                'c.motivo',
                'c.motivo_cancelacion',
                'u.nombre as paciente',
            ])
            ->orderBy('c.inicia_en')
            ->orderBy('c.id')
            ->paginate(20)
            ->through(function ($cita) {
                $cita->acciones = $this->accionesPermitidas(
                    $cita->estado,
                    $cita->inicia_en,
                    $cita->termina_en
                );

                return $cita;
            });

        return response()->json($citas);
    }

    public function cambiarEstadoCita(
        Request $request,
        int $cita
    ): JsonResponse {
        $medicoId = $this->medicoId($request);

        $datos = $request->validate([
            'estado' => [
                'required',
                Rule::in([
                    'confirmada',
                    'cancelada',
                    'completada',
                    'no_asistio',
                ]),
            ],
            'motivo_cancelacion' => [
                'required_if:estado,cancelada',
                'nullable',
                'string',
                'max:1000',
            ],
        ], [
            'estado.in' => 'El estado solicitado no es válido.',
            'motivo_cancelacion.required_if' =>
                'Indica el motivo de la cancelación.',
            'motivo_cancelacion.max' =>
                'El motivo admite hasta 1000 caracteres.',
        ]);

        DB::transaction(function () use ($medicoId, $cita, $datos) {
            // Primero identifica un horario que pertenece al médico.
            $referencia = DB::table('citas as c')
                ->join('horarios_cita as h', 'h.id', '=', 'c.horario_id')
                ->where('c.id', $cita)
                ->where('h.medico_id', $medicoId)
                ->select('c.horario_id')
                ->first();

            abort_unless($referencia, 404, 'Cita no encontrada.');

            // Mismo orden de bloqueo que deberá usar la reserva:
            // primero horario y después cita.
            $horario = DB::table('horarios_cita')
                ->where('id', $referencia->horario_id)
                ->where('medico_id', $medicoId)
                ->lockForUpdate()
                ->first();

            abort_unless($horario, 404, 'Horario no encontrado.');

            $registro = DB::table('citas')
                ->where('id', $cita)
                ->where('horario_id', $horario->id)
                ->lockForUpdate()
                ->first();

            abort_unless($registro, 404, 'Cita no encontrada.');

            $acciones = $this->accionesPermitidas(
                $registro->estado,
                $registro->inicia_en,
                $horario->termina_en
            );

            abort_unless(
                in_array($datos['estado'], $acciones, true),
                409,
                'Ese cambio ya no está permitido. Actualiza la agenda.'
            );

            $cancelar = $datos['estado'] === 'cancelada';
            $motivo = $cancelar
                ? trim($datos['motivo_cancelacion'])
                : null;

            if ($cancelar && $motivo === '') {
                throw ValidationException::withMessages([
                    'motivo_cancelacion' =>
                        'Escribe un motivo de cancelación.',
                ]);
            }

            DB::table('citas')
                ->where('id', $cita)
                ->update([
                    'estado' => $datos['estado'],
                    'motivo_cancelacion' => $motivo,
                    'cancelada_en' => $cancelar
                        ? $this->ahora()->toDateTimeString()
                        : null,
                    'actualizado_en' => $this->ahora()->toDateTimeString(),
                ]);
            if (in_array($datos['estado'], ['confirmada', 'cancelada'], true)) {
                app(AvisosCita::class)->registrar($cita, $datos['estado']);
            }
        });

        return response()->json([
            'message' => 'Estado de la cita actualizado correctamente.',
        ]);
    }

    private function medicoId(Request $request): int
    {
        $usuario = $request->user();

        abort_unless(
            $usuario &&
            $usuario->rol === 'medico' &&
            $usuario->activo,
            403,
            'Acceso exclusivo para médicos activos.'
        );

        $id = DB::table('perfiles_medico')
            ->where('usuario_id', $usuario->id)
            ->value('id');

        abort_unless($id, 403, 'La cuenta no tiene un perfil médico.');

        return (int) $id;
    }

    private function validarFecha(Request $request): string
    {
        $datos = $request->validate([
            'fecha' => ['required', 'date_format:Y-m-d'],
        ], [
            'fecha.required' => 'Selecciona una fecha.',
            'fecha.date_format' => 'La fecha no es válida.',
        ]);

        return $datos['fecha'];
    }

    private function validarInicio(Request $request): CarbonImmutable
    {
        $datos = $request->validate([
            'fecha' => ['required', 'date_format:Y-m-d'],
            'hora' => [
                'required',
                'regex:/^(?:[01][0-9]|2[0-3]):(?:00|30)$/',
            ],
        ], [
            'fecha.required' => 'Selecciona una fecha.',
            'fecha.date_format' => 'La fecha no es válida.',
            'hora.required' => 'Selecciona una hora.',
            'hora.regex' => 'La hora debe terminar en :00 o :30.',
        ]);

        $inicio = CarbonImmutable::createFromFormat(
            '!Y-m-d H:i',
            $datos['fecha'].' '.$datos['hora'],
            self::ZONA
        );

        if (! $inicio->isAfter($this->ahora())) {
            throw ValidationException::withMessages([
                'fecha' => 'El horario debe comenzar en el futuro.',
            ]);
        }

        return $inicio;
    }

    private function comprobarHorarioEditable(object $horario): void
    {
        abort_unless(
            CarbonImmutable::parse(
                $horario->inicia_en,
                self::ZONA
            )->isAfter($this->ahora()),
            409,
            'No puedes modificar ni eliminar horarios pasados.'
        );

        $tieneCitas = DB::table('citas')
            ->where('horario_id', $horario->id)
            ->exists();

        abort_if(
            $tieneCitas,
            409,
            'Este horario tiene citas registradas y debe conservarse.'
        );
    }

    private function accionesPermitidas(
        string $estado,
        string $inicio,
        string $fin
    ): array {
        $ahora = $this->ahora();
        $inicia = CarbonImmutable::parse($inicio, self::ZONA);
        $termina = CarbonImmutable::parse($fin, self::ZONA);

        if (! in_array($estado, ['pendiente', 'confirmada'], true)) {
            return [];
        }

        $acciones = [];

        if ($ahora->isBefore($inicia)) {
            if ($estado === 'pendiente') {
                $acciones[] = 'confirmada';
            }

            $acciones[] = 'cancelada';
        }

        if ($estado === 'confirmada' && ! $ahora->isBefore($inicia)) {
            $acciones[] = 'completada';
        }

        if (! $ahora->isBefore($termina)) {
            $acciones[] = 'no_asistio';
        }

        return $acciones;
    }

    private function ahora(): CarbonImmutable
    {
        return CarbonImmutable::now(self::ZONA);
    }

    private function diaSiguiente(string $fecha): string
    {
        return CarbonImmutable::parse($fecha, self::ZONA)
            ->addDay()
            ->startOfDay()
            ->toDateTimeString();
    }

    private function manejarConflicto(QueryException $error): never
    {
        $codigo = (int) ($error->errorInfo[1] ?? 0);

        if ($codigo === 1062) {
            throw ValidationException::withMessages([
                'hora' => 'Ya tienes un horario registrado para esa fecha y hora.',
            ]);
        }

        if (in_array($codigo, [1451, 1452], true)) {
            abort(
                409,
                'El horario tiene registros relacionados. Actualiza la agenda.'
            );
        }

        throw $error;
    }
}