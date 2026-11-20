<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PerfilPaciente extends Model
{
    protected $table = 'perfiles_paciente';

    public const CREATED_AT = 'creado_en';
    public const UPDATED_AT = 'actualizado_en';

    protected function casts(): array
    {
        return [
            'fecha_nacimiento' => 'date',
        ];
    }

    public function usuario()
    {
        return $this->belongsTo(User::class, 'usuario_id');
    }

    public function citas()
    {
        return $this->hasMany(Cita::class, 'paciente_id');
    }
}

