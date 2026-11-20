<?php

namespace App\Models;

use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    use Notifiable, SoftDeletes;

    protected $table = 'usuarios';

    public const CREATED_AT = 'creado_en';
    public const UPDATED_AT = 'actualizado_en';
    public const DELETED_AT = 'eliminado_en';

    protected $fillable = [
        'nombre',
        'correo',
    ];

    protected $hidden = [
        'contrasena',
        'token_recordatorio',
    ];

    protected function casts(): array
    {
        return [
            'correo_verificado_en' => 'datetime',
            'activo' => 'boolean',
            'contrasena' => 'hashed',
        ];
    }

    public function getAuthPasswordName()
    {
        return 'contrasena';
    }

    public function getRememberTokenName()
    {
        return 'token_recordatorio';
    }

    public function perfilMedico()
    {
        return $this->hasMany(HorarioCita::class, 'medico_id');
    }
    
    public function perfilPaciente()
    {
        return $this->hasOne(PerfilPaciente::class, 'usuario_id');
    }


}