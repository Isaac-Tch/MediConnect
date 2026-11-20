<?php

namespace App\Http\Controllers\Api\Paciente;

use App\Http\Controllers\Controller;
use App\Services\AvisosCita;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class PanelController extends Controller
{
    private const ZONA = 'America/El_Salvador';

    public function perfil(Request $request): JsonResponse
    {
        [$usuario, $perfil] = $this->paciente($request);

        return response()->json([
            'data' => [
                'nombre' => $usuario->nombre,
                'correo' => $usuario->correo,
                'fecha_nacimiento' => $perfil->fecha_nacimiento,
                'telefono' => $perfil->telefono,
                'direccion' => $perfil->direccion,
                'contacto_emergencia_nombre' =>
                    $perfil->contacto_emergencia_nombre,
                'contacto_emergencia_telefono' =>
                    $perfil->contacto_emergencia_telefono,
            ],
        ]);
    }

    public function actualizarPerfil(Request $request): JsonResponse
    {
        $hoy = $this->ahora()->toDateString();

        $datos = $request->validate([
            'nombre' => ['required', 'string', 'max:150'],
            'fecha_nacimiento' => [
                'required',
                'date_format:Y-m-d',
                'after_or_equal:1900-01-01',
                'before_or_equal:'.$hoy,
            ],
            'telefono' => [
                'nullable',
                'string',
                'regex:/^\+[1-9][0-9]{7,14}$/',
            ],
            'direccion' => ['nullable', 'string', 'max:500'],
            'contacto_emergencia_nombre' => [
                'nullable',
                'string',
                'max:150',
            ],
            'contacto_emergencia_telefono' => [
                'nullable',
                'string',
                'regex:/^\+[1-9][0-9]{7,14}$/',
            ],
        ], [
            'nombre.required' => 'Escribe tu nombre.',
            'fecha_nacimiento.required' => 'Indica tu fecha de nacimiento.',
            'fecha_nacimiento.date_format' => 'La fecha no es válida.',
            'fecha_nacimiento.before_or_equal' =>
                'La fecha de nacimiento no puede estar en el futuro.',
            'fecha_nacimiento.after_or_equal' =>
                'La fecha debe ser igual o posterior a 1900-01-01.',
            'telefono.regex' =>
                'Usa un teléfono internacional, por ejemplo +50370000000.',
            'contacto_emergencia_telefono.regex' =>
                'El teléfono de emergencia debe incluir el prefijo internacional.',
            'max.string' => 'El campo :attribute admite hasta :max caracteres.',
        ]);

        $nombre = trim($datos['nombre']);

        if ($nombre === '') {
            throw ValidationException::withMessages([
                'nombre' => 'Escribe tu nombre.',
            ]);
        }

        DB::transaction(function () use ($request, $datos, $nombre) {
            [$usuario, $perfil] = $this->paciente($request, true);

            DB::table('usuarios')
                ->where('id', $usuario->id)
                ->update([
                    'nombre' => $nombre,
                    'actualizado_en' => $this->ahora()->toDateTimeString(),
                ]);

            DB::table('perfiles_paciente')
                ->where('id', $perfil->id)
                ->update([
                    'fecha_nacimiento' => $datos['fecha_nacimiento'],
                    'telefono' => $datos['telefono'] ?? null,
                    'direccion' => $datos['direccion'] ?? null,
                    'contacto_emergencia_nombre' =>
                        $datos['contacto_emergencia_nombre'] ?? null,
                    'contacto_emergencia_telefono' =>
                        $datos['contacto_emergencia_telefono'] ?? null,
                    'actualizado_en' => $this->ahora()->toDateTimeString(),
                ]);
        });

        return response()->json([
            'message' => 'Perfil actualizado correctamente.',
        ]);
    }

    public function horarios(
        Request $request,
        int $medico
    ): JsonResponse {
        $this->paciente($request);

        $datos = $request->validate([
            'fecha' => ['required', 'date_format:Y-m-d'],
        ]);

        $existe = DB::table('perfiles_medico as m')
            ->join('usuarios as u', 'u.id', '=', 'm.usuario_id')
            ->where('m.id', $medico)
            ->where('u.rol', 'medico')
            ->where('u.activo', true)
            ->whereNull('u.eliminado_en')
            ->exists();

        abort_unless($existe, 404, 'El médico no está disponible.');

        $inicioDia = $datos['fecha'].' 00:00:00';
        $finDia = CarbonImmutable::parse($datos['fecha'], self::ZONA)
            ->addDay()
            ->startOfDay()
            ->toDateTimeString();

        $horarios = DB::table('horarios_cita as h')
            ->where('h.medico_id', $medico)
            ->where('h.inicia_en', '>=', $inicioDia)
            ->where('h.inicia_en', '<', $finDia)
            ->where('h.inicia_en', '>', $this->ahora()->toDateTimeString())
            ->whereNotExists(function ($query) {
                $query->selectRaw('1')
                    ->from('citas as c')
                    ->whereColumn('c.horario_id', 'h.id')
                    ->where('c.estado', '<>', 'cancelada');
            })
            ->orderBy('h.inicia_en')
            ->get(['h.id', 'h.inicia_en', 'h.termina_en']);

        return response()->json([
            'data' => $horarios,
            'zona_horaria' => self::ZONA,
        ]);
    }

    public function reservar(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'horario_id' => ['required', 'integer', 'min:1'],
            'motivo' => ['required', 'string', 'max:1000'],
        ], [
            'horario_id.required' => 'Selecciona un horario.',
            'motivo.required' => 'Indica el motivo de la consulta.',
            'motivo.max' => 'El motivo admite hasta 1000 caracteres.',
        ]);

        $motivo = trim($datos['motivo']);

        if ($motivo === '') {
            throw ValidationException::withMessages([
                'motivo' => 'Indica el motivo de la consulta.',
            ]);
        }

        try {
            $id = DB::transaction(function () use ($request, $datos, $motivo) {
                // Serializa las reservas y la desactivación de este paciente.
                [$usuario, $paciente] = $this->paciente($request, true);

                $referencia = DB::table('horarios_cita as h')
                    ->join('perfiles_medico as m', 'm.id', '=', 'h.medico_id')
                    ->where('h.id', $datos['horario_id'])
                    ->select('m.id as medico_id', 'm.usuario_id')
                    ->first();

                abort_unless($referencia, 404, 'Horario no encontrado.');

                // Coordina la reserva con la activación/desactivación del médico.
                $cuentaMedica = DB::table('usuarios')
                    ->where('id', $referencia->usuario_id)
                    ->where('rol', 'medico')
                    ->where('activo', true)
                    ->whereNull('eliminado_en')
                    ->lockForUpdate()
                    ->first();

                abort_unless(
                    $cuentaMedica,
                    409,
                    'El médico ya no está disponible.'
                );

                $horario = DB::table('horarios_cita')
                    ->where('id', $datos['horario_id'])
                    ->where('medico_id', $referencia->medico_id)
                    ->lockForUpdate()
                    ->first();

                abort_unless($horario, 404, 'Horario no encontrado.');

                abort_unless(
                    CarbonImmutable::parse(
                        $horario->inicia_en,
                        self::ZONA
                    )->isAfter($this->ahora()),
                    409,
                    'El horario ya comenzó.'
                );

                $ocupado = DB::table('citas')
                    ->where('horario_id', $horario->id)
                    ->where('estado', '<>', 'cancelada')
                    ->exists();

                abort_if($ocupado, 409, 'Otro paciente ya reservó ese horario.');

                $coincide = DB::table('citas')
                    ->where('paciente_id', $paciente->id)
                    ->where('inicia_en', $horario->inicia_en)
                    ->where('estado', '<>', 'cancelada')
                    ->exists();

                abort_if(
                    $coincide,
                    409,
                    'Ya tienes una cita a esa misma hora.'
                );

                $medico = DB::table('perfiles_medico')
                    ->where('id', $horario->medico_id)
                    ->first();

                $ahora = $this->ahora()->toDateTimeString();

                $citaId = DB::table('citas')->insertGetId([
                    'horario_id' => $horario->id,
                    'paciente_id' => $paciente->id,
                    'inicia_en' => $horario->inicia_en,
                    'estado' => 'pendiente',
                    'motivo' => $motivo,
                    'reservada_por' => $usuario->id,
                    'precio' => $medico->tarifa_consulta,
                    'moneda' => $medico->moneda,
                    'creado_en' => $ahora,
                    'actualizado_en' => $ahora,
                ]);

                app(AvisosCita::class)->registrar((int) $citaId, 'solicitada');

                return $citaId;
            });
        } catch (QueryException $error) {
            if ((int) ($error->errorInfo[1] ?? 0) === 1062) {
                abort(
                    409,
                    'El horario ya fue reservado o tienes una cita a esa hora.'
                );
            }

            throw $error;
        }

        return response()->json([
            'message' => 'Cita reservada. Está pendiente de confirmación.',
            'id' => $id,
        ], 201);
    }

    public function citas(Request $request): JsonResponse
    {
        [, $paciente] = $this->paciente($request);

        $citas = DB::table('citas as c')
            ->join('horarios_cita as h', 'h.id', '=', 'c.horario_id')
            ->join('perfiles_medico as m', 'm.id', '=', 'h.medico_id')
            ->join('usuarios as u', 'u.id', '=', 'm.usuario_id')
            ->where('c.paciente_id', $paciente->id)
            ->select([
                'c.id',
                'c.inicia_en',
                'c.estado',
                'c.motivo',
                'c.motivo_cancelacion',
                'c.precio',
                'c.moneda',
                'u.nombre as medico',
            ])
            ->orderByDesc('c.inicia_en')
            ->orderByDesc('c.id')
            ->paginate(10)
            ->through(function ($cita) {
                $cita->puede_cancelar =
                    in_array($cita->estado, ['pendiente', 'confirmada'], true)
                    && CarbonImmutable::parse(
                        $cita->inicia_en,
                        self::ZONA
                    )->isAfter($this->ahora());

                return $cita;
            });

        return response()->json($citas);
    }

    public function cancelar(Request $request, int $cita): JsonResponse
    {
        [, $paciente] = $this->paciente($request);

        $datos = $request->validate([
            'motivo_cancelacion' => ['required', 'string', 'max:1000'],
        ]);

        $motivo = trim($datos['motivo_cancelacion']);

        if ($motivo === '') {
            throw ValidationException::withMessages([
                'motivo_cancelacion' => 'Indica el motivo de cancelación.',
            ]);
        }

        DB::transaction(function () use ($paciente, $cita, $motivo) {
            $referencia = DB::table('citas')
                ->where('id', $cita)
                ->where('paciente_id', $paciente->id)
                ->first(['horario_id']);

            abort_unless($referencia, 404, 'Cita no encontrada.');

            DB::table('horarios_cita')
                ->where('id', $referencia->horario_id)
                ->lockForUpdate()
                ->first();

            $registro = DB::table('citas')
                ->where('id', $cita)
                ->where('paciente_id', $paciente->id)
                ->lockForUpdate()
                ->first();

            abort_unless($registro, 404, 'Cita no encontrada.');

            $permitido =
                in_array($registro->estado, ['pendiente', 'confirmada'], true)
                && CarbonImmutable::parse(
                    $registro->inicia_en,
                    self::ZONA
                )->isAfter($this->ahora());

            abort_unless(
                $permitido,
                409,
                'Esta cita ya no puede cancelarse desde el panel.'
            );

            DB::table('citas')->where('id', $cita)->update([
                'estado' => 'cancelada',
                'motivo_cancelacion' => $motivo,
                'cancelada_en' => $this->ahora()->toDateTimeString(),
                'actualizado_en' => $this->ahora()->toDateTimeString(),
            ]);

            app(AvisosCita::class)->registrar($cita, 'cancelada');
        });

        return response()->json([
            'message' => 'Cita cancelada correctamente.',
        ]);
    }

    public function desactivar(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'contrasena' => ['required', 'string', 'max:255'],
        ]);

        DB::transaction(function () use ($request, $datos) {
            [$usuario, $perfil] = $this->paciente($request, true);

            if (! Hash::check($datos['contrasena'], $usuario->contrasena)) {
                throw ValidationException::withMessages([
                    'contrasena' => 'La contraseña no es correcta.',
                ]);
            }

            $tieneCitas = DB::table('citas')
                ->where('paciente_id', $perfil->id)
                ->whereIn('estado', ['pendiente', 'confirmada'])
                ->exists();

            abort_if(
                $tieneCitas,
                409,
                'Tienes citas pendientes o confirmadas. Cancela las futuras o solicita que se actualice el estado de las citas pasadas antes de desactivar tu cuenta.'
            );

            DB::table('usuarios')
                ->where('id', $usuario->id)
                ->update([
                    'activo' => false,
                    'token_recordatorio' => null,
                    'actualizado_en' => $this->ahora()->toDateTimeString(),
                ]);
        });

        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json([
            'message' => 'Cuenta desactivada. Tu sesión se ha cerrado.',
        ]);
    }

    private function paciente(Request $request, bool $bloquear = false): array
    {
        $consulta = DB::table('usuarios')
            ->where('id', $request->user()->id)
            ->where('rol', 'paciente')
            ->where('activo', true)
            ->whereNull('eliminado_en');

        if ($bloquear) {
            $consulta->lockForUpdate();
        }

        $usuario = $consulta->first();

        abort_unless($usuario, 403, 'La cuenta no está disponible.');

        $perfil = DB::table('perfiles_paciente')
            ->where('usuario_id', $usuario->id)
            ->first();

        abort_unless($perfil, 403, 'No se encontró el perfil del paciente.');

        return [$usuario, $perfil];
    }

    private function ahora(): CarbonImmutable
    {
        return CarbonImmutable::now(self::ZONA);
    }
}