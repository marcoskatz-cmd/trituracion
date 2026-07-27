# Setup desde cero

1. `clasp login` (cuenta `marcoskatz@grupoingeco.com.ar`).
2. `clasp create --type standalone --title "Ingeco - Planta Trituracion"` en esta carpeta.
3. `clasp push --force` (sube solo `*.gs` + `appsscript.json`, ver `.claspignore`).
4. `clasp deploy --description "v1 inicial"` → anotar la URL `/exec`.
5. **Configurar acceso público a mano**: abrir el proyecto en script.google.com → Implementar → Administrar implementaciones → editar (ícono de lápiz) → "Quién tiene acceso" → **Cualquier usuario** → Implementar. El campo `webapp` de `appsscript.json` declara la intención pero NO configura esto por sí solo vía `clasp`/API — confirmado en la práctica: tanto un redeploy (`-i`) como un deployment nuevo se sirvieron con "Necesitás acceso" hasta hacer este paso a mano.
6. Correr `initSheets` desde el editor de Apps Script (no vía HTTP — no es una acción pública): Extensiones → Apps Script → seleccionar `initSheets` en el desplegable de funciones → ▶ Ejecutar → autorizar permisos la primera vez. Esto crea la planilla `Trituracion - Datos` y las 5 hojas.
7. Abrir la planilla creada (Script Properties → `SHEET_ID` tiene el id) y cargar a mano:
   - `STOCK`: columna `Inicial` de cada piedra acopiada.
   - `CONFIG`: los factores reales de m³ por camión/tanda (arrancan en valores de ejemplo: 15 para camiones, 10 para tandas de producción).
8. Pegar la URL `/exec` en `CONFIG.API_URL` de `index.html`.
9. `git push origin main` → GitHub Pages sirve el frontend.
