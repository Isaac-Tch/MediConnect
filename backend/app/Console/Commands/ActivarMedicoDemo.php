<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;

class ActivarMedicoDemo extends Command
{
    protected $signature = 'demo:activar-medico {correo}';

    protected $description = 'Prepara una cuenta medica de prueba local';

    public function handle(): int
    {
        if (! app()->environment('local')) {
            $this->error('Este comando solo funciona en desarrollo local.');

            return self::FAILURE;
        }

        $correo = $this->argument('correo');

        if (! in_array($correo, [
            'carlos@mediconnect.test',
            'lucia@mediconnect.test',
        ], true)) {
            $this->error('Utiliza el correo de uno de los dos medicos demo.');

            return self::FAILURE;
        }

        $usuario = User::where('correo', $correo)
            ->where('rol', 'medico')
            ->whereHas('perfilMedico')
            ->first();

        if (! $usuario) {
            $this->error('No se encontro el medico con su perfil.');

            return self::FAILURE;
        }

        if ($usuario->activo) {
            $this->info('La cuenta ya esta activa. No se realizaron cambios.');

            return self::SUCCESS;
        }

        $this->info("Preparando la cuenta de {$usuario->nombre}");

        $contrasena = $this->secret('Nueva contraseña, de 12 a 64 caracteres');
        $confirmacion = $this->secret('Repite la contraseña');

        if (
            ! is_string($contrasena)
            || mb_strlen($contrasena) < 12
            || mb_strlen($contrasena) > 64
            || strlen($contrasena) > 72
        ) {
            $this->error(
                'Usa entre 12 y 64 caracteres y un maximo de 72 bytes.'
            );

            return self::FAILURE;
        }

        if ($contrasena !== $confirmacion) {
            $this->error('Las contraseñas no coinciden.');

            return self::FAILURE;
        }

        $usuario->contrasena = Hash::make($contrasena);
        $usuario->activo = true;
        $usuario->token_recordatorio = null;
        $usuario->save();

        $this->info('Contraseña guardada y cuenta activada.');

        return self::SUCCESS;
    }
}