<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PerfilMedico extends Model
{
    protected $table = 'perfiles_medico';

    public const CREATED_AT = 'creado_en';
    public const UPDATED_AT = 'actualizado_en';

    protected function casts(): array
    {
        return [
            'tarifa_consulta' => 'decimal:2',
        ];
    }

    public function usuario()
    {
        return $this->belongsTo(User::class, 'usuario_id');
    }

    public function especialidad()
    {
        return $this->belongsTo(Especialidad::class, 'especialidad_id');
    }
}

