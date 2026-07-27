# Planta de Trituración — Panel

Panel web para que el operario de la planta de trituración registre camiones de
entrada (material bruto) y salida (piedra clasificada), producción hacia el
acopio, horómetro de la trituradora y consumo de insumos. Sin login.

- **App pública**: https://marcoskatz-cmd.github.io/trituracion/
- **Backend**: Google Sheets + Apps Script (solo `doPost`/`ContentService`, nunca HtmlService)
- **Planilla**: `Trituracion - Datos` (se crea sola la primera vez que se llama a `action=setup`)
- **URL del backend (`/exec`)**: https://script.google.com/macros/s/AKfycbwNcjZ6SG4WqC7TyyOCVppTrtyovaLLApsP8qzFPwg25ThSYBXHqPIwInq9BPS2GfOJuA/exec

## Estructura

- `index.html` — la web (frontend completo, sin build)
- `Constantes.gs` / `Logica.gs` / `Sheets.gs` / `Code.gs` — backend Apps Script
- `appsscript.json` — manifiesto
- `manifest.json` / `service-worker.js` — PWA
- `SETUP.md` — pasos para configurar desde cero

## Actualizar el panel (frontend)

Editar `index.html` → `git push origin main`. GitHub Pages redeploya solo en 1-3 min.

## Actualizar el backend

Editar los `.gs` localmente → `clasp push --force` → `clasp deploy --deploymentId AKfycbwNcjZ6SG4WqC7TyyOCVppTrtyovaLLApsP8qzFPwg25ThSYBXHqPIwInq9BPS2GfOJuA -d "qué cambió"` (mismo deployment, misma URL `/exec`).

**Importante:** el "Quién tiene acceso" de este deployment tuvo que configurarse a mano una vez desde el editor de Apps Script (Implementar → Administrar implementaciones → editar → "Cualquier usuario") — el campo `webapp` de `appsscript.json` NO alcanza para esto vía `clasp`/API, hay que hacerlo por UI. Si algún día hace falta crear un deployment nuevo (no redeployar este), repetir ese paso a mano.
