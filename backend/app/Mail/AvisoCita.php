<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class AvisoCita extends Mailable
{
    /**
     * El aviso solo contiene datos operativos de la cita.
     * Nunca se incluye motivo de consulta, diagnóstico ni otra información
     * clínica.
     */
    public function __construct(
        public string $destinatarioNombre,
        public string $asuntoAviso,
        public int $citaId,
        public string $fechaHora,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: $this->asuntoAviso,
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'mail.aviso-cita',
        );
    }

    public function attachments(): array
    {
        return [];
    }
}
