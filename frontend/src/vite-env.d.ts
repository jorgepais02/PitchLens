/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL raíz del backend FastAPI. Opcional: si falta, el cliente usa localhost. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
