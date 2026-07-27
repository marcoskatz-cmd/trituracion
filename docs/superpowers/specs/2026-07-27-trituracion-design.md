# App Planta de Trituración — Diseño

Fecha: 2026-07-27
Repo: `marcoskatz-cmd/trituracion`
URL pública prevista: `https://marcoskatz-cmd.github.io/trituracion/`

## Objetivo

App para la planta de trituración de INGECO que lleva control de:
- **Producido**: piedra que se agrega al acopio, por tipo.
- **Entregado**: camiones que salen de la planta con piedra clasificada, por tipo.
- **Insumos usados**: consumo de aceite motor, aceite hidráulico, refrigerante, agua destilada y grasa.
- **Horómetro** de la planta/máquina trituradora (entrada y salida de turno/día).
- **Stock de acopio** de las 4 piedras que se acopian.

Sin login: la app queda abierta para cualquier operario en la planta. No hace falta identificar quién carga cada evento, solo que quede fecha/hora.

## Alcance de producto

Material bruto (entra a la planta) se clasifica en 6 tipos de piedra al salir:
`Piedra 6-19`, `Piedra 19-38`, `Piedra 0-6`, `Piedra 6-12`, `Piedra Rechazo`, `Piedra Bola`.

Solo 4 de esos 6 tipos tienen acopio (stock) en la planta: **6-19, 0-6, Rechazo, Bola**. `19-38` y `6-12` se registran igual (mismo contador de salida) pero no afectan ningún stock — no se acopian.

## Modelo operativo

Hay **tres eventos distintos** que el operario registra con contadores tipo botón (un tap = un incremento, sin cantidad manual):

1. **Entrada de material bruto**: un solo botón. No tiene stock propio, pero se convierte a m³ con un factor fijo (para poder comparar contra lo producido).
2. **Salida de camión**: 6 botones (uno por tipo de piedra). Representa piedra que sale de la planta ya clasificada. Para los 4 tipos acopiados, **descuenta** stock.
3. **Producción**: 4 botones (uno por cada piedra acopiada). Representa una tanda que pasó de la trituradora/cinta al acopio. **Suma** stock. Es un evento separado de la salida de camión — el rendimiento del bruto no se infiere automáticamente, cada tanda producida se registra a mano con su propio botón.

Cada uno de los 7 conceptos (bruto + 6 piedras) tiene un factor de conversión a m³ configurable, y la producción tiene su propio factor por tanda (puede diferir del factor de un camión de salida).

### Por qué separar producción de salida

Si solo existieran entrada de bruto y salida de camión, el stock nunca podría subir (no hay evento de "se apiló"). Por eso hay un tercer contador de producción explícito, que es el que alimenta el acopio. La salida de camión consume ese acopio.

### Stock

Solo para las 4 piedras acopiadas. `Actual = Inicial + Producido - Entregado`. `Inicial` se carga a mano una vez (editable en la planilla, igual que en PAVIMAX). `Producido` y `Entregado` se derivan sumando el historial de `MOVIMIENTOS`.

### Horómetro

Es el horómetro de la **planta/máquina trituradora**, no de camiones ni de la pala. Se carga una vez al inicio del día/turno (horómetro entrada) y una vez al final (horómetro salida). Una vez cargado el de entrada del día, ese campo queda bloqueado en la UI para no pisarlo por error; solo se habilita el de salida. Horas trabajadas = salida − entrada, calculado.

### Insumos

Consumo, no pedido: el operario tiene todo a disposición y registra lo que usó. Tipos fijos: **Aceite Motor, Aceite Hidráulico, Refrigerante, Agua Destilada, Grasa**. Se carga tipo + cantidad (litros/kg) + fecha/hora automática. Es solo historial de consumo — no se lleva stock/inventario de estos insumos en esta app.

### Contadores del día

La UI muestra el total de **hoy** por cada concepto (camiones entrada/salida por tipo, tandas de producción por tipo), calculado filtrando `MOVIMIENTOS` de la fecha actual — no se borra nada, el historial completo queda en la planilla para reportes futuros, pero visualmente el operario solo ve el contador de hoy arrancando en 0 cada día.

## Arquitectura (gotcha de multi-login — no repetir el error de Demarcación Vial)

Google rutea las web apps de **HtmlService** por cuenta (`/macros/u/N/s/.../exec`) cuando el navegador tiene varias sesiones de Google abiertas, y eso rompe la app ("Sorry, unable to open the file"). Las respuestas de **ContentService** (JSON) no pasan por ese ruteo. Por eso esta app se construye así desde el arranque, sin excepciones:

- **Frontend**: página estática (HTML/JS vanilla, sin build) en GitHub Pages. Nunca servida desde `doGet` con HtmlService.
- **Backend**: Apps Script expone **solo `doPost`**, respondiendo con `ContentService.createTextOutput(JSON.stringify(...)).setMimeType(ContentService.MimeType.JSON)`. Nunca `google.script.run`, nunca HtmlService para la UI real.
- Dispatcher único por `action` (mismo patrón que Demarcación Vial: `_despachar_()`).
- El frontend manda los POST con `Content-Type: text/plain;charset=utf-8` (Apps Script no responde el preflight `OPTIONS`; `application/json` rompe CORS).
- IDs y configuración sensible (Sheet ID) en **Script Properties**, no hardcodeados en el código.
- Como varios operarios pueden tapear casi al mismo tiempo, cualquier escritura que actualice `STOCK` va envuelta en `LockService` para evitar que un tap pise a otro (lectura-modificación-escritura no atómica).

## Estructura de archivos del repo

```
index.html            # PWA completa (single-page, tabs, sin build)
manifest.json
service-worker.js
icon-192.png / icon-512.png
Code.gs                # backend Apps Script
appsscript.json
.claspignore            # solo sube Code.gs + appsscript.json (ver gotcha abajo)
README.md
SETUP.md
```

**Gotcha conocido (ya pasó en PAVIMAX):** si `service-worker.js` u otro `.js` de frontend se sube al proyecto de Apps Script, el web app entero se cae con `ReferenceError: self is not defined` (se evalúa como server-side). `.claspignore` debe excluir todo salvo `Code.gs` y `appsscript.json`.

## Modelo de datos (Google Sheets)

Planilla `Trituracion - Datos`, hojas:

**MOVIMIENTOS** (log histórico, append-only)
| ID | Fecha_Hora | Tipo | Producto | Cantidad_m3 |
|---|---|---|---|---|
`Tipo` ∈ `entrada_bruto`, `salida`, `produccion`. `Producto` vacío para `entrada_bruto`; para los otros dos, uno de los 6/4 tipos de piedra. `Cantidad_m3` se calcula server-side al insertar, usando `CONFIG`.

**STOCK** (4 filas fijas)
| Producto | Inicial | Producido | Entregado | Actual |
|---|---|---|---|---|
Filas: `Piedra 6-19`, `Piedra 0-6`, `Piedra Rechazo`, `Piedra Bola`. `Inicial` editable a mano. `Producido`/`Entregado` se recalculan sumando `MOVIMIENTOS` filtrado por producto y tipo. `Actual = Inicial + Producido - Entregado`.

**HOROMETRO** (una fila por día)
| Fecha | Horometro_Entrada | Horometro_Salida | Horas_Trabajadas |
|---|---|---|---|

**INSUMOS** (log)
| ID | Fecha_Hora | Tipo_Insumo | Cantidad |
|---|---|---|---|
`Tipo_Insumo` ∈ `Aceite Motor`, `Aceite Hidráulico`, `Refrigerante`, `Agua Destilada`, `Grasa`.

**CONFIG** (factores editables a mano)
| Concepto | Unidad | Factor_m3 |
|---|---|---|
Filas: `material_bruto`, `piedra_6_19`, `piedra_19_38`, `piedra_0_6`, `piedra_6_12`, `piedra_rechazo`, `piedra_bola`, `produccion_6_19`, `produccion_0_6`, `produccion_rechazo`, `produccion_bola`.

Todo se almacena y calcula en **m³**; la columna `Unidad` es solo informativa (documenta si el factor sale de una medición en m³ o en toneladas convertidas), no cambia ningún cálculo. `Factor_m3` es siempre el equivalente en m³ de un camión (o de una tanda, para las filas `produccion_*`).

## Endpoints (`doPost`, dispatcher por `action`)

- `hoy` → `{ camiones: {entrada_bruto, salida: {por tipo}}, produccion: {por tipo}, horometro: {entrada, salida, horas} | null, insumos: {por tipo} }` filtrado a la fecha de hoy.
- `stock` → `{ piedra_6_19: {inicial, producido, entregado, actual}, ... }` para las 4 piedras acopiadas.
- `registrarCamion` `{ tipo: 'entrada_bruto' | 'salida', producto? }` — `producto` requerido si `tipo === 'salida'`.
- `registrarProduccion` `{ producto }` — uno de los 4 tipos acopiados.
- `registrarHorometro` `{ momento: 'entrada' | 'salida', valor }` — rechaza si ya existe ese momento para hoy (evita pisar).
- `registrarInsumo` `{ tipo, cantidad }`.

## Pantallas (una sola PWA, navegación por tabs)

**🚛 Camiones** — botón "Entrada Material Bruto" + grid de 6 botones de salida por tipo de piedra. Cada botón muestra el conteo de hoy debajo.

**⚙️ Producción** — 4 botones (uno por piedra acopiada). Muestra tandas de hoy por tipo.

**📦 Stock** — solo lectura: `Actual` (y desglose Inicial/Producido/Entregado) de las 4 piedras acopiadas, en m³.

**⏱️ Horómetro** — campos "Horómetro entrada" y "Horómetro salida" del día. El de entrada se bloquea una vez cargado hoy. Muestra horas trabajadas cuando están ambos.

**🛢️ Insumos** — selector de 5 tipos + cantidad (litros/kg) + botón registrar.

Al abrir cualquier pantalla, la app pide `action=hoy` y `action=stock` para pintar el estado actual — no depende de estado local, así que cerrar y volver a abrir la app no pierde lo cargado en el día.

## Deploy

1. Crear Sheet `Trituracion - Datos` + proyecto Apps Script nuevo. Guardar `SHEET_ID` en Script Properties.
2. `initSheets()` — función idempotente, crea/migra las 5 hojas con headers y formato.
3. `.claspignore` (solo `Code.gs` + `appsscript.json`) → `clasp push` → `clasp deploy` (queda URL `/exec` fija).
4. Repo nuevo `marcoskatz-cmd/trituracion` en GitHub → push del frontend → GitHub Pages.
5. Sumar tile a `apps/index.html` (hub "Apps INGECO") y bumpear `CACHE` del service worker del hub.

## Fuera de alcance (explícito)

- Sin login / identificación de operario.
- Sin stock/inventario de los insumos (aceite, grasa, etc.) — solo historial de consumo.
- Sin dashboard separado para Gerencia — Gerencia consulta directo la planilla de Sheets; la propia app ya muestra stock y contadores de hoy.
- Sin conversión automática de bruto → producción (rendimiento) — la producción se carga a mano por tanda.
- Sin identificación de camión (patente, chofer) — solo tipo + timestamp.
