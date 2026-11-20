<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// En local, ejecutar `php artisan schedule:work` mantiene este recordatorio.
// En AWS, EventBridge Scheduler debe invocar cada 10 minutos el comando
// `php artisan notificaciones:recordatorios` en una tarea ECS.
Schedule::command('notificaciones:recordatorios')
    ->everyTenMinutes()
    ->timezone('America/El_Salvador')
    ->withoutOverlapping();
