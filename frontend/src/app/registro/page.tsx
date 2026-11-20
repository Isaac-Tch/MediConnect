"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import axios from "axios";
import { api } from "@/lib/api";

type ErrorRegistro = {
  message?: string;
  errors?: Record<string, string[]>;
};

type Campo = {
  nombre: string;
  etiqueta: string;
  tipo: string;
  autocomplete: string;
  obligatorio: boolean;
  maximo?: number;
};

const campos: Campo[] = [
  {
    nombre: "nombre",
    etiqueta: "Nombre completo",
    tipo: "text",
    autocomplete: "name",
    obligatorio: true,
    maximo: 150,
  },
  {
    nombre: "correo",
    etiqueta: "Correo electrónico",
    tipo: "email",
    autocomplete: "email",
    obligatorio: true,
    maximo: 254,
  },
  {
    nombre: "fecha_nacimiento",
    etiqueta: "Fecha de nacimiento",
    tipo: "date",
    autocomplete: "bday",
    obligatorio: true,
  },
  {
    nombre: "telefono",
    etiqueta: "Teléfono — opcional, con código de país",
    tipo: "tel",
    autocomplete: "tel",
    obligatorio: false,
    maximo: 16,
  },
  {
    nombre: "contrasena",
    etiqueta: "Contraseña — entre 12 y 64 caracteres",
    tipo: "password",
    autocomplete: "new-password",
    obligatorio: true,
    maximo: 64,
  },
  {
    nombre: "contrasena_confirmation",
    etiqueta: "Repite la contraseña",
    tipo: "password",
    autocomplete: "new-password",
    obligatorio: true,
    maximo: 64,
  },
];

export default function RegistroPage() {
  const [procesando, setProcesando] = useState(false);
  const [creada, setCreada] = useState(false);
  const [errores, setErrores] = useState<string[]>([]);

  async function registrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    if (procesando) return;

    const formulario = evento.currentTarget;
    const datos = new FormData(formulario);

    setProcesando(true);
    setErrores([]);

    try {
      await api.get("/sanctum/csrf-cookie");

      await api.post("/registro", {
        nombre: String(datos.get("nombre") ?? "").trim(),
        correo: String(datos.get("correo") ?? "").trim(),
        fecha_nacimiento: datos.get("fecha_nacimiento"),
        telefono: String(datos.get("telefono") ?? "").trim() || null,
        contrasena: datos.get("contrasena"),
        contrasena_confirmation: datos.get("contrasena_confirmation"),
      });

      formulario.reset();
      setCreada(true);
    } catch (error: unknown) {
      if (axios.isAxiosError<ErrorRegistro>(error)) {
        const estado = error.response?.status;
        const validaciones = error.response?.data.errors;

        if (estado === 422 && validaciones) {
          setErrores(Object.values(validaciones).flat());
        } else if (estado === 409) {
          setErrores([
            "Cierra tu sesión antes de registrar otra cuenta.",
          ]);
        } else if (estado === 429) {
          setErrores([
            "Demasiados intentos. Espera un minuto.",
          ]);
        } else if (estado === 419) {
          setErrores([
            "La sesión de seguridad venció. Intenta nuevamente.",
          ]);
        } else if (!error.response) {
          setErrores([
            "No se pudo conectar con Laravel.",
          ]);
        } else {
          setErrores([
            "No se pudo crear la cuenta. Intenta nuevamente.",
          ]);
        }
      } else {
        setErrores(["Ocurrió un error inesperado."]);
      }
    } finally {
      setProcesando(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-12 text-slate-900">
      <section className="mx-auto max-w-lg rounded-2xl bg-white p-8 shadow-lg">
        <p className="text-sm font-semibold text-teal-700">
          MEDICONNECT
        </p>

        <h1 className="mt-2 text-2xl font-bold">
          Crear cuenta de paciente
        </h1>

        {creada ? (
          <div className="mt-6 space-y-4">
            <p role="status">
              Tu cuenta fue creada correctamente.
            </p>

            <Link
              href="/"
              className="inline-block rounded-lg bg-teal-700 px-5 py-3 text-white"
            >
              Ir al inicio de sesión
            </Link>
          </div>
        ) : (
          <>
            {errores.length > 0 && (
              <ul
                role="alert"
                className="mt-5 list-inside list-disc rounded-lg bg-red-50 p-4 text-sm text-red-800"
              >
                {errores.map((mensaje, indice) => (
                  <li key={indice}>{mensaje}</li>
                ))}
              </ul>
            )}

            <form onSubmit={registrar} className="mt-6 space-y-4">
              {campos.map((campo) => (
                <div key={campo.nombre}>
                  <label
                    htmlFor={campo.nombre}
                    className="mb-1 block text-sm font-medium"
                  >
                    {campo.etiqueta}
                  </label>

                  <input
                    id={campo.nombre}
                    name={campo.nombre}
                    type={campo.tipo}
                    autoComplete={campo.autocomplete}
                    required={campo.obligatorio}
                    maxLength={campo.maximo}
                    minLength={
                      campo.tipo === "password" ? 12 : undefined
                    }
                    disabled={procesando}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              ))}

              <button
                type="submit"
                disabled={procesando}
                className="w-full rounded-lg bg-teal-700 px-4 py-3 font-medium text-white disabled:opacity-50"
              >
                {procesando ? "Creando cuenta…" : "Crear cuenta"}
              </button>

              <p className="text-center text-sm">
                ¿Ya tienes una cuenta?{" "}
                <Link
                  href="/"
                  className="font-medium text-teal-700 underline"
                >
                  Inicia sesión
                </Link>
              </p>
            </form>
          </>
        )}
      </section>
    </main>
  );
}

