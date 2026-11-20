"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import axios from "axios";
import { api } from "@/lib/api";
import { mensajeError } from "@/lib/auth";

type Especialidad = {
  id: number;
  nombre: string;
  descripcion: string | null;
  perfiles_asignados: number;
};

type RespuestaError = {
  message?: string;
  errors?: Record<string, string[]>;
};

function obtenerErrores(error: unknown): string[] {
  if (axios.isAxiosError<RespuestaError>(error)) {
    if (
      error.response?.status === 422 &&
      error.response.data.errors
    ) {
      return Object.values(error.response.data.errors).flat();
    }

    if (
      error.response?.status === 409 &&
      error.response.data.message
    ) {
      return [error.response.data.message];
    }

    if (error.response?.status === 404) {
      return [
        "La especialidad ya no está disponible. Actualiza el listado.",
      ];
    }
  }

  return [mensajeError(error)];
}

export default function GestionEspecialidades() {
  const seccionFormulario = useRef<HTMLElement>(null);

  const [especialidades, setEspecialidades] = useState<Especialidad[]>([]);
  const [editando, setEditando] = useState<Especialidad | null>(null);
  const [porEliminar, setPorEliminar] = useState<Especialidad | null>(null);

  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");

  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [revision, setRevision] = useState(0);

  const [errorCarga, setErrorCarga] = useState("");
  const [errores, setErrores] = useState<string[]>([]);
  const [exito, setExito] = useState("");

  useEffect(() => {
    let vigente = true;

    async function cargarEspecialidades() {
      setCargando(true);
      setErrorCarga("");

      try {
        const respuesta = await api.get<{ data: Especialidad[] }>(
          "/api/admin/especialidades"
        );

        if (vigente) {
          setEspecialidades(respuesta.data.data);
        }
      } catch (error: unknown) {
        if (vigente) {
          setErrorCarga(mensajeError(error));
        }
      } finally {
        if (vigente) {
          setCargando(false);
        }
      }
    }

    cargarEspecialidades();

    return () => {
      vigente = false;
    };
  }, [revision]);

  function limpiarFormulario() {
    setEditando(null);
    setNombre("");
    setDescripcion("");
  }

  function nuevaEspecialidad() {
    if (ocupado) return;

    limpiarFormulario();
    setPorEliminar(null);
    setErrores([]);
    setExito("");

    seccionFormulario.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function editarEspecialidad(especialidad: Especialidad) {
    if (ocupado) return;

    setEditando(especialidad);
    setNombre(especialidad.nombre);
    setDescripcion(especialidad.descripcion ?? "");
    setPorEliminar(null);
    setErrores([]);
    setExito("");

    seccionFormulario.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function solicitarEliminacion(especialidad: Especialidad) {
    if (ocupado) return;

    setPorEliminar(especialidad);
    setErrores([]);
    setExito("");
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    if (ocupado) return;

    setOcupado(true);
    setErrores([]);
    setExito("");

    try {
      await api.get("/sanctum/csrf-cookie");

      const datos = {
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
      };

      const respuesta = editando
        ? await api.put<{ message: string }>(
            `/api/admin/especialidades/${editando.id}`,
            datos
          )
        : await api.post<{ message: string }>(
            "/api/admin/especialidades",
            datos
          );

      setExito(respuesta.data.message);
      limpiarFormulario();
      setRevision((valor) => valor + 1);
    } catch (error: unknown) {
      setErrores(obtenerErrores(error));
    } finally {
      setOcupado(false);
    }
  }

  async function eliminarEspecialidad() {
    if (!porEliminar || ocupado) return;

    setOcupado(true);
    setErrores([]);
    setExito("");

    try {
      await api.get("/sanctum/csrf-cookie");

      const respuesta = await api.delete<{ message: string }>(
        `/api/admin/especialidades/${porEliminar.id}`
      );

      if (editando?.id === porEliminar.id) {
        limpiarFormulario();
      }

      setPorEliminar(null);
      setExito(respuesta.data.message);
      setRevision((valor) => valor + 1);
    } catch (error: unknown) {
      setErrores(obtenerErrores(error));
    } finally {
      setOcupado(false);
    }
  }

  const claseInput =
    "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-600";

  const claseBoton =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-40";

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/admin"
          className="font-medium text-teal-700 underline"
        >
          Volver al panel
        </Link>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Especialidades</h1>
            <p className="mt-2 text-slate-600">
              Administra las especialidades disponibles para los médicos.
            </p>
          </div>

          <button
            type="button"
            disabled={ocupado}
            onClick={nuevaEspecialidad}
            className="rounded-lg bg-teal-700 px-4 py-3 font-medium text-white hover:bg-teal-800 disabled:opacity-40"
          >
            Nueva especialidad
          </button>
        </div>

        {exito && (
          <p
            role="status"
            className="mt-6 rounded-lg bg-green-100 p-4 text-green-900"
          >
            {exito}
          </p>
        )}

        {errores.length > 0 && (
          <ul
            role="alert"
            className="mt-6 list-inside list-disc rounded-lg bg-red-100 p-4 text-red-900"
          >
            {errores.map((error, indice) => (
              <li key={indice}>{error}</li>
            ))}
          </ul>
        )}

        {errorCarga && (
          <div
            role="alert"
            className="mt-6 rounded-lg bg-red-100 p-4 text-red-900"
          >
            <p>{errorCarga}</p>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => setRevision((valor) => valor + 1)}
              className="mt-2 underline"
            >
              Reintentar carga
            </button>
          </div>
        )}

        {porEliminar && (
          <section
            aria-label="Confirmar eliminación"
            className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-5"
          >
            <h2 className="font-semibold">Eliminar especialidad</h2>

            <p className="mt-2">
              ¿Deseas eliminar{" "}
              <strong>{porEliminar.nombre}</strong>?
            </p>

            <p className="mt-2 text-sm">
              Se eliminará de la base de datos si no tiene perfiles
              médicos asignados. Esta acción no se puede deshacer
              desde esta pantalla.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={ocupado}
                onClick={eliminarEspecialidad}
                className="rounded-lg bg-red-700 px-4 py-2 text-white hover:bg-red-800 disabled:opacity-40"
              >
                {ocupado ? "Procesando…" : "Confirmar eliminación"}
              </button>

              <button
                type="button"
                disabled={ocupado}
                onClick={() => {
                  setPorEliminar(null);
                  setErrores([]);
                }}
                className={claseBoton}
              >
                Cancelar
              </button>
            </div>
          </section>
        )}

        <section
          ref={seccionFormulario}
          className="mt-8 scroll-mt-5 rounded-xl bg-white p-6 shadow-sm"
        >
          <h2 className="text-xl font-semibold">
            {editando ? "Editar especialidad" : "Agregar especialidad"}
          </h2>

          <form onSubmit={guardar} className="mt-5">
            <fieldset
              disabled={ocupado || porEliminar !== null}
              className="space-y-5"
            >
              <div>
                <label
                  htmlFor="nombre"
                  className="text-sm font-medium"
                >
                  Nombre
                </label>
                <input
                  id="nombre"
                  name="nombre"
                  type="text"
                  required
                  maxLength={100}
                  value={nombre}
                  onChange={(evento) => setNombre(evento.target.value)}
                  className={claseInput}
                />
              </div>

              <div>
                <label
                  htmlFor="descripcion"
                  className="text-sm font-medium"
                >
                  Descripción — opcional
                </label>
                <textarea
                  id="descripcion"
                  name="descripcion"
                  rows={3}
                  maxLength={500}
                  value={descripcion}
                  onChange={(evento) =>
                    setDescripcion(evento.target.value)
                  }
                  className={claseInput}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Máximo 500 caracteres.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  className="rounded-lg bg-teal-700 px-5 py-3 font-medium text-white hover:bg-teal-800 disabled:opacity-40"
                >
                  {ocupado
                    ? "Guardando…"
                    : editando
                      ? "Guardar cambios"
                      : "Crear especialidad"}
                </button>

                {editando && (
                  <button
                    type="button"
                    onClick={nuevaEspecialidad}
                    className={claseBoton}
                  >
                    Cancelar edición
                  </button>
                )}
              </div>
            </fieldset>
          </form>
        </section>

        <section className="mt-8 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">
            Especialidades registradas
          </h2>

          <p className="mt-2 text-sm text-slate-600">
            Los perfiles asignados incluyen cuentas activas,
            inactivas y eliminadas.
          </p>

          {cargando ? (
            <p role="status" className="mt-5">
              Cargando especialidades…
            </p>
          ) : errorCarga ? (
            <p className="mt-5 text-slate-600">
              No se pudo actualizar el listado. Pulsa Reintentar carga.
            </p>
          ) : especialidades.length === 0 ? (
            <p className="mt-5 text-slate-600">
              No hay especialidades registradas.
            </p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="p-3">Nombre</th>
                    <th className="p-3">Descripción</th>
                    <th className="p-3">Perfiles asignados</th>
                    <th className="p-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {especialidades.map((especialidad) => (
                    <tr key={especialidad.id} className="border-b">
                      <td className="p-3 font-medium">
                        {especialidad.nombre}
                      </td>

                      <td className="max-w-sm whitespace-pre-wrap break-words p-3 text-slate-600">
                        {especialidad.descripcion || "Sin descripción"}
                      </td>

                      <td className="p-3">
                        {especialidad.perfiles_asignados}
                      </td>

                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={ocupado}
                            onClick={() =>
                              editarEspecialidad(especialidad)
                            }
                            className={claseBoton}
                          >
                            Editar
                          </button>

                          <button
                            type="button"
                            disabled={ocupado}
                            onClick={() =>
                              solicitarEliminacion(especialidad)
                            }
                            className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="mt-4 text-sm text-slate-600">
                Total: {especialidades.length} especialidades.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
