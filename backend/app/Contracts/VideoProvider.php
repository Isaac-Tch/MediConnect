<?php

namespace App\Contracts;

use App\Support\VideoRoom;

interface VideoProvider
{
    /**
     * Identificador del proveedor que se guarda en videoconsultas.proveedor.
     */
    public function nombre(): string;

    /**
     * Crea (o reutiliza) la sala remota de una cita.
     */
    public function crearSala(int $citaId): VideoRoom;
}
