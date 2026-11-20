<?php

namespace App\Services;

use App\Contracts\VideoProvider;
use App\Support\VideoRoom;
use RuntimeException;

class JitsiVideoProvider implements VideoProvider
{
    public function nombre(): string
    {
        return 'jitsi';
    }

    public function crearSala(int $citaId): VideoRoom
    {
        $clave = (string) config('app.key');

        if ($clave === '') {
            throw new RuntimeException(
                'APP_KEY es obligatoria para generar salas de videollamada.'
            );
        }

        // La firma hace que el nombre de la sala no se pueda adivinar a partir
        // del ID de la cita. Es determinista para permitir reconexiones.
        $firma = substr(
            hash_hmac('sha256', 'videollamada:cita:'.$citaId, $clave),
            0,
            32
        );

        $prefijo = preg_replace(
            '/[^a-z0-9-]/',
            '',
            strtolower((string) config('video.jitsi.room_prefix', 'mediconnect'))
        ) ?: 'mediconnect';

        $reunionId = sprintf('%s-cita-%d-%s', $prefijo, $citaId, $firma);
        $dominio = trim(
            (string) config('video.jitsi.domain', 'meet.jit.si'),
            " \t\n\r\0\x0B/"
        );

        return new VideoRoom(
            proveedor: $this->nombre(),
            reunionId: $reunionId,
            url: 'https://'.$dominio.'/'.$reunionId,
        );
    }
}
