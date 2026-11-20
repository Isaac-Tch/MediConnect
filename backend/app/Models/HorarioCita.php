<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HorarioCita extends Model
{
    protected $table = 'horarios_cita';

    public const CREATED_AT = 'creado_en';
    public const UPDATED_AT = 'actualizado_en';

    protected function casts(): array
    {
        return [
            'inicia_en' => 'datetime',
            'termina_en' => 'datetime',
        ];
    }

    public function medico()
    {
        return $this->belongsTo(PerfilMedico::class, 'medico_id');
    }

    public function citas()
    {
        return $this->hasMany(Cita::class, 'horario_id');
    }
}

