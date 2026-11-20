<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $asuntoAviso }}</title>
</head>
<body style="margin: 0; padding: 24px; background: #f1f5f9; color: #0f172a; font-family: Arial, sans-serif;">
    <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 24px;">
        <h1 style="margin-top: 0; font-size: 20px;">{{ $asuntoAviso }}</h1>

        <p>Hola {{ $destinatarioNombre }},</p>

        <p>
            Este es un aviso de tu cita en MediConnect.
        </p>

        <ul>
            <li>Cita: #{{ $citaId }}</li>
            <li>Fecha y hora: {{ $fechaHora }} (hora de El Salvador)</li>
        </ul>

        <p>
            Consulta los detalles en tu cuenta de MediConnect.
        </p>

        <p style="margin-bottom: 0; color: #475569; font-size: 13px;">
            Este aviso no incluye el motivo de consulta ni datos clínicos.
            Por seguridad, no respondas a este correo con información médica.
        </p>
    </div>
</body>
</html>
