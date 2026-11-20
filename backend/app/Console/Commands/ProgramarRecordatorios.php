<?php

namespace App\Console\Commands;

use App\Services\AvisosCita;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class ProgramarRecordatorios extends Command
{
    protected $signature = 'notificaciones:recordatorios';
    protected $description = 'Encola una vez el recordatorio de citas confirmadas de la próxima hora';

    public function handle(AvisosCita $avisos): int
    {
        $ahora = CarbonImmutable::now('America/El_Salvador');
        $revisadas = 0;
        DB::table('citas')->where('estado', 'confirmada')
            ->where('inicia_en', '>', $ahora->toDateTimeString())
            ->where('inicia_en', '<=', $ahora->addHour()->toDateTimeString())
            ->select('id')->chunkById(100, function ($citas) use ($avisos, &$revisadas) {
                foreach ($citas as $cita) {
                    $avisos->registrar((int) $cita->id, 'recordatorio');
                    $revisadas++;
                }
            });
        $this->info("Citas revisadas: {$revisadas}. Los avisos existentes no se duplican.");
        return self::SUCCESS;
    }
}
