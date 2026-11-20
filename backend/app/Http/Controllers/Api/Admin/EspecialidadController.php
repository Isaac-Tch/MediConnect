<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Especialidad;
use App\Models\PerfilMedico;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class EspecialidadController extends Controller
{
    public function index(): JsonResponse
    {
        $especialidades = Especialidad::query()
            ->select(['id', 'nombre', 'descripcion'])
            ->addSelect([
                'perfiles_asignados' => PerfilMedico::query()
                    ->selectRaw('COUNT(*)')
                    ->whereColumn(
                        'perfiles_medico.especialidad_id',
                        'especialidades.id'
                    ),
            ])
            ->orderBy('nombre')
            ->get()
            ->map(fn (Especialidad $especialidad) => [
                'id' => $especialidad->id,
                'nombre' => $especialidad->nombre,
                'descripcion' => $especialidad->descripcion,
                'perfiles_asignados' =>
                    (int) $especialidad->perfiles_asignados,
            ]);

        return response()->json([
            'data' => $especialidades,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $datos = $this->validarDatos($request);

        try {
            $especialidad = new Especialidad();
            $especialidad->nombre = $datos['nombre'];
            $especialidad->descripcion = $datos['descripcion'] ?? null;
            $especialidad->save();
        } catch (QueryException $error) {
            $this->manejarDuplicado($error);
        }

        return response()->json([
            'message' => 'Especialidad creada correctamente.',
            'data' => $especialidad->only([
                'id',
                'nombre',
                'descripcion',
            ]),
        ], 201);
    }

    public function update(
        Request $request,
        Especialidad $especialidad
    ): JsonResponse {
        $datos = $this->validarDatos($request, $especialidad);

        try {
            $especialidad->nombre = $datos['nombre'];
            $especialidad->descripcion = $datos['descripcion'] ?? null;
            $especialidad->save();
        } catch (QueryException $error) {
            $this->manejarDuplicado($error);
        }

        return response()->json([
            'message' => 'Especialidad actualizada correctamente.',
            'data' => $especialidad->only([
                'id',
                'nombre',
                'descripcion',
            ]),
        ]);
    }

    public function destroy(Especialidad $especialidad): JsonResponse
    {
        try {
            $eliminada = DB::transaction(function () use ($especialidad) {
                $registro = Especialidad::query()
                    ->whereKey($especialidad->id)
                    ->lockForUpdate()
                    ->firstOrFail();

                // Incluye perfiles de usuarios activos, inactivos
                // y de cuentas eliminadas lógicamente.
                $tienePerfiles = PerfilMedico::query()
                    ->where('especialidad_id', $registro->id)
                    ->exists();

                if ($tienePerfiles) {
                    return false;
                }

                $registro->delete();

                return true;
            });
        } catch (QueryException $error) {
            // La clave foránea también protege frente a operaciones
            // concurrentes que intenten asignar esta especialidad.
            if ((int) ($error->errorInfo[1] ?? 0) === 1451) {
                return $this->respuestaEspecialidadEnUso();
            }

            throw $error;
        }

        if (! $eliminada) {
            return $this->respuestaEspecialidadEnUso();
        }

        return response()->json([
            'message' => 'Especialidad eliminada correctamente.',
        ]);
    }

    private function validarDatos(
        Request $request,
        ?Especialidad $especialidad = null
    ): array {
        if (is_string($request->input('nombre'))) {
            $request->merge([
                'nombre' => trim($request->input('nombre')),
            ]);
        }

        if (is_string($request->input('descripcion'))) {
            $descripcion = trim($request->input('descripcion'));

            $request->merge([
                'descripcion' => $descripcion === ''
                    ? null
                    : $descripcion,
            ]);
        }

        $nombreUnico = Rule::unique('especialidades', 'nombre');

        if ($especialidad) {
            $nombreUnico->ignore($especialidad->id);
        }

        return $request->validate([
            'nombre' => [
                'required',
                'string',
                'max:100',
                $nombreUnico,
            ],
            'descripcion' => [
                'nullable',
                'string',
                'max:500',
            ],
        ], [
            'nombre.required' => 'Escribe el nombre de la especialidad.',
            'nombre.string' => 'El nombre debe ser texto.',
            'nombre.max' => 'El nombre admite hasta 100 caracteres.',
            'nombre.unique' => 'Ya existe una especialidad con ese nombre.',
            'descripcion.string' => 'La descripción debe ser texto.',
            'descripcion.max' =>
                'La descripción admite hasta 500 caracteres.',
        ]);
    }

    private function manejarDuplicado(QueryException $error): never
    {
        if ((int) ($error->errorInfo[1] ?? 0) === 1062) {
            throw ValidationException::withMessages([
                'nombre' => 'Ya existe una especialidad con ese nombre.',
            ]);
        }

        throw $error;
    }

    private function respuestaEspecialidadEnUso(): JsonResponse
    {
        return response()->json([
            'message' =>
                'No puedes eliminar esta especialidad porque tiene perfiles médicos asignados. También se cuentan los perfiles de cuentas inactivas o eliminadas.',
        ], 409);
    }
}

