<?php

use App\Http\Controllers\Api\Admin\EspecialidadController;
use App\Http\Controllers\Api\Admin\MedicoController as AdminMedicoController;
use App\Http\Controllers\Api\Admin\ReporteController;
use App\Http\Controllers\Api\ArchivoMedicoController;
use App\Http\Controllers\Api\HistorialController;
use App\Http\Controllers\Api\Medico\AgendaController;
use App\Http\Controllers\Api\Paciente\PanelController;
use App\Http\Controllers\Api\MedicoController;
use App\Http\Controllers\Api\RecetaController;
use App\Http\Controllers\Api\RecetaPdfController;
use App\Http\Controllers\AuthController;
use Illuminate\Support\Facades\Route;

Route::get('/medicos', [MedicoController::class, 'index']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/usuario', [AuthController::class, 'usuario']);

    Route::get('/recetas/{receta}/pdf', [RecetaPdfController::class, 'descargar'])
        ->whereNumber('receta')
        ->middleware(['rol:medico,paciente', 'throttle:20,1']);

    Route::prefix('archivos')
        ->middleware('rol:medico,paciente')
        ->group(function () {
            Route::get('/', [ArchivoMedicoController::class, 'index']);
            Route::get('/citas', [ArchivoMedicoController::class, 'citas']);

            Route::post('/', [ArchivoMedicoController::class, 'store'])
                ->middleware('throttle:10,1');

            Route::get(
                '/{archivo}/descargar',
                [ArchivoMedicoController::class, 'descargar']
            )->whereNumber('archivo')->middleware('throttle:30,1');
        });

    Route::prefix('paciente')
        ->middleware('rol:paciente')
        ->group(function () {
            Route::get('/panel', [AuthController::class, 'usuario']);
            Route::get('/perfil', [PanelController::class, 'perfil']);

            Route::put('/perfil', [PanelController::class, 'actualizarPerfil'])
                ->middleware('throttle:20,1');

            Route::post('/desactivar', [PanelController::class, 'desactivar'])
                ->middleware('throttle:5,1');

            Route::get(
                '/medicos/{medico}/horarios',
                [PanelController::class, 'horarios']
            )->whereNumber('medico');

            Route::get('/citas', [PanelController::class, 'citas']);

            Route::post('/citas', [PanelController::class, 'reservar'])
                ->middleware('throttle:10,1');

            Route::patch(
                '/citas/{cita}/cancelar',
                [PanelController::class, 'cancelar']
            )->whereNumber('cita')->middleware('throttle:20,1');

            Route::get('/historiales', [HistorialController::class, 'paciente']);
            Route::get('/recetas', [RecetaController::class, 'paciente']);
        });

    Route::prefix('medico')
        ->middleware('rol:medico')
        ->group(function () {
            Route::get('/panel', [AuthController::class, 'usuario']);
            Route::get('/horarios', [AgendaController::class, 'horarios']);

            Route::post('/horarios', [AgendaController::class, 'crearHorario'])
                ->middleware('throttle:60,1');

            Route::put(
                '/horarios/{horario}',
                [AgendaController::class, 'editarHorario']
            )->whereNumber('horario')->middleware('throttle:30,1');

            Route::delete(
                '/horarios/{horario}',
                [AgendaController::class, 'eliminarHorario']
            )->whereNumber('horario')->middleware('throttle:30,1');

            Route::get('/citas', [AgendaController::class, 'citas']);

            Route::patch(
                '/citas/{cita}/estado',
                [AgendaController::class, 'cambiarEstadoCita']
            )->whereNumber('cita')->middleware('throttle:30,1');

            Route::get('/historiales', [HistorialController::class, 'medico']);

            Route::post(
                '/citas/{cita}/historial',
                [HistorialController::class, 'store']
            )->whereNumber('cita')->middleware('throttle:20,1');

            Route::get('/recetas', [RecetaController::class, 'medico']);
            Route::get('/recetas/atenciones', [RecetaController::class, 'atenciones']);

            Route::post('/recetas', [RecetaController::class, 'store'])
                ->middleware('throttle:20,1');

            Route::patch(
                '/recetas/{receta}/anular',
                [RecetaController::class, 'anular']
            )->whereNumber('receta')->middleware('throttle:20,1');
        });

    Route::prefix('admin')
        ->middleware('rol:administrador')
        ->group(function () {
            Route::get('/panel', [AuthController::class, 'usuario']);

            Route::get('/especialidades', [EspecialidadController::class, 'index']);

            Route::post('/especialidades', [EspecialidadController::class, 'store'])
                ->middleware('throttle:20,1');

            Route::put(
                '/especialidades/{especialidad}',
                [EspecialidadController::class, 'update']
            )->middleware('throttle:20,1');

            Route::delete(
                '/especialidades/{especialidad}',
                [EspecialidadController::class, 'destroy']
            )->middleware('throttle:10,1');

            Route::get('/medicos', [AdminMedicoController::class, 'index']);

            Route::post('/medicos', [AdminMedicoController::class, 'store'])
                ->middleware('throttle:10,1');

            Route::put(
                '/medicos/{medico}',
                [AdminMedicoController::class, 'update']
            )->middleware('throttle:20,1');

            Route::patch(
                '/medicos/{medico}/estado',
                [AdminMedicoController::class, 'cambiarEstado']
            )->whereNumber('medico')->middleware('throttle:10,1');

            Route::delete(
                '/medicos/{medico}',
                [AdminMedicoController::class, 'destroy']
            )->middleware('throttle:10,1');

            Route::get('/reportes', [ReporteController::class, 'index']);

            Route::post('/reportes', [ReporteController::class, 'store'])
                ->middleware('throttle:5,1');

            Route::get(
                '/reportes/{reporte}/descargar',
                [ReporteController::class, 'descargar']
            )->whereNumber('reporte')->middleware('throttle:20,1');
        });
});

// --- Notificaciones dentro de la app (campanita) ---
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/notificaciones', [\App\Http\Controllers\Api\NotificacionAppController::class, 'index']);
    Route::post('/notificaciones/leer-todas', [\App\Http\Controllers\Api\NotificacionAppController::class, 'leerTodas']);
    Route::post('/notificaciones/{id}/leer', [\App\Http\Controllers\Api\NotificacionAppController::class, 'leer'])->whereNumber('id');
});