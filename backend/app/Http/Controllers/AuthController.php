<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'correo' => ['required', 'email', 'max:254'],
            'contrasena' => ['required', 'string', 'max:255'],
        ]);

        $autenticado = Auth::guard('web')->attempt([
            'correo' => $datos['correo'],
            'password' => $datos['contrasena'],
            'activo' => true,
        ]);

        if (! $autenticado) {
            return response()->json([
                'message' => 'Credenciales incorrectas o cuenta no disponible.',
            ], 401);
        }

        $request->session()->regenerate();

        $usuario = Auth::guard('web')->user();

        if (! ($usuario instanceof User)) {
            abort(500, 'El modelo de autenticacion no es el esperado.');
        }

        return response()->json([
            'message' => 'Sesion iniciada.',
            'usuario' => $usuario->only([
                'id',
                'nombre',
                'correo',
                'rol',
            ]),
        ]);
    }

    public function usuario(Request $request): JsonResponse
    {
        $usuario = $request->user();

        if (! ($usuario instanceof User)) {
            abort(401, 'No autenticado.');
        }

        abort_unless($usuario->activo, 403, 'Cuenta inactiva.');

        return response()->json([
            'usuario' => $usuario->only([
                'id',
                'nombre',
                'correo',
                'rol',
            ]),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json([
            'message' => 'Sesion cerrada.',
        ]);
    }
}

