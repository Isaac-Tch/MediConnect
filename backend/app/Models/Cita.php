<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Cita extends Model
{
    protected $table = 'citas';

    public const CREATED_AT = 'creado_en';
    public const UPDATED_AT = 'actualizado_en';

    protected function casts(): array
    {
        return [
            'inicia_en' => 'datetime',
            'cancelada_en' => 'datetime',
            'precio' => 'decimal:2',
        ];
    }

    public function paciente()
    {
        return $this->belongsTo(PerfilPaciente::class, 'paciente_id');
    }

    public function horario()
    {
        return $this->belongsTo(HorarioCita::class, 'horario_id');
    }

    public function reservadaPor()
    {
        return $this->belongsTo(User::class, 'reservada_por');
    }
}
