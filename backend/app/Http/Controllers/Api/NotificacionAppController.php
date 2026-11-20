<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class NotificacionAppController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $uid = (int) $request->user()->id;
        $ahora = CarbonImmutable::now('America/El_Salvador')->toDateTimeString();

        // Bienvenida: se crea una sola vez, la primera vez que el usuario entra.
        DB::table('notificaciones_app')->insertOrIgnore([
            'usuario_id' => $uid,
            'tipo' => 'bienvenida',
            'titulo' => '¡Bienvenido a MediConnect!',
            'mensaje' => 'Tu cuenta está lista. Aquí verás los avisos de tus citas.',
            'clave_deduplicacion' => "app:bienvenida:{$uid}",
            'creado_en' => $ahora,
        ]);

        $items = DB::table('notificaciones_app')
            ->where('usuario_id', $uid)
            ->orderByDesc('id')->limit(30)
            ->get(['id', 'tipo', 'titulo', 'mensaje', 'url', 'cita_id', 'leida_en', 'creado_en']);

        return response()->json([
            'data' => $items,
            'no_leidas' => $items->whereNull('leida_en')->count(),
        ]);
    }

    public function leer(Request $request, int $id): JsonResponse
    {
        DB::table('notificaciones_app')
            ->where('id', $id)->where('usuario_id', $request->user()->id)
            ->whereNull('leida_en')
            ->update(['leida_en' => CarbonImmutable::now('America/El_Salvador')->toDateTimeString()]);

        return response()->json(['ok' => true]);
    }

    public function leerTodas(Request $request): JsonResponse
    {
        DB::table('notificaciones_app')
            ->where('usuario_id', $request->user()->id)->whereNull('leida_en')
            ->update(['leida_en' => CarbonImmutable::now('America/El_Salvador')->toDateTimeString()]);

        return response()->json(['ok' => true]);
    }
}