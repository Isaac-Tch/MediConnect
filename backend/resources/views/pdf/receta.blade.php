<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">

    <title>Receta MediConnect</title>

    <style>
        @page {
            margin: 35px 40px 45px;
        }

        body {
            font-family: "DejaVu Sans", sans-serif;
            font-size: 11px;
            color: #1e293b;
            line-height: 1.5;
        }

        h1 {
            margin: 0;
            font-size: 25px;
            color: #0f766e;
        }

        h2 {
            font-size: 16px;
            margin-top: 22px;
            margin-bottom: 10px;
        }

        h3 {
            font-size: 13px;
            margin-top: 18px;
            margin-bottom: 7px;
            page-break-after: avoid;
        }

        p {
            margin-top: 5px;
            margin-bottom: 5px;
            overflow-wrap: break-word;
        }

        .subtitulo {
            color: #64748b;
            margin-top: 3px;
        }

        .aviso {
            margin-top: 16px;
            padding: 10px;
            border: 1px solid #f59e0b;
            background: #fffbeb;
            color: #92400e;
        }

        .estado {
            margin-top: 15px;
            padding: 10px;
            border: 1px solid #94a3b8;
            background: #f1f5f9;
            font-weight: bold;
        }

        .invalida {
            border-color: #dc2626;
            color: #991b1b;
            background: #fef2f2;
        }

        .datos {
            width: 100%;
            border-collapse: collapse;
            margin-top: 18px;
        }

        .datos td {
            width: 50%;
            vertical-align: top;
            padding: 8px;
            border: 1px solid #e2e8f0;
        }

        .etiqueta {
            color: #64748b;
            font-size: 10px;
        }

        .texto {
            white-space: pre-wrap;
            overflow-wrap: break-word;
        }

        .medicamento {
            border-top: 1px solid #cbd5e1;
            padding-top: 5px;
            margin-top: 12px;
        }

        .pie {
            margin-top: 25px;
            padding-top: 12px;
            border-top: 1px solid #cbd5e1;
            font-size: 9px;
            color: #64748b;
        }
    </style>
</head>

<body>
    <h1>MediConnect</h1>
    <p class="subtitulo">Registro de receta</p>

    <div class="aviso">
        DEMOSTRACIÓN ACADÉMICA — SIN VALIDEZ PARA DISPENSACIÓN.
        Este documento no incorpora una firma digital certificada.
    </div>

    <div class="estado {{ $estadoDocumento !== 'EMITIDA' ? 'invalida' : '' }}">
        Estado al generar el documento: {{ $estadoDocumento }}

        @if ($estadoDocumento !== 'EMITIDA')
            <br>
            Se conserva únicamente como registro histórico.
        @endif
    </div>

    <p style="margin-top: 12px;">
        <strong>Número:</strong> {{ $receta->numero_receta }}
    </p>

    <table class="datos">
        <tr>
            <td>
                <div class="etiqueta">Paciente</div>
                <strong>{{ $receta->paciente }}</strong>
            </td>
            <td>
                <div class="etiqueta">Médico</div>
                <strong>{{ $receta->medico }}</strong>
            </td>
        </tr>
        <tr>
            <td>
                <div class="etiqueta">Cita</div>
                #{{ $receta->cita_id }}
                <br>
                {{ $receta->fecha_consulta }}
            </td>
            <td>
                <div class="etiqueta">Licencia registrada</div>
                {{ $receta->numero_licencia }}
            </td>
        </tr>
        <tr>
            <td>
                <div class="etiqueta">Fecha de emisión</div>
                {{ $receta->emitida_en }}
            </td>
            <td>
                <div class="etiqueta">Fecha de vencimiento</div>
                {{ $receta->vence_en ?: 'No especificada' }}
            </td>
        </tr>
    </table>

    @if ($receta->indicaciones)
        <h2>Indicaciones generales</h2>
        <p class="texto">{{ $receta->indicaciones }}</p>
    @endif

    <h2>Medicamentos registrados</h2>

    @forelse ($medicamentos as $medicamento)
        <div class="medicamento">
            <h3>
                {{ $loop->iteration }}.
                {{ $medicamento->medicamento }}
            </h3>

            <p><strong>Dosis:</strong> {{ $medicamento->dosis }}</p>

            <p>
                <strong>Frecuencia:</strong>
                {{ $medicamento->frecuencia }}
            </p>

            <p>
                <strong>Duración:</strong>
                {{ $medicamento->duracion_dias }} días
            </p>

            <p>
                <strong>Vía de administración:</strong>
                {{ $medicamento->via_administracion }}
            </p>

            <p>
                <strong>Cantidad total:</strong>
                {{ $medicamento->cantidad }}
            </p>

            @if ($medicamento->indicaciones)
                <p><strong>Indicaciones:</strong></p>
                <p class="texto">{{ $medicamento->indicaciones }}</p>
            @endif
        </div>
    @empty
        <p>No hay medicamentos registrados.</p>
    @endforelse

    <div class="pie">
        <p>Documento generado: {{ $generadoEn }}</p>
        <p>Zona horaria: America/El_Salvador.</p>
        <p>
            El estado corresponde al momento de generación.
            Consulta la plataforma para comprobar cambios posteriores.
        </p>
        <p>
            Documento personal. Contiene información de la atención médica.
        </p>
    </div>
</body>
</html>
