/** The requests the contact form offers; the CMS rejects anything else. */
export const REQUEST_TYPES = [
  "Consulta general",
  "Agregar mi negocio",
  "Quitar mi negocio",
  "Publicidad en el sitio",
] as const;

export type RequestType = (typeof REQUEST_TYPES)[number];

export interface ContactState {
  status: "idle" | "sent" | "error";
  error?: string;
}
