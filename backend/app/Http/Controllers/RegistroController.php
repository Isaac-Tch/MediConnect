<?php

namespace App\Http\Controllers;

use App\Models\PerfilPaciente;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class RegistroController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        if (Auth::guard('web')->check()) {
            return response()->json([
                'message' => 'Cierra tu sesion antes de registrar otra cuenta.',
            ], 409);
        }

        if (is_string($request->input('correo'))) {
            $request->merge([
                'correo' => mb_strtolower(trim($request->input('correo'))),
            ]);
        }

        $datos = $request->validate([
            'nombre' => ['required', 'string', 'max:150'],
            'correo' => [
                'required',
                'email',
                'max:254',
                'unique:usuarios,correo',
            ],
            'fecha_nacimiento' => [
                'required',
                'date_format:Y-m-d',
                'after_or_equal:1900-01-01',
                'before_or_equal:today',
            ],
            'telefono' => [
                'nullable',
                'string',
                'regex:/^\+[1-9][0-9]{7,14}$/',
            ],
            'contrasena' => [
                'required',
                'string',
                'min:12',
                'max:64',
                'confirmed',
            ],
        ], [
            'nombre.required' => 'Escribe tu nombre.',
            'correo.email' => 'Escribe un correo valido.',
            'correo.unique' => 'Ese correo ya esta registrado.',
            'fecha_nacimiento.required' => 'Indica tu fecha de nacimiento.',
            'fecha_nacimiento.date_format' => 'La fecha no es valida.',
            'fecha_nacimiento.after_or_equal' => 'Revisa tu fecha de nacimiento.',
            'fecha_nacimiento.before_or_equal' => 'La fecha no puede ser futura.',
            'telefono.regex' => 'Usa el formato internacional, por ejemplo +503 seguido de 8 digitos.',
            'contrasena.min' => 'La contraseña debe tener al menos 12 caracteres.',
            'contrasena.max' => 'La contraseña no puede superar 64 caracteres.',
            'contrasena.confirmed' => 'Las contraseñas no coinciden.',
        ]);

        // Evita superar el limite de bytes de bcrypt.
        if (strlen($datos['contrasena']) > 72) {
            throw ValidationException::withMessages([
                'contrasena' => 'La contraseña es demasiado larga en bytes. Usa menos caracteres.',
            ]);
        }

        try {
            DB::transaction(function () use ($datos) {
                $usuario = new User();
                $usuario->nombre = $datos['nombre'];
                $usuario->correo = $datos['correo'];
                $usuario->contrasena = Hash::make($datos['contrasena']);
                $usuario->rol = 'paciente';
                $usuario->activo = true;
                $usuario->save();

                $perfil = new PerfilPaciente();
                $perfil->usuario_id = $usuario->id;
                $perfil->usuario_rol = 'paciente';
                $perfil->fecha_nacimiento = $datos['fecha_nacimiento'];
                $perfil->telefono = $datos['telefono'] ?? null;
                $perfil->save();
            });
        } catch (QueryException $error) {
            // También cubre dos registros simultaneos con el mismo correo.
            if (($error->errorInfo[1] ?? null) == 1062) {
                throw ValidationException::withMessages([
                    'correo' => 'Ese correo ya esta registrado.',
                ]);
            }

            throw $error;
        }

        return response()->json([
            'message' => 'Cuenta creada. Ya puedes iniciar sesion.',
        ], 201);
    }
}
