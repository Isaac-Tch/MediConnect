"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import axios from "axios";
import { api } from "@/lib/api";
import { mensajeError, rutasPorRol } from "@/lib/auth";
import type { RespuestaUsuario } from "@/lib/auth";

export default function Home() {
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [comprobando, setComprobando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [redirigiendo, setRedirigiendo] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let vigente = true;

    async function comprobarSesion() {
      setComprobando(true);
      setRedirigiendo(false);
      setProcesando(false);
      setError("");
      setContrasena("");

      try {
        const respuesta = await api.get<RespuestaUsuario>(
          "/api/usuario",
          { timeout: 15000 }
        );

        if (!vigente) return;

        const destino = rutasPorRol[respuesta.data.usuario.rol];

        if (!destino) {
          setError("La cuenta no tiene un rol reconocido.");
          return;
        }

        setRedirigiendo(true);

        // Carga una página nueva para descartar el estado anterior.
        window.location.replace(destino);
      } catch (error: unknown) {
        if (!vigente) return;

        setRedirigiendo(false);

        const sinSesion =
          axios.isAxiosError(error) &&
          error.response?.status === 401;

        if (!sinSesion) {
          setError(mensajeError(error));
        }
      } finally {
        if (vigente) {
          setComprobando(false);
        }
      }
    }

    comprobarSesion();

    return () => {
      vigente = false;
    };
  }, []);

  async function iniciarSesion(
    evento: FormEvent<HTMLFormElement>
  ) {
    evento.preventDefault();

    if (procesando || redirigiendo) return;

    setError("");
    setProcesando(true);

    try {
      await api.get("/sanctum/csrf-cookie", {
        timeout: 15000,
      });

      const respuesta = await api.post<RespuestaUsuario>(
        "/login",
        {
          correo: correo.trim(),
          contrasena,
        },
        { timeout: 15000 }
      );

      const destino = rutasPorRol[respuesta.data.usuario.rol];

      if (!destino) {
        setError("La cuenta no tiene un rol reconocido.");
        return;
      }

      setRedirigiendo(true);
      window.location.replace(destino);
    } catch (error: unknown) {
      setRedirigiendo(false);
      setError(mensajeError(error));
    } finally {
      setContrasena("");
      setProcesando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12 text-slate-900">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <p className="mb-2 text-sm font-semibold tracking-wide text-teal-700">
          MEDICONNECT
        </p>

        <h1 className="text-2xl font-bold">Inicia sesión</h1>

        {error && (
          <div
            role="alert"
            className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        {comprobando || redirigiendo ? (
          <p role="status" className="mt-5 text-slate-600">
            {redirigiendo
              ? "Abriendo tu panel…"
              : "Comprobando tu sesión…"}
          </p>
        ) : (
          <form
            onSubmit={iniciarSesion}
            className="mt-6 space-y-5"
          >
            <p className="text-sm text-slate-600">
              Ingresa con el correo y la contraseña de tu cuenta.
            </p>

            <div>
              <label
                htmlFor="correo"
                className="mb-2 block text-sm font-medium"
              >
                Correo electrónico
              </label>

              <input
                id="correo"
                name="correo"
                type="email"
                autoComplete="username"
                required
                maxLength={254}
                value={correo}
                onChange={(evento) =>
                  setCorreo(evento.target.value)
                }
                disabled={procesando}
                className="w-full rounded-lg border border-slate-300 px-3 py-3 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label
                htmlFor="contrasena"
                className="mb-2 block text-sm font-medium"
              >
                Contraseña
              </label>

              <input
                id="contrasena"
                name="contrasena"
                type="password"
                autoComplete="current-password"
                required
                maxLength={255}
                value={contrasena}
                onChange={(evento) =>
                  setContrasena(evento.target.value)
                }
                disabled={procesando}
                className="w-full rounded-lg border border-slate-300 px-3 py-3 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <button
              type="submit"
              disabled={procesando}
              className="w-full rounded-lg bg-teal-700 px-4 py-3 font-medium text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {procesando ? "Ingresando…" : "Ingresar"}
            </button>

            <p className="text-center text-sm text-slate-600">
              ¿No tienes una cuenta?{" "}
              <Link
                href="/registro"
                className="font-medium text-teal-700 underline"
              >
                Crear cuenta
              </Link>
            </p>
          </form>
        )}
      </section>
    </main>
  );
}




