# Pitch Lens

SPA de predicción de resultados de fútbol (Home / Draw / Away) con Machine Learning.
Es la capa de presentación del TFG: consume la API FastAPI del proyecto y permite
predecir partidos hipotéticos, explorar estadísticas históricas y entrenar modelos
propios.

> Forma parte del monorepo del TFG. El backend (FastAPI + PostgreSQL) vive en la raíz
> del repositorio; este paquete es únicamente el cliente web.

---

## Stack

| Capa | Tecnología |
|---|---|
| UI | React 19 + TypeScript |
| Build / dev | Vite 8 |
| Estilos | Tailwind CSS v4 (`@tailwindcss/vite`) |
| Routing | React Router 7 — code-splitting por ruta (`lazy` + `Suspense`) |
| Datos / caché | TanStack Query 5 |
| Animación | Framer Motion |
| Iconos | lucide-react |
| Notificaciones | Sonner |
| Lint | ESLint + typescript-eslint |

Las visualizaciones (importancia de features, comparación de cuotas, barra-espectro
H/D/A) están construidas a medida con CSS —`<div>` con flexbox y anchos en
porcentaje— y animadas con Framer Motion, sin librería de gráficos externa. El SVG se
limita al logotipo y a los iconos (lucide-react).

---

## Requisitos

- **Node.js ≥ 20**
- El **backend FastAPI en ejecución** en `http://localhost:8000` (ver el README de la
  raíz del repositorio para arrancarlo y sembrar la BD).

---

## Puesta en marcha

```bash
npm install
npm run dev
```

La app queda disponible en `http://localhost:5173`.

### Scripts

| Comando | Acción |
|---|---|
| `npm run dev` | Servidor de desarrollo con HMR |
| `npm run build` | Type-check (`tsc -b`) + build de producción a `dist/` |
| `npm run preview` | Sirve el build de producción localmente |
| `npm run lint` | Ejecuta ESLint sobre el proyecto |

---

## Configuración de la API

La URL raíz del backend se controla con la variable de entorno **`VITE_API_URL`**. En
desarrollo local no hace falta configurar nada: `src/lib/api.ts` cae a
`http://localhost:8000` por defecto.

```ts
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
```

Para apuntar a otro backend (p. ej. al desplegar), define `VITE_API_URL` en el entorno
de build o en un fichero `.env.production`. Ver `.env.example`. Cada petición antepone
esa URL a su ruta (`fetch(\`${BASE}${path}\`)`).

Todas las peticiones (catálogo, predicción, autenticación JWT, entrenamiento) pasan por
el helper `request()` de ese módulo, que añade cabeceras, normaliza errores de la API y
gestiona el token Bearer.

---

## Pantallas

| Ruta | Pantalla |
|---|---|
| `/new` | **Predictor** — liga → equipo local → equipo visitante → modelo → *Predecir*. Avisa de *cold start* si algún equipo no tiene historial suficiente. |
| `/prediction/:id` | **Resultado** — probabilidades H/D/A, importancia de features, features elegidas y su peso (modelo custom), comparación con cuotas de mercado (solo modelo *Market*) y estadísticas recientes de ambos equipos. |
| `/explore` | **Exploración** — estadísticas históricas con filtros por liga / temporada / equipo. |
| `/explore/:slug` | **Detalle de partido** — ficha de un partido concreto. |
| `/studio` | **Studio** (requiere registro) — selección de features + algoritmo → entrenamiento → métricas (Accuracy, Log Loss) → comparación con preentrenados. El modelo entrenado queda disponible en el selector del Predictor. |

`/` redirige a `/new`. Las rutas no reconocidas muestran la pantalla 404.

---

## Estructura

```
src/
  main.tsx              — punto de entrada
  App.tsx               — router, providers (Auth, Prediction), layout, Toaster
  index.css             — tema Tailwind v4 y tokens de diseño
  pages/                — una página por ruta (carga diferida)
    PredictorPage.tsx
    prediction/         — resultado de predicción
    ExplorePage.tsx
    ExploreMatchPage.tsx
    StudioPage.tsx
    NotFoundPage.tsx
  components/           — Navbar y componentes compartidos (shared.tsx)
  context/              — AuthContext (JWT) y PredictionContext (estado del flujo)
  lib/
    api.ts              — cliente HTTP tipado contra la API FastAPI
```

---

## Autenticación

El Studio y la predicción con modelos propios requieren cuenta. El registro/login
devuelven un JWT que `AuthContext` conserva y `lib/api.ts` adjunta como `Bearer` en las
rutas protegidas. Al borrar la cuenta, el token deja de resolver a un usuario y la API
responde 401 en cualquier ruta protegida (no quedan sesiones zombie).
</content>
</invoke>
