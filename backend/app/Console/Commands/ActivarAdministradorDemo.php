<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;

class ActivarAdministradorDemo extends Command
{
    protected $signature = 'demo:activar-admin';

    protected $description =
        'Activa la cuenta administradora de demostración en el entorno local';

    public function handle(): int
    {
        if (! app()->environment('local')) {
            $this->error('Este comando solo está disponible en el entorno local.');

            return self::FAILURE;
        }

        $usuario = User::query()
            ->where('correo', 'admin@mediconnect.test')
            ->where('rol', 'administrador')
            ->first();

        if (! $usuario) {
            $this->error(
                'No se encontró la cuenta admin@mediconnect.test con rol administrador.'
            );

            return self::FAILURE;
        }

        if ($usuario->activo) {
            $this->info(
                'La cuenta administradora ya está activa. No se modificó su contraseña.'
            );

            return self::SUCCESS;
        }

        $contrasena = $this->secret('Escribe una contraseña nueva', false);

        if (
            ! is_string($contrasena) ||
            mb_strlen($contrasena) < 12 ||
            mb_strlen($contrasena) > 64 ||
            strlen($contrasena) > 72
        ) {
            $this->error(
                'Usa entre 12 y 64 caracteres, sin superar 72 bytes.'
            );

            return self::FAILURE;
        }

        $confirmacion = $this->secret('Repite la contraseña', false);

        if ($contrasena !== $confirmacion) {
            $this->error('Las contraseñas no coinciden. No se realizó ningún cambio.');

            return self::FAILURE;
        }

        $usuario->contrasena = Hash::make($contrasena);
        $usuario->activo = true;
        $usuario->token_recordatorio = null;
        $usuario->save();

        $this->info('Cuenta administradora activada correctamente.');
        $this->line('Correo: admin@mediconnect.test');

        return self::SUCCESS;
    }
}

