"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { erroresPaciente } from "@/lib/erroresPaciente";

type Perfil = {
  nombre: string;
  correo: string;
  fecha_nacimiento: string;
  telefono: string | null;
  direccion: string | null;
  contacto_emergencia_nombre: string | null;
  contacto_emergencia_telefono: string | null;
};

const campos = [
  { nombre: "nombre", etiqueta: "Nombre completo", tipo: "text", maximo: 150, requerido: true },
  { nombre: "fecha_nacimiento", etiqueta: "Fecha de nacimiento", tipo: "date", maximo: undefined, requerido: true },
  { nombre: "telefono", etiqueta: "Teléfono", tipo: "tel", maximo: 16, requerido: false },
  { nombre: "direccion", etiqueta: "Dirección", tipo: "text", maximo: 500, requerido: false },
  { nombre: "contacto_emergencia_nombre", etiqueta: "Nombre del contacto de emergencia", tipo: "text", maximo: 150, requerido: false },
  { nombre: "contacto_emergencia_telefono", etiqueta: "Teléfono de emergencia", tipo: "tel", maximo: 16, requerido: false },
] as const;

export default function PerfilPaciente() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [revision, setRevision] = useState(0);
  const [errorCarga, setErrorCarga] = useState("");
  const [errores, setErrores] = useState<string[]>([]);
  const [exito, setExito] = useState("");
  const [mostrarDesactivacion, setMostrarDesactivacion] = useState(false);

  useEffect(() => {
    let vigente = true;

    async function cargar() {
      setCargando(true);
      setErrorCarga("");

      try {
        const respuesta = await api.get<{ data: Perfil }>("/api/paciente/perfil");
        if (vigente) setPerfil(respuesta.data.data);
      } catch (error: unknown) {
        if (vigente) setErrorCarga(erroresPaciente(error).join(" "));
      } finally {
        if (vigente) setCargando(false);
      }
    }

    cargar();

    return () => {
      vigente = false;
    };
  }, [revision]);

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (ocupado) return;

    const datos = new FormData(evento.currentTarget);
    const cuerpo = Object.fromEntries(
      campos.map((campo) => [campo.nombre, datos.get(campo.nombre) || null])
    );

    setOcupado(true);
    setErrores([]);
    setExito("");

    try {
      await api.get("/sanctum/csrf-cookie");
      const respuesta = await api.put<{ message: string }>(
        "/api/paciente/perfil",
        cuerpo
      );

      setExito(respuesta.data.message);
      setRevision((valor) => valor + 1);
    } catch (error: unknown) {
      setErrores(erroresPaciente(error));
    } finally {
      setOcupado(false);
    }
  }

  async function desactivar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (ocupado) return;

    const formulario = evento.currentTarget;
    const datos = new FormData(formulario);

    setOcupado(true);
    setErrores([]);
    setExito("");

    try {
      await api.get("/sanctum/csrf-cookie");
      await api.post("/api/paciente/desactivar", {
        contrasena: datos.get("contrasena"),
      });

      // Recarga completa para descartar el panel de la sesión anterior.
      window.location.replace("/");
    } catch (error: unknown) {
      setErrores(erroresPaciente(error));
      setOcupado(false);
    } finally {
      formulario.reset();
    }
  }

  const input =
    "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2";

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <Link href="/paciente" className="font-medium text-teal-700 underline">
          Volver a mi panel
        </Link>

        <h1 className="mt-4 text-3xl font-bold">Mi perfil</h1>

        {exito && (
          <p role="status" className="mt-5 rounded-lg bg-green-100 p-4 text-green-900">
            {exito}
          </p>
        )}

        {errores.length > 0 && (
          <ul role="alert" className="mt-5 list-inside list-disc rounded-lg bg-red-100 p-4 text-red-900">
            {errores.map((error, indice) => <li key={indice}>{error}</li>)}
          </ul>
        )}

        {cargando ? (
          <p className="mt-6">Cargando perfil…</p>
        ) : errorCarga ? (
          <div role="alert" className="mt-6">
            <p>{errorCarga}</p>
            <button
              type="button"
              onClick={() => setRevision((valor) => valor + 1)}
              className="mt-3 underline"
            >
              Reintentar
            </button>
          </div>
        ) : perfil && (
          <>
            <section className="mt-6 rounded-xl bg-white p-6 shadow-sm">
              <p className="text-sm text-slate-600">
                Correo de acceso: {perfil.correo}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                En esta pantalla puedes editar tus datos personales.
                El correo y la contraseña de acceso se conservan.
              </p>

              <form onSubmit={guardar} className="mt-5">
                <fieldset
                  disabled={ocupado || mostrarDesactivacion}
                  className="space-y-4"
                >
                  {campos.map((campo) => (
                    <label key={campo.nombre} className="block">
                      {campo.etiqueta}
                      <input
                        name={campo.nombre}
                        type={campo.tipo}
                        required={campo.requerido}
                        maxLength={campo.maximo}
                        defaultValue={perfil[campo.nombre] ?? ""}
                        placeholder={campo.tipo === "tel" ? "+50370000000" : undefined}
                        className={input}
                      />
                    </label>
                  ))}

                  <button
                    type="submit"
                    className="rounded-lg bg-teal-700 px-4 py-3 text-white disabled:opacity-40"
                  >
                    {ocupado ? "Guardando…" : "Guardar perfil"}
                  </button>
                </fieldset>
              </form>
            </section>

            <section className="mt-8 rounded-xl border border-red-200 bg-white p-6">
              <h2 className="text-xl font-semibold">Desactivar mi cuenta</h2>

              <p className="mt-3 text-sm text-slate-700">
                Se cerrará tu sesión y no podrás volver a iniciar sesión.
                Tus citas e historiales se conservarán. No podrás hacerlo
                si tienes citas pendientes o confirmadas.
              </p>

              <p className="mt-2 text-sm text-slate-700">
                Esta versión todavía no tiene una opción de reactivación
                para pacientes. Usa una cuenta de prueba si estás comprobando
                esta función.
              </p>

              {!mostrarDesactivacion ? (
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => {
                    setMostrarDesactivacion(true);
                    setErrores([]);
                    setExito("");
                  }}
                  className="mt-4 rounded-lg border border-red-300 px-4 py-2 text-red-700"
                >
                  Quiero desactivar mi cuenta
                </button>
              ) : (
                <form onSubmit={desactivar} className="mt-5 space-y-4">
                  <label className="block">
                    Confirma tu contraseña
                    <input
                      name="contrasena"
                      type="password"
                      required
                      maxLength={255}
                      autoComplete="current-password"
                      disabled={ocupado}
                      className={input}
                    />
                  </label>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="submit"
                      disabled={ocupado}
                      className="rounded-lg bg-red-700 px-4 py-2 text-white disabled:opacity-40"
                    >
                      {ocupado ? "Procesando…" : "Confirmar desactivación"}
                    </button>
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => setMostrarDesactivacion(false)}
                      className="rounded-lg border px-4 py-2"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
