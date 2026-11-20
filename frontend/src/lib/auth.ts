import axios from "axios";

export type Rol = "administrador" | "medico" | "paciente";

export type Usuario = {
  id: number;
  nombre: string;
  correo: string;
  rol: Rol;
};

export type RespuestaUsuario = {
  usuario: Usuario;
};

export const rutasPorRol: Record<Rol, string> = {
  administrador: "/admin",
  medico: "/medico",
  paciente: "/paciente",
};

export const endpointsPorRol: Record<Rol, string> = {
  administrador: "/api/admin/panel",
  medico: "/api/medico/panel",
  paciente: "/api/paciente/panel",
};

export function mensajeError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    switch (error.response?.status) {
      case 401:
        return "La sesión no está disponible o las credenciales son incorrectas.";
      case 403:
        return "Tu cuenta no tiene permiso para acceder a esta sección.";
      case 419:
        return "La sesión de seguridad venció. Intenta nuevamente.";
      case 422:
        return "Revisa los datos ingresados.";
      case 429:
        return "Demasiados intentos. Espera un minuto.";
    }

    if (!error.response) {
      return "No se pudo conectar con Laravel. Comprueba que esté encendido.";
    }
  }

  return "No se pudo completar la solicitud. Intenta nuevamente.";
}
