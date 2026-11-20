<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class VerificarRol
{
    public function handle(
        Request $request,
        Closure $next,
        string ...$roles
    ): Response {
        $usuario = $request->user();

        if (! ($usuario instanceof User)) {
            return response()->json([
                'message' => 'Debes iniciar sesión.',
            ], 401);
        }

        if (! $usuario->activo) {
            return response()->json([
                'message' => 'Tu cuenta está inactiva.',
            ], 403);
        }

        if (! in_array($usuario->rol, $roles, true)) {
            return response()->json([
                'message' => 'No tienes permiso para acceder a esta sección.',
            ], 403);
        }

        return $next($request);
    }
}
