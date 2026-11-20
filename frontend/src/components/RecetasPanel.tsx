"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { erroresPaciente } from "@/lib/erroresPaciente";

type Medicamento = {
  medicamento: string;
  dosis: string;
  frecuencia: string;
  duracion_dias: string | number;
  via_administracion: string;
  cantidad: string | number;
  indicaciones: string | null;
};

type Receta = {
  id: number;
  numero_receta: string;
  emitida_en: string;
  vence_en: string | null;
  estado: string;
  vencida: boolean;
  indicaciones: string | null;
  cita_id: number;
  medico: string;
  paciente: string;
  medicamentos: Medicamento[];
};

type Atencion = {
  id: number;
  cita_id: number;
  inicia_en: string;
  paciente: string;
};

type Pagina<T> = {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
};

type Props = {
  modo: "medico" | "paciente";
};

const campos = [
  { nombre: "medicamento", etiqueta: "Medicamento", tipo: "text", maximo: 200 },
  { nombre: "dosis", etiqueta: "Dosis", tipo: "text", maximo: 100 },
  { nombre: "frecuencia", etiqueta: "Frecuencia", tipo: "text", maximo: 150 },
  { nombre: "duracion_dias", etiqueta: "Duración en días", tipo: "number", maximo: undefined },
  { nombre: "via_administracion", etiqueta: "Vía de administración", tipo: "text", maximo: 100 },
  { nombre: "cantidad", etiqueta: "Cantidad total", tipo: "number", maximo: undefined },
] as const;

function medicamentoVacio(): Medicamento {
  return {
    medicamento: "",
    dosis: "",
    frecuencia: "",
    duracion_dias: "",
    via_administracion: "",
    cantidad: "",
    indicaciones: "",
  };
}

export default function RecetasPanel({ modo }: Props) {
  const esMedico = modo === "medico";

  const [recetas, setRecetas] = useState<Pagina<Receta> | null>(null);
  const [pagina, setPagina] = useState(1);

  const [atenciones, setAtenciones] = useState<Pagina<Atencion> | null>(null);
  const [paginaAtenciones, setPaginaAtenciones] = useState(1);
  const [atencion, setAtencion] = useState<Atencion | null>(null);

  const [medicamentos, setMedicamentos] = useState<Medicamento[]>([
    medicamentoVacio(),
  ]);
  const [indicaciones, setIndicaciones] = useState("");
  const [venceFecha, setVenceFecha] = useState("");
  const [confirmacion, setConfirmacion] = useState(false);

  const [porAnular, setPorAnular] = useState<Receta | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");

  const [revision, setRevision] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [errorCarga, setErrorCarga] = useState("");
  const [errores, setErrores] = useState<string[]>([]);
  const [exito, setExito] = useState("");

  useEffect(() => {
    let vigente = true;

    async function cargar() {
      setCargando(true);
      setErrorCarga("");

      try {
        const tareas = [
          api.get<Pagina<Receta>>(`/api/${modo}/recetas`, {
            params: { page: pagina },
          }),
        ];

        const respuestaRecetas = await tareas[0];

        let respuestaAtenciones: Pagina<Atencion> | null = null;

        if (esMedico) {
          const respuesta = await api.get<Pagina<Atencion>>(
            "/api/medico/recetas/atenciones",
            { params: { page: paginaAtenciones } }
          );
          respuestaAtenciones = respuesta.data;
        }

        if (vigente) {
          setRecetas(respuestaRecetas.data);
          setAtenciones(respuestaAtenciones);
        }
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
  }, [modo, esMedico, pagina, paginaAtenciones, revision]);

  function elegirAtencion(item: Atencion) {
    setAtencion(item);
    setMedicamentos([medicamentoVacio()]);
    setIndicaciones("");
    setVenceFecha("");
    setConfirmacion(false);
    setErrores([]);
    setExito("");
    setPorAnular(null);
  }

  function cambiarMedicamento(
    indice: number,
    campo: keyof Medicamento,
    valor: string
  ) {
    setMedicamentos((anteriores) =>
      anteriores.map((item, posicion) =>
        posicion === indice ? { ...item, [campo]: valor } : item
      )
    );
  }

  async function emitir(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!atencion || ocupado) return;

    setOcupado(true);
    setErrores([]);
    setExito("");

    try {
      await api.get("/sanctum/csrf-cookie");

      const respuesta = await api.post<{ message: string }>(
        "/api/medico/recetas",
        {
          historial_clinico_id: atencion.id,
          vence_fecha: venceFecha || null,
          indicaciones: indicaciones.trim() || null,
          confirmacion,
          medicamentos: medicamentos.map((item) => ({
            medicamento: item.medicamento.trim(),
            dosis: item.dosis.trim(),
            frecuencia: item.frecuencia.trim(),
            duracion_dias: Number(item.duracion_dias),
            via_administracion: item.via_administracion.trim(),
            cantidad: item.cantidad,
            indicaciones: item.indicaciones?.trim() || null,
          })),
        }
      );

      setExito(respuesta.data.message);
      setAtencion(null);
      setMedicamentos([medicamentoVacio()]);
      setPagina(1);
      setPaginaAtenciones(1);
      setRevision((valor) => valor + 1);
    } catch (error: unknown) {
      setErrores(erroresPaciente(error));
    } finally {
      setOcupado(false);
    }
  }

  async function anular(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!porAnular || ocupado) return;

    setOcupado(true);
    setErrores([]);
    setExito("");

    try {
      await api.get("/sanctum/csrf-cookie");

      const respuesta = await api.patch<{ message: string }>(
        `/api/medico/recetas/${porAnular.id}/anular`,
        { motivo: motivoAnulacion.trim() }
      );

      setExito(respuesta.data.message);
      setPorAnular(null);
      setMotivoAnulacion("");
      setPaginaAtenciones(1);
      setRevision((valor) => valor + 1);
    } catch (error: unknown) {
      setErrores(erroresPaciente(error));
    } finally {
      setOcupado(false);
    }
  }

  const boton =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-40";

  const input =
    "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2";

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <Link
          href={esMedico ? "/medico" : "/paciente"}
          className="font-medium text-teal-700 underline"
        >
          Volver a mi panel
        </Link>

        <h1 className="mt-4 text-3xl font-bold">
          {esMedico ? "Recetas médicas" : "Mis recetas"}
        </h1>

        <p className="mt-2 text-slate-600">
          {esMedico
            ? "Emite recetas desde atenciones finalizadas y consulta las anteriores."
            : "Consulta las recetas que tus médicos han emitido para ti."}
        </p>

        <button
          type="button"
          disabled={ocupado || cargando}
          onClick={() => setRevision((valor) => valor + 1)}
          className={`${boton} mt-4`}
        >
          Actualizar
        </button>

        {exito && (
          <p role="status" className="mt-5 rounded-lg bg-green-100 p-4 text-green-900">
            {exito}
          </p>
        )}

        {errores.length > 0 && (
          <ul role="alert" className="mt-5 list-inside list-disc rounded-lg bg-red-100 p-4 text-red-900">
            {errores.map((error, indice) => (
              <li key={indice}>{error}</li>
            ))}
          </ul>
        )}

        {errorCarga && (
          <p role="alert" className="mt-5 rounded-lg bg-red-100 p-4 text-red-900">
            {errorCarga}
          </p>
        )}

        {esMedico && !cargando && !errorCarga && (
          <section className="mt-8 rounded-xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">
              Atenciones disponibles para emitir receta
            </h2>

            <p className="mt-2 text-sm text-slate-600">
              Solo aparecen atenciones finalizadas que no tengan una
              receta con estado emitida.
            </p>

            <div className="mt-4 space-y-3">
              {atenciones?.data.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                  <p>
                    {item.paciente} — Cita #{item.cita_id} —{" "}
                    {item.inicia_en.slice(0, 16)}
                  </p>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => elegirAtencion(item)}
                    className={boton}
                  >
                    Crear receta
                  </button>
                </div>
              ))}

              {atenciones?.data.length === 0 && (
                <p className="text-slate-600">
                  No hay atenciones disponibles. Registra primero la atención
                  clínica, o anula la receta anterior si necesitas reemplazarla.
                </p>
              )}
            </div>

            {atenciones && (
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  disabled={ocupado || paginaAtenciones <= 1}
                  onClick={() => setPaginaAtenciones((valor) => valor - 1)}
                  className={boton}
                >
                  Anterior
                </button>
                <span>{atenciones.current_page} / {atenciones.last_page}</span>
                <button
                  type="button"
                  disabled={ocupado || paginaAtenciones >= atenciones.last_page}
                  onClick={() => setPaginaAtenciones((valor) => valor + 1)}
                  className={boton}
                >
                  Siguiente
                </button>
              </div>
            )}
          </section>
        )}

        {esMedico && atencion && (
          <section className="mt-8 rounded-xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">
              Nueva receta para {atencion.paciente}
            </h2>

            <form onSubmit={emitir} className="mt-5">
              <fieldset disabled={ocupado || porAnular !== null} className="space-y-5">
                <label className="block">
                  Fecha de vencimiento — opcional
                  <input
                    type="date"
                    value={venceFecha}
                    onChange={(evento) => setVenceFecha(evento.target.value)}
                    className={input}
                  />
                </label>

                <label className="block">
                  Indicaciones generales — opcional
                  <textarea
                    value={indicaciones}
                    maxLength={5000}
                    onChange={(evento) => setIndicaciones(evento.target.value)}
                    className={input}
                  />
                </label>

                {medicamentos.map((item, indice) => (
                  <section key={indice} className="rounded-lg border border-slate-200 p-4">
                    <h3 className="font-semibold">Medicamento {indice + 1}</h3>

                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                      {campos.map((campo) => (
                        <label key={campo.nombre}>
                          {campo.etiqueta}
                          <input
                            type={campo.tipo}
                            required
                            maxLength={campo.maximo}
                            min={
                              campo.nombre === "cantidad"
                                ? "0.01"
                                : campo.nombre === "duracion_dias"
                                  ? "1"
                                  : undefined
                            }
                            max={
                              campo.nombre === "cantidad"
                                ? "99999999.99"
                                : campo.nombre === "duracion_dias"
                                  ? "65535"
                                  : undefined
                            }
                            step={campo.nombre === "cantidad" ? "0.01" : "1"}
                            value={item[campo.nombre]}
                            onChange={(evento) =>
                              cambiarMedicamento(
                                indice,
                                campo.nombre,
                                evento.target.value
                              )
                            }
                            className={input}
                          />
                        </label>
                      ))}

                      <label className="md:col-span-2">
                        Indicaciones del medicamento — opcional
                        <textarea
                          maxLength={5000}
                          value={item.indicaciones ?? ""}
                          onChange={(evento) =>
                            cambiarMedicamento(
                              indice,
                              "indicaciones",
                              evento.target.value
                            )
                          }
                          className={input}
                        />
                      </label>
                    </div>

                    <button
                      type="button"
                      disabled={medicamentos.length === 1}
                      onClick={() =>
                        setMedicamentos((anteriores) =>
                          anteriores.filter((_, posicion) => posicion !== indice)
                        )
                      }
                      className={`${boton} mt-3`}
                    >
                      Quitar medicamento
                    </button>
                  </section>
                ))}

                <button
                  type="button"
                  disabled={medicamentos.length >= 20}
                  onClick={() =>
                    setMedicamentos((anteriores) => [
                      ...anteriores,
                      medicamentoVacio(),
                    ])
                  }
                  className={boton}
                >
                  Agregar medicamento
                </button>

                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    required
                    checked={confirmacion}
                    onChange={(evento) => setConfirmacion(evento.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    He revisado la receta. Entiendo que para corregir una
                    receta emitida debo anularla y crear otra.
                  </span>
                </label>

                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="rounded-lg bg-teal-700 px-4 py-3 text-white disabled:opacity-40"
                  >
                    {ocupado ? "Guardando…" : "Emitir receta"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAtencion(null)}
                    className={boton}
                  >
                    Cancelar
                  </button>
                </div>
              </fieldset>
            </form>
          </section>
        )}

        {porAnular && esMedico && (
          <form onSubmit={anular} className="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-5">
            <h2 className="font-semibold">Anular receta</h2>
            <p className="mt-2 break-all">{porAnular.numero_receta}</p>

            <label className="mt-3 block">
              Motivo de anulación
              <textarea
                required
                maxLength={1000}
                value={motivoAnulacion}
                disabled={ocupado}
                onChange={(evento) => setMotivoAnulacion(evento.target.value)}
                className={input}
              />
            </label>

            <div className="mt-4 flex gap-3">
              <button type="submit" disabled={ocupado} className={boton}>
                {ocupado ? "Procesando…" : "Confirmar anulación"}
              </button>
              <button
                type="button"
                disabled={ocupado}
                onClick={() => setPorAnular(null)}
                className={boton}
              >
                Volver
              </button>
            </div>
          </form>
        )}

        <section className="mt-8">
          <h2 className="text-xl font-semibold">Recetas registradas</h2>

          {cargando ? (
            <p className="mt-4">Cargando…</p>
          ) : errorCarga ? (
            <p className="mt-4">No se pudo actualizar el listado.</p>
          ) : (
            <>
              <div className="mt-5 space-y-5">
                {recetas?.data.map((receta) => (
                  <article key={receta.id} className="rounded-xl bg-white p-6 shadow-sm">
                    <h3 className="font-semibold">
                      {esMedico ? receta.paciente : receta.medico}
                    </h3>

                    <p className="mt-1 break-all text-xs text-slate-500">
                      {receta.numero_receta}
                    </p>

                    <p className="mt-2 text-sm">
                      Emisión: {receta.emitida_en}
                    </p>

                    <p className="text-sm">
                      Vencimiento: {receta.vence_en || "No especificado"}
                    </p>

                    <p className="mt-2 font-semibold capitalize">
                      Estado: {receta.estado}
                      {receta.estado === "emitida" && receta.vencida && " — vencida"}
                    </p>

                    {(receta.estado === "anulada" || receta.vencida) && (
                      <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                        Esta receta está anulada o vencida. Se muestra
                        únicamente como registro histórico.
                      </p>
                    )}

                    {receta.indicaciones && (
                      <p className="mt-4 whitespace-pre-wrap">
                        Indicaciones generales: {receta.indicaciones}
                      </p>
                    )}

                    <div className="mt-4 space-y-3">
                      {receta.medicamentos.map((item, indice) => (
                        <div key={indice} className="rounded-lg border p-4">
                          <p className="font-semibold">{item.medicamento}</p>
                          <p>Dosis: {item.dosis}</p>
                          <p>Frecuencia: {item.frecuencia}</p>
                          <p>Duración: {item.duracion_dias} días</p>
                          <p>Vía: {item.via_administracion}</p>
                          <p>Cantidad total: {item.cantidad}</p>
                          {item.indicaciones && (
                            <p className="mt-2 whitespace-pre-wrap">
                              {item.indicaciones}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>

                    {esMedico && receta.estado === "emitida" && (
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => {
                          setPorAnular(receta);
                          setMotivoAnulacion("");
                          setErrores([]);
                          setExito("");
                        }}
                        className={`${boton} mt-4`}
                      >
                        Anular receta
                      </button>
                    )}
                  </article>
                ))}
              </div>

              {recetas?.data.length === 0 && (
                <p className="mt-4">Todavía no hay recetas.</p>
              )}

              {recetas && (
                <div className="mt-5 flex items-center gap-3">
                  <button
                    type="button"
                    disabled={ocupado || pagina <= 1}
                    onClick={() => setPagina((valor) => valor - 1)}
                    className={boton}
                  >
                    Anterior
                  </button>
                  <span>{recetas.current_page} / {recetas.last_page}</span>
                  <button
                    type="button"
                    disabled={ocupado || pagina >= recetas.last_page}
                    onClick={() => setPagina((valor) => valor + 1)}
                    className={boton}
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
