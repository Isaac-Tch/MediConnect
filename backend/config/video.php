<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Proveedor de videollamadas
    |--------------------------------------------------------------------------
    |
    | Jitsi es el prototipo sin costo. En AWS se debe reemplazar por una
    | implementación de Amazon Chime SDK que cumpla el mismo contrato
    | App\Contracts\VideoProvider y cambiar VIDEO_PROVIDER.
    |
    */

    'provider' => env('VIDEO_PROVIDER', 'jitsi'),

    'jitsi' => [
        'domain' => env('JITSI_DOMAIN', 'meet.jit.si'),
        'room_prefix' => env('VIDEO_ROOM_PREFIX', 'mediconnect'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Ventana de acceso
    |--------------------------------------------------------------------------
    |
    | La sala solo se entrega cerca de la cita. Por defecto abre 15 minutos
    | antes del inicio y cierra 15 minutos después del final del horario.
    |
    */

    'window_before_minutes' => (int) env('VIDEO_WINDOW_BEFORE_MINUTES', 15),
    'window_after_minutes' => (int) env('VIDEO_WINDOW_AFTER_MINUTES', 15),

];
