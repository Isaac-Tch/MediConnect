"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import axios from "axios";
import { api } from "@/lib/api";
import CampanaNotificaciones from "@/components/CampanaNotificaciones";
import { endpointsPorRol, mensajeError } from "@/lib/auth";
import type {
  RespuestaUsuario,
  Rol,
  Usuario,
} from "@/lib/auth";

type Props = {
  rol: Rol;
  children: ReactNode;
};

const enlaces: Record<Rol, { href: string; texto: string }[]> = {
  paciente: [
    { href: "/paciente", texto: "Citas y reservas" },
    { href: "/paciente/historial", texto: "Mi historial" },
    { href: "/paciente/recetas", texto: "Mis recetas" },
    { href: "/paciente/archivos", texto: "Documentos" },
    { href: "/paciente/perfil", texto: "Mi perfil" },
  ],
  medico: [
    { href: "/medico", texto: "Mi panel" },
    { href: "/medico/agenda", texto: "Agenda" },
    {
      href: "/medico/historiales",
      texto: "Atención e historiales",
    },
    { href: "/medico/recetas", texto: "Recetas" },
    { href: "/medico/archivos", texto: "Documentos" },
  ],
  administrador: [
    { href: "/admin", texto: "Mi panel" },
    { href: "/admin/medicos", texto: "Médicos" },
    { href: "/admin/especialidades", texto: "Especialidades" },
    { href: "/admin/reportes", texto: "Reportes" },
  ],
};

export default function PanelProtegido({
  rol,
  children,
}: Props) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [comprobando, setComprobando] = useState(true);
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let vigente = true;

    async function comprobarAcceso() {
      setComprobando(true);
      setUsuario(null);
      setError("");

      try {
        const respuesta = await api.get<RespuestaUsuario>(
          endpointsPorRol[rol],
          { timeout: 15000 }
        );

        if (vigente) {
          setUsuario(respuesta.data.usuario);
        }
      } catch (error: unknown) {
        if (!vigente) return;

        if (
          axios.isAxiosError(error) &&
          error.response?.status === 401
        ) {
          window.location.replace("/");
          return;
        }

        setError(mensajeError(error));
      } finally {
        if (vigente) {
          setComprobando(false);
        }
      }
    }

    comprobarAcceso();

    return () => {
      vigente = false;
    };
  }, [rol]);

  async function cerrarSesion() {
    if (cerrando) return;

    setCerrando(true);
    setError("");

    try {
      await api.get("/sanctum/csrf-cookie", {
        timeout: 15000,
      });

      await api.post("/logout", undefined, {
        timeout: 15000,
      });

      // Solo navega después de que Laravel confirme el cierre.
      // La recarga elimina el estado de la sesión anterior.
      window.location.replace("/");
    } catch (error: unknown) {
      setError(mensajeError(error));
      setCerrando(false);
    }
  }

  if (comprobando) {
    return (
      <main className="min-h-screen bg-slate-100 p-8 text-slate-900">
        <p role="status">Comprobando tu acceso…</p>
      </main>
    );
  }

  if (!usuario) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-slate-900">
        <section className="w-full max-w-md rounded-xl bg-white p-8 shadow">
          <h1 className="text-xl font-bold">Acceso al panel</h1>

          <p role="alert" className="mt-4">
            {error || "Redirigiendo al inicio de sesión…"}
          </p>

          <a
            href="/"
            className="mt-6 inline-block text-teal-700 underline"
          >
            Volver al inicio
          </a>

          <button
            type="button"
            onClick={cerrarSesion}
            disabled={cerrando}
            className="mt-5 block rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
          >
            {cerrando ? "Cerrando sesión…" : "Cerrar sesión"}
          </button>
        </section>
      </main>
    );
  }

  return (
    <>
      <header className="border-b border-slate-200 bg-white px-6 py-4 text-slate-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-semibold">
              Hola, {usuario.nombre}
            </p>
            <p className="text-sm capitalize text-slate-600">
              {usuario.rol}
            </p>
          </div>

          <nav
            aria-label="Navegación del panel"
            className="flex flex-wrap gap-4 text-sm font-medium text-teal-700"
          >
            {enlaces[rol].map((enlace) => (
              <Link key={enlace.href} href={enlace.href}>
                {enlace.texto}
              </Link>
            ))}
          </nav>

          <CampanaNotificaciones />

          <button
            type="button"
            onClick={cerrarSesion}
            disabled={cerrando}
            className="rounded-lg bg-slate-900 px-4 py-2 text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {cerrando ? "Cerrando sesión…" : "Cerrar sesión"}
          </button>
        </div>

        {error && (
          <p
            role="alert"
            className="mx-auto mt-3 max-w-6xl text-sm text-red-700"
          >
            {error}
          </p>
        )}
      </header>

      {children}
    </>
  );
}

