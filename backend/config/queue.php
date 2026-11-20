<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default Queue Connection
    |--------------------------------------------------------------------------
    |
    | En local se usa "database"; en AWS se cambia únicamente con la variable
    | QUEUE_CONNECTION=sqs. Ninguna credencial ni nombre de recurso se escribe
    | directamente en este archivo.
    |
    */

    'default' => env('QUEUE_CONNECTION', 'database'),

    'connections' => [

        'sync' => [
            'driver' => 'sync',
        ],

        'database' => [
            'driver' => 'database',
            'connection' => env('DB_CONNECTION', 'mysql'),
            'table' => env('QUEUE_TABLE', 'jobs'),
            'queue' => env('QUEUE_NAME', 'default'),
            'retry_after' => (int) env('QUEUE_RETRY_AFTER', 90),
            'after_commit' => false,
        ],

        'sqs' => [
            'driver' => 'sqs',
            'key' => env('AWS_ACCESS_KEY_ID'),
            'secret' => env('AWS_SECRET_ACCESS_KEY'),
            'prefix' => env(
                'SQS_PREFIX',
                'https://sqs.us-east-1.amazonaws.com/000000000000'
            ),
            'queue' => env('SQS_QUEUE', 'default'),
            'suffix' => env('SQS_SUFFIX'),
            'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
            'after_commit' => false,
        ],

        // Cola exclusiva de avisos por correo. El driver cambia con el entorno:
        // database en local y sqs en AWS, sin tocar el código de los jobs.
        'notificaciones' => [
            'driver' => env('QUEUE_CONNECTION', 'database'),
            'connection' => env('DB_CONNECTION', 'mysql'),
            'table' => env('QUEUE_TABLE', 'jobs'),
            'queue' => env('NOTIFICATIONS_QUEUE', 'notificaciones'),
            'retry_after' => (int) env('NOTIFICATIONS_RETRY_AFTER', 180),
            'after_commit' => false,
            'key' => env('AWS_ACCESS_KEY_ID'),
            'secret' => env('AWS_SECRET_ACCESS_KEY'),
            'prefix' => env(
                'SQS_PREFIX',
                'https://sqs.us-east-1.amazonaws.com/000000000000'
            ),
            'suffix' => env('SQS_SUFFIX'),
            'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
        ],

        // Cola de reportes; también sigue QUEUE_CONNECTION.
        'reportes' => [
            'driver' => env('QUEUE_CONNECTION', 'database'),
            'connection' => env('DB_CONNECTION', 'mysql'),
            'table' => env('QUEUE_TABLE', 'jobs'),
            'queue' => env('REPORTS_QUEUE', 'reportes'),
            'retry_after' => (int) env('REPORTS_RETRY_AFTER', 1500),
            'after_commit' => false,
            'key' => env('AWS_ACCESS_KEY_ID'),
            'secret' => env('AWS_SECRET_ACCESS_KEY'),
            'prefix' => env(
                'SQS_PREFIX',
                'https://sqs.us-east-1.amazonaws.com/000000000000'
            ),
            'suffix' => env('SQS_SUFFIX'),
            'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Failed Queue Jobs
    |--------------------------------------------------------------------------
    |
    | Laravel guarda los jobs agotados en la tabla estándar failed_jobs para
    | poder reintentarlos o inspeccionarlos con queue:failed / queue:retry.
    |
    */

    'failed' => [
        'driver' => env('QUEUE_FAILED_DRIVER', 'database-uuids'),
        'database' => env('DB_CONNECTION', 'mysql'),
        'table' => env('QUEUE_FAILED_TABLE', 'failed_jobs'),
    ],

    'batching' => [
        'database' => env('DB_CONNECTION', 'mysql'),
        'table' => 'job_batches',
    ],

];
