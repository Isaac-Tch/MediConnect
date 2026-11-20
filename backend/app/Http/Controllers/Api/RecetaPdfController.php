<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Barryvdh\DomPDF\Facade\Pdf;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class RecetaPdfController extends Controller
{
    private const ZONA = 'America/El_Salvador';

    public function descargar(Request $request, int $receta): Response
    {
        $usuario = $request->user();

        abort_unless(
            $usuario &&
            $usuario->activo &&
            in_array($usuario->rol, ['medico', 'paciente'], true),
            403,
            'No tienes permiso para descargar esta receta.'
        );

        $consulta = DB::table('recetas as r')
            ->join(
                'historiales_clinicos as hc',
                'hc.id',
                '=',
                'r.historial_clinico_id'
            )
            ->join('citas as c', 'c.id', '=', 'hc.cita_id')
            ->join('horarios_cita as h', 'h.id', '=', 'c.horario_id')
            ->join('perfiles_medico as pm', 'pm.id', '=', 'h.medico_id')
            ->join('usuarios as um', 'um.id', '=', 'pm.usuario_id')
            ->join('perfiles_paciente as pp', 'pp.id', '=', 'c.paciente_id')
            ->join('usuarios as up', 'up.id', '=', 'pp.usuario_id')
            ->where('r.id', $receta)
            ->whereIn('r.estado', ['emitida', 'anulada']);

        if ($usuario->rol === 'medico') {
            $consulta->where('pm.usuario_id', $usuario->id);
        } else {
            $consulta
                ->where('pp.usuario_id', $usuario->id)
                ->whereNotNull('hc.firmado_en');
        }

        $registro = $consulta->first([
            'r.id',
            'r.numero_receta',
            'r.emitida_en',
            'r.vence_en',
            'r.estado',
            'r.indicaciones',
            'c.id as cita_id',
            'c.inicia_en as fecha_consulta',
            'um.nombre as medico',
            'pm.numero_licencia',
            'up.nombre as paciente',
        ]);

        // No revela si existe una receta que pertenece a otra persona.
        abort_unless($registro, 404, 'Receta no encontrada.');

        $medicamentos = DB::table('detalles_receta')
            ->where('receta_id', $registro->id)
            ->orderBy('id')
            ->get([
                'medicamento',
                'dosis',
                'frecuencia',
                'duracion_dias',
                'via_administracion',
                'cantidad',
                'indicaciones',
            ]);

        $ahora = CarbonImmutable::now(self::ZONA);

        $vencida = $registro->vence_en !== null &&
            CarbonImmutable::parse(
                $registro->vence_en,
                self::ZONA
            )->lessThanOrEqualTo($ahora);

        $estadoDocumento = match (true) {
            $registro->estado === 'anulada' => 'ANULADA',
            $vencida => 'VENCIDA',
            default => 'EMITIDA',
        };

        $pdf = Pdf::loadView('pdf.receta', [
            'receta' => $registro,
            'medicamentos' => $medicamentos,
            'estadoDocumento' => $estadoDocumento,
            'generadoEn' => $ahora->toDateTimeString(),
        ])
            ->setPaper('a4')
            ->setOptions([
                'defaultFont' => 'DejaVu Sans',
                'isRemoteEnabled' => false,
                'isPhpEnabled' => false,
                'isJavascriptEnabled' => false,
            ]);

        $contenido = $pdf->output();

        DB::table('registros_auditoria')->insert([
            'usuario_actor_id' => $usuario->id,
            'accion' => 'receta.pdf_descargado',
            'tipo_recurso' => 'receta',
            'recurso_id' => $registro->id,
            'ocurrido_en' => $ahora->toDateTimeString(),
            'solicitud_id' => (string) Str::uuid(),
            'direccion_ip' => $request->ip(),
            'detalles' => json_encode([
                'estado_al_generar' => $estadoDocumento,
            ], JSON_THROW_ON_ERROR),
            'creado_en' => $ahora->toDateTimeString(),
            'actualizado_en' => $ahora->toDateTimeString(),
        ]);

        return response($contenido, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' =>
                'attachment; filename="receta-'.$registro->id.'.pdf"',
            'Cache-Control' => 'private, no-store, max-age=0',
            'Pragma' => 'no-cache',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
