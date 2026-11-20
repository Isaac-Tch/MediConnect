"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { erroresPaciente } from "@/lib/erroresPaciente";

type Historial = {
  id: number;
  sintomas: string;
  diagnostico: string;
  plan_tratamiento: string | null;
  observaciones: string | null;
  registrado_en: string;
  firmado_en: string | null;
};

type Consulta = {
  cita_id: number;
  inicia_en: string;
  estado: string;
  motivo: string;
  medico: string;
  paciente: string;
  puede_registrar: boolean;
  historial: Historial | null;
};

type Resultado = {
  data: Consulta[];
  current_page: number;
  last_page: number;
  total: number;
};

type Props = {
  modo: "medico" | "paciente";
};

const campos = [
  {
    nombre: "sintomas",
    etiqueta: "Síntomas",
    obligatorio: true,
  },
  {
    nombre: "diagnostico",
    etiqueta: "Diagnóstico",
    obligatorio: true,
  },
  {
    nombre: "plan_tratamiento",
    etiqueta: "Plan de tratamiento",
    obligatorio: false,
  },
  {
    nombre: "observaciones",
    etiqueta: "Observaciones",
    obligatorio: false,
  },
] as const;

export default function HistorialPanel({ modo }: Props) {
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [pagina, setPagina] = useState(1);
  const [revision, setRevision] = useState(0);
  const [seleccionada, setSeleccionada] = useState<Consulta | null>(null);

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [errorCarga, setErrorCarga] = useState("");
  const [errores, setErrores] = useState<string[]>([]);
  const [exito, setExito] = useState("");

  const esMedico = modo === "medico";

  useEffect(() => {
    let vigente = true;

    async function cargar() {
      setCargando(true);
      setErrorCarga("");

      try {
        const respuesta = await api.get<Resultado>(
          `/api/${modo}/historiales`,
          {
            params: { page: pagina },
          }
        );

        if (vigente) {
          setResultado(respuesta.data);
        }
      } catch (error: unknown) {
        if (vigente) {
          setErrorCarga(erroresPaciente(error).join(" "));
        }
      } finally {
        if (vigente) {
          setCargando(false);
        }
      }
    }

    cargar();

    return () => {
      vigente = false;
    };
  }, [modo, pagina, revision]);

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    if (!seleccionada || guardando || !esMedico) return;

    const datos = new FormData(evento.currentTarget);

    setGuardando(true);
    setErrores([]);
    setExito("");

    try {
      await api.get("/sanctum/csrf-cookie");

      const respuesta = await api.post<{ message: string }>(
        `/api/medico/citas/${seleccionada.cita_id}/historial`,
        {
          sintomas: datos.get("sintomas"),
          diagnostico: datos.get("diagnostico"),
          plan_tratamiento: datos.get("plan_tratamiento") || null,
          observaciones: datos.get("observaciones") || null,
          confirmacion: datos.get("confirmacion") === "on",
        }
      );

      setExito(respuesta.data.message);
      setSeleccionada(null);
      setRevision((valor) => valor + 1);
    } catch (error: unknown) {
      setErrores(erroresPaciente(error));
    } finally {
      setGuardando(false);
    }
  }

  const boton =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-40";

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <Link
          href={esMedico ? "/medico" : "/paciente"}
          className="font-medium text-teal-700 underline"
        >
          Volver a mi panel
        </Link>

        <h1 className="mt-4 text-3xl font-bold">
          {esMedico ? "Atención e historiales" : "Mi historial clínico"}
        </h1>

        <p className="mt-3 text-slate-600">
          {esMedico
            ? "Consulta y registra la atención de tus citas confirmadas o completadas."
            : "Consulta los registros finalizados por los médicos que te atendieron."}
        </p>

        <p className="mt-1 text-sm text-slate-500">
          Las fechas se muestran en hora de El Salvador.
        </p>

        <button
          type="button"
          disabled={guardando || cargando}
          onClick={() => setRevision((valor) => valor + 1)}
          className={`${boton} mt-4`}
        >
          Actualizar listado
        </button>

        {exito && (
          <p
            role="status"
            className="mt-5 rounded-lg bg-green-100 p-4 text-green-900"
          >
            {exito}
          </p>
        )}

        {errores.length > 0 && (
          <ul
            role="alert"
            className="mt-5 list-inside list-disc rounded-lg bg-red-100 p-4 text-red-900"
          >
            {errores.map((error, indice) => (
              <li key={indice}>{error}</li>
            ))}
          </ul>
        )}

        {seleccionada && esMedico && (
          <section className="mt-6 rounded-xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">
              Registrar atención de {seleccionada.paciente}
            </h2>

            <p className="mt-2 text-sm text-slate-600">
              Cita #{seleccionada.cita_id} —{" "}
              {seleccionada.inicia_en.slice(0, 16)}
            </p>

            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm">
              Al guardar, la cita quedará completada y el paciente podrá
              consultar todos los campos de esta nota. Revisa el contenido:
              esta pantalla no permite sobrescribir una atención finalizada.
            </p>

            <form
              key={seleccionada.cita_id}
              onSubmit={guardar}
              className="mt-5"
            >
              <fieldset disabled={guardando} className="space-y-5">
                {campos.map((campo) => (
                  <label key={campo.nombre} className="block">
                    <span className="font-medium">
                      {campo.etiqueta}
                      {!campo.obligatorio && " — opcional"}
                    </span>
                    <textarea
                      name={campo.nombre}
                      required={campo.obligatorio}
                      rows={4}
                      maxLength={10000}
                      className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </label>
                ))}

                <label className="flex items-start gap-3 text-sm">
                  <input
                    name="confirmacion"
                    type="checkbox"
                    required
                    className="mt-1"
                  />
                  <span>
                    He revisado la información y deseo finalizar esta
                    atención.
                  </span>
                </label>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    className="rounded-lg bg-teal-700 px-4 py-3 text-white disabled:opacity-40"
                  >
                    {guardando ? "Guardando…" : "Finalizar atención"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSeleccionada(null);
                      setErrores([]);
                    }}
                    className={boton}
                  >
                    Cancelar
                  </button>
                </div>
              </fieldset>
            </form>
          </section>
        )}

        {cargando ? (
          <p role="status" className="mt-6">
            Cargando registros…
          </p>
        ) : errorCarga ? (
          <p
            role="alert"
            className="mt-6 rounded-lg bg-red-100 p-4 text-red-900"
          >
            {errorCarga}
          </p>
        ) : resultado && resultado.data.length > 0 ? (
          <>
            <div className="mt-6 space-y-5">
              {resultado.data.map((consulta) => (
                <article
                  key={consulta.cita_id}
                  className="rounded-xl bg-white p-6 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">
                        {esMedico
                          ? consulta.paciente
                          : consulta.medico}
                      </h2>
                      <p className="mt-1 text-sm text-slate-600">
                        Cita #{consulta.cita_id} —{" "}
                        {consulta.inicia_en.slice(0, 16)}
                      </p>
                    </div>

                    <span className="text-sm capitalize">
                      {consulta.estado.replaceAll("_", " ")}
                    </span>
                  </div>

                  <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
                    Motivo de consulta: {consulta.motivo}
                  </p>

                  {consulta.historial ? (
                    <details className="mt-5 rounded-lg border border-slate-200 p-4">
                      <summary className="cursor-pointer font-medium text-teal-700">
                        Ver registro clínico
                      </summary>

                      <dl className="mt-4 space-y-4">
                        {campos.map((campo) => (
                          <div key={campo.nombre}>
                            <dt className="font-semibold">
                              {campo.etiqueta}
                            </dt>
                            <dd className="mt-1 whitespace-pre-wrap break-words text-slate-700">
                              {consulta.historial?.[campo.nombre] ||
                                "No registrado"}
                            </dd>
                          </div>
                        ))}
                      </dl>

                      <p className="mt-5 text-xs text-slate-500">
                        Registrado: {consulta.historial.registrado_en}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {consulta.historial.firmado_en
                          ? `Finalizado: ${consulta.historial.firmado_en}`
                          : "Este registro anterior no tiene fecha de finalización."}
                      </p>
                    </details>
                  ) : esMedico && consulta.puede_registrar ? (
                    <button
                      type="button"
                      disabled={guardando}
                      onClick={() => {
                        setSeleccionada(consulta);
                        setErrores([]);
                        setExito("");
                        window.scrollTo({
                          top: 0,
                          behavior: "smooth",
                        });
                      }}
                      className="mt-4 rounded-lg bg-teal-700 px-4 py-2 text-white disabled:opacity-40"
                    >
                      Registrar atención
                    </button>
                  ) : (
                    <p className="mt-4 text-sm text-slate-500">
                      La atención podrá registrarse cuando llegue la hora
                      de la cita.
                    </p>
                  )}
                </article>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600">
                Página {resultado.current_page} de {resultado.last_page}.
                Total: {resultado.total} registros.
              </p>

              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={guardando || pagina <= 1}
                  onClick={() => {
                    setSeleccionada(null);
                    setPagina((valor) => valor - 1);
                  }}
                  className={boton}
                >
                  Anterior
                </button>

                <button
                  type="button"
                  disabled={guardando || pagina >= resultado.last_page}
                  onClick={() => {
                    setSeleccionada(null);
                    setPagina((valor) => valor + 1);
                  }}
                  className={boton}
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        ) : (
          <p className="mt-6 rounded-xl bg-white p-6 text-slate-600">
            {esMedico
              ? "No tienes citas confirmadas o completadas para mostrar."
              : "Todavía no tienes registros clínicos finalizados."}
          </p>
        )}
      </div>
    </main>
  );
}
