import axios from "axios";
import { mensajeError } from "@/lib/auth";

type RespuestaError = {
  message?: string;
  errors?: Record<string, string[]>;
};

export function erroresPaciente(error: unknown): string[] {
  if (axios.isAxiosError<RespuestaError>(error)) {
    if (
      error.response?.status === 422 &&
      error.response.data.errors
    ) {
      return Object.values(error.response.data.errors).flat();
    }

    if (
      [404, 409].includes(error.response?.status ?? 0) &&
      error.response?.data.message
    ) {
      return [error.response.data.message];
    }
  }

  return [mensajeError(error)];
}
