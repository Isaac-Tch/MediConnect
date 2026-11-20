<?php

use App\Http\Controllers\AuthController;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\RegistroController;

Route::get('/', function () {
    return view('welcome');
});

Route::post('/login', [AuthController::class, 'login'])
    ->middleware('throttle:5,1');

Route::post('/logout', [AuthController::class, 'logout']);

Route::post('/registro', [RegistroController::class, 'store'])
    ->middleware('throttle:5,1');
    
