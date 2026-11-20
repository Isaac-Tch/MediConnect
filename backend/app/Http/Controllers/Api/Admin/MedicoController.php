<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Especialidad;
use App\Models\PerfilMedico;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class MedicoController extends Controller
{
    public function index(): JsonResponse
    {
        $medicos = PerfilMedico::query()
            ->whereHas('usuario', function ($query) {
                $query->where('rol', 'medico');
            })
            ->with([
                'usuario:id,nombre,correo,activo',
                'especialidad:id,nombre',
            ])
            ->orderByDesc('id')
            ->paginate(10)
            ->through(fn (PerfilMedico $medico) => [
                'id' => $medico->id,
                'nombre' => $medico->usuario->nombre,
                'correo' => $medico->usuario->correo,
                'activo' => (bool) $medico->usuario->activo,
                'especialidad_id' => $medico->especialidad_id,
                'especialidad' => $medico->especialidad->nombre,
                'numero_licencia' => $medico->numero_licencia,
                'biografia' => $medico->biografia,
                'tarifa_consulta' => $medico->tarifa_consulta,
                'moneda' => $medico->moneda,
            ]);

        return response()->json($medicos);
    }

    public function especialidades(): JsonResponse
    {
        return response()->json([
            'data' => Especialidad::query()
                ->orderBy('nombre')
                ->get(['id', 'nombre']),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $datos = $this->validarPerfil($request);

        $this->validarLongitudContrasena($datos['contrasena']);

        $hash = Hash::make($datos['contrasena']);

        try {
            $medico = DB::transaction(function () use ($datos, $hash) {
                $usuario = new User();
                $usuario->nombre = $datos['nombre'];
                $usuario->correo = $datos['correo'];
                $usuario->contrasena = $hash;
                $usuario->rol = 'medico';
                $usuario->activo = true;
                $usuario->save();

                $perfil = new PerfilMedico();
                $perfil->usuario_id = $usuario->id;
                $perfil->usuario_rol = 'medico';

                $this->asignarPerfil($perfil, $datos);

                $perfil->save();

                return $perfil;
            });
        } catch (QueryException $error) {
            $this->manejarDuplicado($error);
        }

        return response()->json([
            'message' => 'Cuenta médica creada correctamente.',
            'medico' => [
                'id' => $medico->id,
                'usuario_id' => $medico->usuario_id,
            ],
        ], 201);
    }

    public function update(
        Request $request,
        PerfilMedico $medico
    ): JsonResponse {
        $this->obtenerUsuario($medico);

        $datos = $this->validarPerfil($request, $medico);

        try {
            DB::transaction(function () use ($medico, $datos) {
                $usuario = $this->obtenerUsuario($medico, true);

                if ($usuario->correo !== $datos['correo']) {
                    $usuario->correo_verificado_en = null;
                }

                $usuario->nombre = $datos['nombre'];
                $usuario->correo = $datos['correo'];
                $usuario->save();

                $this->asignarPerfil($medico, $datos);

                $medico->save();
            });
        } catch (QueryException $error) {
            $this->manejarDuplicado($error);
        }

        return response()->json([
            'message' => 'Perfil médico actualizado correctamente.',
        ]);
    }

    public function cambiarEstado(
        Request $request,
        PerfilMedico $medico
    ): JsonResponse {
        $this->obtenerUsuario($medico);

        $request->validate([
            'activo' => ['required', 'boolean'],
        ]);

        $activar = $request->boolean('activo');
        $hash = null;

        if ($activar) {
            $datos = $request->validate([
                'contrasena' => [
                    'required',
                    'string',
                    'min:12',
                    'max:64',
                    'confirmed',
                ],
            ], [
                'contrasena.required' =>
                    'Asigna una contraseña nueva para activar la cuenta.',
                'contrasena.min' =>
                    'La contraseña debe tener al menos 12 caracteres.',
                'contrasena.max' =>
                    'La contraseña no debe superar 64 caracteres.',
                'contrasena.confirmed' =>
                    'Las contraseñas no coinciden.',
            ]);

            $this->validarLongitudContrasena($datos['contrasena']);

            $hash = Hash::make($datos['contrasena']);
        }

        DB::transaction(function () use ($medico, $activar, $hash) {
            $usuario = $this->obtenerUsuario($medico, true);

            if ($activar) {
                $usuario->contrasena = $hash;
            }

            $usuario->activo = $activar;
            $usuario->token_recordatorio = null;
            $usuario->save();
        });

        return response()->json([
            'message' => $activar
                ? 'Cuenta médica activada con una contraseña nueva.'
                : 'Cuenta médica desactivada.',
        ]);
    }

    public function destroy(PerfilMedico $medico): JsonResponse
    {
        DB::transaction(function () use ($medico) {
            $usuario = $this->obtenerUsuario($medico, true);

            $usuario->activo = false;
            $usuario->token_recordatorio = null;
            $usuario->save();

            // User usa SoftDeletes: guarda la fecha en eliminado_en.
            // No se borran el perfil, las citas ni los historiales.
            $usuario->delete();
        });

        return response()->json([
            'message' =>
                'Cuenta médica retirada. Sus registros relacionados se conservaron.',
        ]);
    }

    private function obtenerUsuario(
        PerfilMedico $medico,
        bool $bloquear = false
    ): User {
        $consulta = User::query()
            ->whereKey($medico->usuario_id)
            ->where('rol', 'medico');

        if ($bloquear) {
            $consulta->lockForUpdate();
        }

        return $consulta->firstOrFail();
    }

    private function validarPerfil(
        Request $request,
        ?PerfilMedico $medico = null
    ): array {
        foreach (['nombre', 'correo', 'numero_licencia'] as $campo) {
            if (is_string($request->input($campo))) {
                $valor = trim($request->input($campo));

                $request->merge([
                    $campo => $campo === 'correo'
                        ? mb_strtolower($valor)
                        : $valor,
                ]);
            }
        }

        $correoUnico = Rule::unique('usuarios', 'correo');
        $licenciaUnica = Rule::unique(
            'perfiles_medico',
            'numero_licencia'
        );

        if ($medico) {
            $correoUnico->ignore($medico->usuario_id);
            $licenciaUnica->ignore($medico->id);
        }

        $reglas = [
            'nombre' => ['required', 'string', 'max:150'],
            'correo' => [
                'required',
                'email',
                'max:254',
                $correoUnico,
            ],
            'especialidad_id' => [
                'required',
                'integer',
                'exists:especialidades,id',
            ],
            'numero_licencia' => [
                'required',
                'string',
                'max:50',
                $licenciaUnica,
            ],
            'tarifa_consulta' => [
                'required',
                'numeric',
                'decimal:0,2',
                'min:0',
                'max:99999999.99',
            ],
            'biografia' => ['nullable', 'string', 'max:5000'],
        ];

        if (! $medico) {
            $reglas['contrasena'] = [
                'required',
                'string',
                'min:12',
                'max:64',
                'confirmed',
            ];
        }

        return $request->validate($reglas, [
            'required' => 'El campo :attribute es obligatorio.',
            'string' => 'El campo :attribute debe ser texto.',
            'max.string' =>
                'El campo :attribute no puede superar :max caracteres.',
            'correo.email' => 'Escribe un correo válido.',
            'correo.unique' => 'Ese correo ya está registrado.',
            'numero_licencia.unique' =>
                'Ese número de licencia ya está registrado.',
            'especialidad_id.exists' =>
                'Selecciona una especialidad válida.',
            'contrasena.min' =>
                'La contraseña debe tener al menos 12 caracteres.',
            'contrasena.confirmed' =>
                'Las contraseñas no coinciden.',
            'tarifa_consulta.numeric' =>
                'La tarifa debe ser un número.',
            'tarifa_consulta.decimal' =>
                'La tarifa admite hasta dos decimales.',
            'tarifa_consulta.min' =>
                'La tarifa no puede ser negativa.',
        ], [
            'nombre' => 'nombre',
            'correo' => 'correo',
            'especialidad_id' => 'especialidad',
            'numero_licencia' => 'número de licencia',
            'tarifa_consulta' => 'tarifa',
            'biografia' => 'biografía',
            'contrasena' => 'contraseña',
        ]);
    }

    private function asignarPerfil(
        PerfilMedico $medico,
        array $datos
    ): void {
        $medico->especialidad_id = $datos['especialidad_id'];
        $medico->numero_licencia = $datos['numero_licencia'];
        $medico->biografia = $datos['biografia'] ?? null;
        $medico->tarifa_consulta = $datos['tarifa_consulta'];
        $medico->moneda = 'USD';
    }

    private function validarLongitudContrasena(string $contrasena): void
    {
        if (strlen($contrasena) > 72) {
            throw ValidationException::withMessages([
                'contrasena' =>
                    'La contraseña no puede superar 72 bytes.',
            ]);
        }
    }

    private function manejarDuplicado(QueryException $error): never
    {
        if ((int) ($error->errorInfo[1] ?? 0) === 1062) {
            throw ValidationException::withMessages([
                'registro' =>
                    'El correo o la licencia ya están registrados.',
            ]);
        }

        throw $error;
    }
}

