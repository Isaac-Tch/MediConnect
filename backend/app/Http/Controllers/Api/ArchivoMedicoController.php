<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

class ArchivoMedicoController extends Controller
{
    private const ZONA = 'America/El_Salvador';

    public function citas(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'fecha' => ['required', 'date_format:Y-m-d'],
        ]);

        $inicio = $datos['fecha'].' 00:00:00';

        $fin = CarbonImmutable::parse($datos['fecha'], self::ZONA)
            ->addDay()
            ->startOfDay()
            ->toDateTimeString();

        $citas = $this->citasAutorizadas($request)
            ->whereIn('c.estado', [
                'pendiente',
                'confirmada',
                'completada',
            ])
            ->where('c.inicia_en', '>=', $inicio)
            ->where('c.inicia_en', '<', $fin)
            ->select([
                'c.id',
                'c.inicia_en',
                'c.estado',
                'um.nombre as medico',
                'up.nombre as paciente',
            ])
            ->orderBy('c.inicia_en')
            ->orderBy('c.id')
            ->paginate(10);

        return response()->json($citas);
    }

    public function index(Request $request): JsonResponse
    {
        $archivos = $this->archivosAutorizados($request)
            ->select([
                'a.id',
                'a.cita_id',
                'a.nombre_original',
                'a.tipo_mime',
                'a.tamano_bytes',
                'a.creado_en',
                'c.inicia_en',
                'um.nombre as medico',
                'up.nombre as paciente',
                'autor.nombre as subido_por_nombre',
            ])
            ->orderByDesc('a.id')
            ->paginate(10);

        return response()->json($archivos);
    }

    public function store(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'cita_id' => ['required', 'integer', 'min:1'],
            'archivo' => [
                'required',
                'file',
                'min:1',
                'max:2048',
                'mimes:pdf,jpg,jpeg,png',
                'mimetypes:application/pdf,image/jpeg,image/png',
                'extensions:pdf,jpg,jpeg,png',
            ],
        ], [
            'cita_id.required' => 'Selecciona una cita.',
            'archivo.required' => 'Selecciona un archivo.',
            'archivo.file' => 'El archivo recibido no es válido.',
            'archivo.min' => 'El archivo debe tener al menos 1 KB.',
            'archivo.max' => 'El archivo no puede superar 2 MB.',
            'archivo.mimes' => 'Solo se permiten PDF, JPG o PNG.',
            'archivo.mimetypes' =>
                'El contenido del archivo no es compatible.',
            'archivo.extensions' =>
                'La extensión debe ser PDF, JPG o PNG.',
            'archivo.uploaded' =>
                'No se pudo recibir el archivo. Comprueba su tamaño.',
        ]);

        $cita = $this->citasAutorizadas($request)
            ->where('c.id', $datos['cita_id'])
            ->select([
                'c.id',
                'c.paciente_id',
                'c.estado',
                'c.horario_id',
            ])
            ->first();

        abort_unless($cita, 404, 'Cita no encontrada.');

        abort_unless(
            in_array(
                $cita->estado,
                ['pendiente', 'confirmada', 'completada'],
                true
            ),
            409,
            'No puedes subir documentos a esta cita.'
        );

        $archivo = $request->file('archivo');
        $mime = $archivo->getMimeType();
        $disco = (string) config('filesystems.medical_disk', 'local');

        abort_unless(
            in_array($disco, ['local', 's3'], true),
            500,
            'El disco de archivos médicos no es válido.'
        );

        $extension = match ($mime) {
            'application/pdf' => 'pdf',
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            default => null,
        };

        abort_unless($extension, 422, 'Tipo de archivo no permitido.');

        $nombreOriginal = basename(
            str_replace('\\', '/', $archivo->getClientOriginalName())
        );

        $nombreOriginal = preg_replace(
            '/[\x00-\x1F\x7F]/u',
            '',
            $nombreOriginal
        ) ?: 'documento.'.$extension;

        $nombreOriginal = mb_substr($nombreOriginal, 0, 255);

        $hash = hash_file('sha256', $archivo->getRealPath());

        abort_unless(
            $hash !== false,
            500,
            'No se pudo verificar el archivo.'
        );

        $clave = $archivo->storeAs(
            'archivos_medicos',
            Str::uuid().'.'.$extension,
            $disco
        );

        abort_unless($clave, 500, 'No se pudo guardar el archivo.');

        try {
            $id = DB::transaction(function () use (
                $request,
                $cita,
                $archivo,
                $mime,
                $nombreOriginal,
                $hash,
                $clave,
                $disco
            ) {
                DB::table('horarios_cita')
                    ->where('id', $cita->horario_id)
                    ->lockForUpdate()
                    ->first();

                $actual = DB::table('citas')
                    ->where('id', $cita->id)
                    ->lockForUpdate()
                    ->first();

                abort_unless(
                    $actual &&
                    in_array(
                        $actual->estado,
                        ['pendiente', 'confirmada', 'completada'],
                        true
                    ),
                    409,
                    'El estado de la cita cambió. Actualiza el listado.'
                );

                $marca = CarbonImmutable::now(self::ZONA)
                    ->toDateTimeString();

                $id = DB::table('archivos_medicos')->insertGetId([
                    'paciente_id' => $cita->paciente_id,
                    'cita_id' => $cita->id,
                    'subido_por' => $request->user()->id,
                    'nombre_original' => $nombreOriginal,
                    'disco_almacenamiento' => $disco,
                    'clave_objeto' => $clave,
                    'tipo_mime' => $mime,
                    'tamano_bytes' => $archivo->getSize(),
                    'hash_sha256' => $hash,
                    'estado' => 'disponible',
                    'eliminado_en' => null,
                    'creado_en' => $marca,
                    'actualizado_en' => $marca,
                ]);

                $this->auditar(
                    $request,
                    'archivo_medico.subido',
                    $id
                );

                return $id;
            });
        } catch (Throwable $error) {
            try {
                Storage::disk($disco)->delete($clave);
            } catch (Throwable $errorLimpieza) {
                report($errorLimpieza);
            }

            throw $error;
        }

        return response()->json([
            'message' => 'Documento guardado correctamente.',
            'id' => $id,
        ], 201);
    }

    public function descargar(
        Request $request,
        int $archivo
    ): StreamedResponse {
        $registro = $this->archivosAutorizados($request)
            ->where('a.id', $archivo)
            ->select([
                'a.id',
                'a.disco_almacenamiento',
                'a.clave_objeto',
                'a.tipo_mime',
            ])
            ->first();

        abort_unless($registro, 404, 'Documento no encontrado.');

        abort_unless(
            in_array(
                $registro->disco_almacenamiento,
                ['local', 's3'],
                true
            ),
            404,
            'Almacenamiento no disponible.'
        );

        /** @var FilesystemAdapter $disco */
        $disco = Storage::disk($registro->disco_almacenamiento);

        abort_unless(
            $disco->exists($registro->clave_objeto),
            404,
            'El documento está registrado, pero su archivo no está disponible.'
        );

        $extension = match ($registro->tipo_mime) {
            'application/pdf' => 'pdf',
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'application/dicom' => 'dcm',
            default => 'bin',
        };

        $this->auditar(
            $request,
            'archivo_medico.descargado',
            $registro->id
        );

        return $disco->download(
            $registro->clave_objeto,
            'documento-'.$registro->id.'.'.$extension,
            [
                'Content-Type' => $registro->tipo_mime,
                'Cache-Control' => 'private, no-store, max-age=0',
                'Pragma' => 'no-cache',
                'X-Content-Type-Options' => 'nosniff',
            ]
        );
    }

    private function citasAutorizadas(Request $request): Builder
    {
        $usuario = $request->user();

        abort_unless(
            $usuario &&
            $usuario->activo &&
            in_array($usuario->rol, ['medico', 'paciente'], true),
            403,
            'No tienes permiso para acceder a estos documentos.'
        );

        $consulta = DB::table('citas as c')
            ->join('horarios_cita as h', 'h.id', '=', 'c.horario_id')
            ->join('perfiles_medico as pm', 'pm.id', '=', 'h.medico_id')
            ->join('usuarios as um', 'um.id', '=', 'pm.usuario_id')
            ->join('perfiles_paciente as pp', 'pp.id', '=', 'c.paciente_id')
            ->join('usuarios as up', 'up.id', '=', 'pp.usuario_id');

        if ($usuario->rol === 'medico') {
            $consulta->where('pm.usuario_id', $usuario->id);
        } else {
            $consulta->where('pp.usuario_id', $usuario->id);
        }

        return $consulta;
    }

    private function archivosAutorizados(Request $request): Builder
    {
        return $this->citasAutorizadas($request)
            ->join('archivos_medicos as a', function ($join) {
                $join->on('a.cita_id', '=', 'c.id')
                    ->on('a.paciente_id', '=', 'c.paciente_id');
            })
            ->join('usuarios as autor', 'autor.id', '=', 'a.subido_por')
            ->where('a.estado', 'disponible')
            ->whereNull('a.eliminado_en');
    }

    private function auditar(
        Request $request,
        string $accion,
        int $archivoId
    ): void {
        $marca = CarbonImmutable::now(self::ZONA)->toDateTimeString();

        DB::table('registros_auditoria')->insert([
            'usuario_actor_id' => $request->user()->id,
            'accion' => $accion,
            'tipo_recurso' => 'archivo_medico',
            'recurso_id' => $archivoId,
            'ocurrido_en' => $marca,
            'solicitud_id' => (string) Str::uuid(),
            'direccion_ip' => $request->ip(),
            'detalles' => null,
            'creado_en' => $marca,
            'actualizado_en' => $marca,
        ]);
    }
}

