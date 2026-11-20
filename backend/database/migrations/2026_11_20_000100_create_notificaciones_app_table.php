<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notificaciones_app', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('usuario_id')->index();
            $t->unsignedBigInteger('cita_id')->nullable();
            $t->string('tipo', 40);
            $t->string('titulo', 120);
            $t->string('mensaje', 500);
            $t->string('url', 255)->nullable();
            $t->string('clave_deduplicacion', 120)->unique();
            $t->timestamp('leida_en')->nullable();
            $t->timestamp('creado_en')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notificaciones_app');
    }
};