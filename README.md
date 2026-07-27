# Planta de Trituración — Panel

Panel web para que el operario de la planta de trituración registre camiones de
entrada (material bruto) y salida (piedra clasificada), producción hacia el
acopio, horómetro de la trituradora y consumo de insumos. Sin login.

- **App pública**: https://marcoskatz-cmd.github.io/trituracion/
- **Backend**: Google Sheets + Apps Script (solo `doPost`/`ContentService`, nunca HtmlService)
- **Planilla**: `Trituracion - Datos` (se crea la primera vez que se corre `initSheets` desde el editor de Apps Script; no es una acción pública del `/exec`)
- **URL del backend (`/exec`)**: https://script.google.com/macros/s/AKfycbwNcjZ6SG4WqC7TyyOCVppTrtyovaLLApsP8qzFPwg25ThSYBXHqPIwInq9BPS2GfOJuA/exec

## Estructura

- `index.html` — la web (frontend completo, sin build)
- `Constantes.gs` / `Logica.gs` / `Sheets.gs` / `Code.gs` — backend Apps Script
- `appsscript.json` — manifiesto
- `manifest.json` / `service-worker.js` — PWA
- `SETUP.md` — pasos para configurar desde cero

## Actualizar el panel (frontend)

Editar `index.html` → `git push origin main`. GitHub Pages redeploya solo en 1-3 min.

**Importante (PWA instalada):** el `service-worker.js` cachea `index.html` cache-first sin invalidación automática. Un operario que ya instaló el panel como PWA NO va a ver el cambio con un simple push — hay que bumpear la constante `CACHE` en `service-worker.js` (p. ej. `trituracion-v1` → `trituracion-v2`) para que el service worker descarte el cache viejo y sirva la versión nueva. Mismo patrón que usa el hub (`apps/service-worker.js`).

## Actualizar el backend

Editar los `.gs` localmente → `clasp push --force` → `clasp deploy --deploymentId AKfycbwNcjZ6SG4WqC7TyyOCVppTrtyovaLLApsP8qzFPwg25ThSYBXHqPIwInq9BPS2GfOJuA -d "qué cambió"` (mismo deployment, misma URL `/exec`).

**Importante:** el "Quién tiene acceso" de este deployment tuvo que configurarse a mano una vez desde el editor de Apps Script (Implementar → Administrar implementaciones → editar → "Cualquier usuario") — el campo `webapp` de `appsscript.json` NO alcanza para esto vía `clasp`/API, hay que hacerlo por UI. Si algún día hace falta crear un deployment nuevo (no redeployar este), repetir ese paso a mano.

## Tests

Lógica pura (`Constantes.gs` / `Logica.gs`) y el guard de paridad de labels con `index.html` tienen tests de Node:

```
node --test tests/constantes.test.js tests/logica.test.js tests/index-html-labels.test.js
```

**Ojo:** `node --test tests/` (apuntando al directorio, sin listar los archivos) falla con `MODULE_NOT_FOUND` en esta versión de Node — hay que pasar la lista explícita de archivos como arriba.
