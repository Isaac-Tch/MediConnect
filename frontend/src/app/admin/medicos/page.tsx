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
};

type Medico = {
  id: number;
  nombre: string;
  correo: string;
  activo: boolean;
  especialidad_id: number;
  especialidad: string;
  numero_licencia: string;
  biografia: string | null;
  tarifa_consulta: string;
  moneda: string;
};

type ListaMedicos = {
  data: Medico[];
  current_page: number;
  last_page: number;
  total: number;
};

type ErrorValidacion = {
  errors?: Record<string, string[]>;
};

type Modo = "crear" | "editar" | "activar";

type Confirmacion = {
  tipo: "desactivar" | "eliminar";
  medico: Medico;
};

const camposPerfil = [
  {
    nombre: "nombre",
    etiqueta: "Nombre completo",
    tipo: "text",
    maximo: 150,
  },
  {
    nombre: "correo",
    etiqueta: "Correo electrónico",
    tipo: "email",
    maximo: 254,
  },
  {
    nombre: "numero_licencia",
    etiqueta: "Número de licencia",
    tipo: "text",
    maximo: 50,
  },
] as const;

function obtenerErrores(error: unknown): string[] {
  if (
    axios.isAxiosError<ErrorValidacion>(error) &&
    error.response?.status === 422 &&
    error.response.data.errors
  ) {
    return Object.values(error.response.data.errors).flat();
  }

  return [mensajeError(error)];
}

export default function GestionMedicos() {
  const seccionFormulario = useRef<HTMLElement>(null);

  const [especialidades, setEspecialidades] = useState<Especialidad[]>([]);
  const [lista, setLista] = useState<ListaMedicos | null>(null);
  const [pagina, setPagina] = useState(1);
  const [revision, setRevision] = useState(0);

  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [errorCarga, setErrorCarga] = useState("");
  const [errores, setErrores] = useState<string[]>([]);
  const [exito, setExito] = useState("");

  const [modo, setModo] = useState<Modo>("crear");
  const [seleccionado, setSeleccionado] = useState<Medico | null>(null);
  const [versionFormulario, setVersionFormulario] = useState(0);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);

  useEffect(() => {
    let vigente = true;

    async function cargarDatos() {
      setCargando(true);
      setErrorCarga("");

      try {
        const [respuestaMedicos, respuestaEspecialidades] =
          await Promise.all([
            api.get<ListaMedicos>("/api/admin/medicos", {
              params: { page: pagina },
            }),
            api.get<{ data: Especialidad[] }>(
              "/api/admin/especialidades"
            ),
          ]);

        if (vigente) {
          setLista(respuestaMedicos.data);
          setEspecialidades(respuestaEspecialidades.data.data);
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

    cargarDatos();

    return () => {
      vigente = false;
    };
  }, [pagina, revision]);

  function limpiarFormulario() {
    setModo("crear");
    setSeleccionado(null);
    setVersionFormulario((valor) => valor + 1);
  }

  function prepararFormulario(nuevoModo: Modo, medico: Medico | null) {
    if (ocupado) return;

    setModo(nuevoModo);
    setSeleccionado(medico);
    setConfirmacion(null);
    setErrores([]);
    setExito("");
    setVersionFormulario((valor) => valor + 1);

    seccionFormulario.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function solicitarConfirmacion(
    tipo: "desactivar" | "eliminar",
    medico: Medico
  ) {
    if (ocupado) return;

    setErrores([]);
    setExito("");
    setConfirmacion({ tipo, medico });
  }

  function refrescarLista() {
    setPagina(1);
    setRevision((valor) => valor + 1);
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    if (ocupado) return;
    if (modo !== "crear" && !seleccionado) return;

    const formulario = evento.currentTarget;
    const datos = new FormData(formulario);

    setOcupado(true);
    setErrores([]);
    setExito("");

    try {
      await api.get("/sanctum/csrf-cookie");

      let mensaje = "";

      if (modo === "activar" && seleccionado) {
        const respuesta = await api.patch<{ message: string }>(
          `/api/admin/medicos/${seleccionado.id}/estado`,
          {
            activo: true,
            contrasena: datos.get("contrasena"),
            contrasena_confirmation: datos.get(
              "contrasena_confirmation"
            ),
          }
        );

        mensaje = respuesta.data.message;
      } else {
        const perfil = {
          nombre: datos.get("nombre"),
          correo: datos.get("correo"),
          numero_licencia: datos.get("numero_licencia"),
          especialidad_id: Number(datos.get("especialidad_id")),
          tarifa_consulta: datos.get("tarifa_consulta"),
          biografia: datos.get("biografia") || null,
        };

        if (modo === "editar" && seleccionado) {
          const respuesta = await api.put<{ message: string }>(
            `/api/admin/medicos/${seleccionado.id}`,
            perfil
          );

          mensaje = respuesta.data.message;
        } else {
          const respuesta = await api.post<{ message: string }>(
            "/api/admin/medicos",
            {
              ...perfil,
              contrasena: datos.get("contrasena"),
              contrasena_confirmation: datos.get(
                "contrasena_confirmation"
              ),
            }
          );

          mensaje = respuesta.data.message;
        }
      }

      formulario.reset();
      limpiarFormulario();
      setExito(mensaje);
      refrescarLista();
    } catch (error: unknown) {
      setErrores(obtenerErrores(error));
    } finally {
      setOcupado(false);
    }
  }

  async function ejecutarConfirmacion() {
    if (!confirmacion || ocupado) return;

    setOcupado(true);
    setErrores([]);
    setExito("");

    try {
      await api.get("/sanctum/csrf-cookie");

      const ruta = `/api/admin/medicos/${confirmacion.medico.id}`;

      const respuesta =
        confirmacion.tipo === "eliminar"
          ? await api.delete<{ message: string }>(ruta)
          : await api.patch<{ message: string }>(`${ruta}/estado`, {
              activo: false,
            });

      setExito(respuesta.data.message);
      setConfirmacion(null);
      limpiarFormulario();
      refrescarLista();
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

  const tituloFormulario =
    modo === "crear"
      ? "Agregar médico"
      : modo === "editar"
        ? `Editar a ${seleccionado?.nombre}`
        : `Activar a ${seleccionado?.nombre}`;

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/admin"
          className="font-medium text-teal-700 underline"
        >
          Volver al panel
        </Link>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Personal médico</h1>
            <p className="mt-2 text-slate-600">
              Crea, consulta y edita los perfiles del personal médico.
            </p>
          </div>

          <button
            type="button"
            disabled={ocupado}
            onClick={() => prepararFormulario("crear", null)}
            className="rounded-lg bg-teal-700 px-4 py-3 font-medium text-white disabled:opacity-40"
          >
            Nuevo médico
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

        {confirmacion && (
          <section
            aria-label="Confirmar acción"
            className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-5"
          >
            <h2 className="font-semibold">
              {confirmacion.tipo === "eliminar"
                ? "Eliminar cuenta médica"
                : "Desactivar cuenta médica"}
            </h2>

            <p className="mt-2">
              Médico: <strong>{confirmacion.medico.nombre}</strong>
            </p>

            <p className="mt-2 text-sm">
              {confirmacion.tipo === "eliminar"
                ? "Dejará de aparecer en este listado y no podrá iniciar sesión. Sus citas e historiales se conservarán. No hay una opción de restauración en esta pantalla."
                : "No podrá acceder a su cuenta mientras esté inactiva. Podrás reactivarla desde este listado."}
            </p>

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                disabled={ocupado}
                onClick={ejecutarConfirmacion}
                className="rounded-lg bg-red-700 px-4 py-2 text-white disabled:opacity-40"
              >
                {ocupado ? "Procesando…" : "Confirmar"}
              </button>

              <button
                type="button"
                disabled={ocupado}
                onClick={() => setConfirmacion(null)}
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
            {tituloFormulario}
          </h2>

          <p className="mt-2 text-sm text-slate-600">
            {modo === "crear"
              ? "La cuenta se creará activa y con rol médico."
              : modo === "editar"
                ? "Editar el perfil conserva la contraseña y el estado actual."
                : "Para activar la cuenta debes asignar una contraseña nueva."}
          </p>

          <form
            key={`${modo}-${seleccionado?.id ?? "nuevo"}-${versionFormulario}`}
            onSubmit={guardar}
            className="mt-6"
          >
            <fieldset
              disabled={ocupado || confirmacion !== null}
              className="grid gap-5 md:grid-cols-2"
            >
              {modo !== "activar" && (
                <>
                  {camposPerfil.map((campo) => (
                    <div key={campo.nombre}>
                      <label
                        htmlFor={campo.nombre}
                        className="text-sm font-medium"
                      >
                        {campo.etiqueta}
                      </label>
                      <input
                        id={campo.nombre}
                        name={campo.nombre}
                        type={campo.tipo}
                        required
                        maxLength={campo.maximo}
                        autoComplete="off"
                        defaultValue={
                          seleccionado?.[campo.nombre] ?? ""
                        }
                        className={claseInput}
                      />
                    </div>
                  ))}

                  <div>
                    <label
                      htmlFor="especialidad_id"
                      className="text-sm font-medium"
                    >
                      Especialidad
                    </label>
                    <select
                      id="especialidad_id"
                      name="especialidad_id"
                      required
                      defaultValue={
                        seleccionado?.especialidad_id ?? ""
                      }
                      className={claseInput}
                    >
                      <option value="" disabled>
                        Selecciona una especialidad
                      </option>
                      {especialidades.map((especialidad) => (
                        <option
                          key={especialidad.id}
                          value={especialidad.id}
                        >
                          {especialidad.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="tarifa_consulta"
                      className="text-sm font-medium"
                    >
                      Tarifa de consulta en USD
                    </label>
                    <input
                      id="tarifa_consulta"
                      name="tarifa_consulta"
                      type="number"
                      min="0"
                      max="99999999.99"
                      step="0.01"
                      required
                      defaultValue={
                        seleccionado?.tarifa_consulta ?? ""
                      }
                      className={claseInput}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label
                      htmlFor="biografia"
                      className="text-sm font-medium"
                    >
                      Biografía profesional — opcional
                    </label>
                    <textarea
                      id="biografia"
                      name="biografia"
                      rows={3}
                      maxLength={5000}
                      defaultValue={seleccionado?.biografia ?? ""}
                      className={claseInput}
                    />
                  </div>
                </>
              )}

              {modo !== "editar" && (
                <>
                  <div>
                    <label
                      htmlFor="contrasena"
                      className="text-sm font-medium"
                    >
                      {modo === "crear"
                        ? "Contraseña inicial"
                        : "Contraseña nueva"}
                    </label>
                    <input
                      id="contrasena"
                      name="contrasena"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={12}
                      maxLength={64}
                      className={claseInput}
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Entre 12 y 64 caracteres.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="contrasena_confirmation"
                      className="text-sm font-medium"
                    >
                      Repite la contraseña
                    </label>
                    <input
                      id="contrasena_confirmation"
                      name="contrasena_confirmation"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={12}
                      maxLength={64}
                      className={claseInput}
                    />
                  </div>
                </>
              )}

              <div className="flex flex-wrap gap-3 md:col-span-2">
                <button
                  type="submit"
                  disabled={
                    ocupado ||
                    (modo !== "activar" && especialidades.length === 0)
                  }
                  className="rounded-lg bg-teal-700 px-5 py-3 font-medium text-white hover:bg-teal-800 disabled:opacity-40"
                >
                  {ocupado
                    ? "Guardando…"
                    : modo === "crear"
                      ? "Crear cuenta médica"
                      : modo === "editar"
                        ? "Guardar cambios"
                        : "Activar cuenta"}
                </button>

                {modo !== "crear" && (
                  <button
                    type="button"
                    onClick={() => prepararFormulario("crear", null)}
                    className={claseBoton}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </fieldset>
          </form>
        </section>

        <section className="mt-8 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">
            Médicos registrados
          </h2>

          {cargando ? (
            <p role="status" className="mt-4">
              Cargando médicos…
            </p>
          ) : errorCarga ? (
            <p className="mt-4 text-slate-600">
              No se pudo actualizar el listado. Pulsa Reintentar carga.
            </p>
          ) : lista && lista.data.length > 0 ? (
            <>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-slate-50">
                    <tr>
                      <th className="p-3">Médico</th>
                      <th className="p-3">Especialidad</th>
                      <th className="p-3">Licencia</th>
                      <th className="p-3">Tarifa</th>
                      <th className="p-3">Estado</th>
                      <th className="p-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.data.map((medico) => (
                      <tr key={medico.id} className="border-b">
                        <td className="p-3">
                          <p className="font-medium">{medico.nombre}</p>
                          <p className="text-slate-600">
                            {medico.correo}
                          </p>
                        </td>
                        <td className="p-3">{medico.especialidad}</td>
                        <td className="p-3">
                          {medico.numero_licencia}
                        </td>
                        <td className="whitespace-nowrap p-3">
                          {medico.tarifa_consulta} {medico.moneda}
                        </td>
                        <td className="p-3">
                          <span
                            className={
                              medico.activo
                                ? "font-medium text-green-700"
                                : "font-medium text-slate-500"
                            }
                          >
                            {medico.activo ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex min-w-60 flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={ocupado}
                              onClick={() =>
                                prepararFormulario("editar", medico)
                              }
                              className={claseBoton}
                            >
                              Editar
                            </button>

                            <button
                              type="button"
                              disabled={ocupado}
                              onClick={() =>
                                medico.activo
                                  ? solicitarConfirmacion(
                                      "desactivar",
                                      medico
                                    )
                                  : prepararFormulario(
                                      "activar",
                                      medico
                                    )
                              }
                              className={claseBoton}
                            >
                              {medico.activo ? "Desactivar" : "Activar"}
                            </button>

                            <button
                              type="button"
                              disabled={ocupado}
                              onClick={() =>
                                solicitarConfirmacion("eliminar", medico)
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
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                <p className="text-sm text-slate-600">
                  Página {lista.current_page} de {lista.last_page}.
                  Total: {lista.total} médicos.
                </p>

                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={ocupado || pagina <= 1}
                    onClick={() => setPagina((valor) => valor - 1)}
                    className={claseBoton}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    disabled={ocupado || pagina >= lista.last_page}
                    onClick={() => setPagina((valor) => valor + 1)}
                    className={claseBoton}
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="mt-4 text-slate-600">
              No hay médicos registrados en este listado.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
