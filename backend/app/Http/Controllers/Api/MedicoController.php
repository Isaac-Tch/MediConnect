<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PerfilMedico;
use Illuminate\Http\JsonResponse;

class MedicoController extends Controller
{
    public function index(): JsonResponse
    {
        $medicos = PerfilMedico::query()
            ->with([
                'usuario:id,nombre',
                'especialidad:id,nombre',
            ])
            ->whereHas('usuario', function ($consulta) {
                $consulta->where('activo', true)
                    ->where('rol', 'medico');
            })
            ->orderBy('id')
            ->paginate(10);

        $medicos->through(function ($medico) {
            return [
                'id' => $medico->id,
                'nombre' => $medico->usuario->nombre,
                'especialidad' => $medico->especialidad->nombre,
                'biografia' => $medico->biografia,
                'tarifa_consulta' => $medico->tarifa_consulta,
                'moneda' => $medico->moneda,
            ];
        });

        return response()->json($medicos);
    }
}

