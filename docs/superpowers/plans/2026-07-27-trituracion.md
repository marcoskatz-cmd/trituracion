# App Planta de Trituración — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a login-free PWA for INGECO's crushing plant that logs truck movements (raw material in, classified stone out), production batches into stockpile, machine hour-meter readings, and consumable usage — backed by Google Sheets via Apps Script.

**Architecture:** Static PWA (no build step) on GitHub Pages talks to a Google Apps Script backend exclusively through `doPost` + `ContentService` JSON (never `doGet`/HtmlService/`google.script.run`), to avoid Google's multi-login `/u/N/` routing bug that broke a previous INGECO app. Google Sheets is the datastore; a `CONFIG` sheet holds editable m³ conversion factors; `STOCK` is recomputed from the `MOVIMIENTOS` log on every write, guarded by `LockService`.

**Tech Stack:** Google Apps Script (V8 runtime), Google Sheets, vanilla HTML/CSS/JS frontend, `clasp` 3.3.0 for backend deploy, GitHub Pages for frontend hosting, Node's built-in `node:test` for testing pure logic.

## Global Constraints

- No login / no operator identification — every screen is open to anyone at the plant (spec: "Sin login").
- Backend is **only** `doPost` + `ContentService`; **never** `doGet` with HtmlService or `google.script.run` (spec: multi-login gotcha).
- POST requests use `Content-Type: text/plain;charset=utf-8` (Apps Script does not answer CORS preflight `OPTIONS`).
- All quantities are stored and computed in **m³**; the `Unidad` column in `CONFIG` is documentation only, never used in calculations.
- Stock (`STOCK` sheet) tracks only 4 products: `piedra_6_19`, `piedra_0_6`, `piedra_rechazo`, `piedra_bola`. `piedra_19_38` and `piedra_6_12` are counted but never touch stock.
- Any write that can be triggered by concurrent taps (production, salida affecting stock) must go through `LockService`.
- Sheet ID and other sensitive config live in Script Properties, never hardcoded.
- `.claspignore` must only allow `*.gs` and `appsscript.json` — pushing frontend `.js`/`.html` files to the Apps Script project breaks the web app (`self is not defined`), per prior incident in PAVIMAX.
- Repo: `marcoskatz-cmd/trituracion`, local working copy `C:\Users\Usuario\trituracion-repo` (already initialized, spec committed as `97446b9`).

---

### Task 1: Pure calculation logic (Constantes.gs + Logica.gs) with Node tests

**Files:**
- Create: `tests/helpers/loadGas.js`
- Create: `tests/constantes.test.js`
- Create: `Constantes.gs`
- Create: `tests/logica.test.js`
- Create: `Logica.gs`

**Interfaces:**
- Produces (used by Task 2's `Sheets.gs`/`Code.gs`): `PRODUCTOS_SALIDA` (array of 6 product keys), `PRODUCTOS_ACOPIO` (array of 4 product keys, all present in `PRODUCTOS_SALIDA`), `LABELS_PRODUCTO` (map product key → display label), `TIPOS_INSUMO` (array of 5 keys), `LABELS_INSUMO` (map key → display label); `calcularStockActual(inicial, producido, entregado)`, `esMismoDia(fechaISO, fechaReferenciaISO)`, `agruparContadoresHoy(movimientos, fechaHoyISO)`, `calcularHorasTrabajadas(horometroEntrada, horometroSalida)`, `puedeRegistrarHorometro(registroHoy, momento)`.

- [ ] **Step 1: Write the test helper that loads a `.gs` file into a sandbox**

```javascript
// tests/helpers/loadGas.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadGasFiles(relativePaths) {
  const sandbox = {};
  vm.createContext(sandbox);
  relativePaths.forEach((relativePath) => {
    const fullPath = path.join(__dirname, '..', '..', relativePath);
    const code = fs.readFileSync(fullPath, 'utf8');
    vm.runInContext(code, sandbox);
  });
  return sandbox;
}

module.exports = { loadGasFiles };
```

- [ ] **Step 2: Write the failing test for `Constantes.gs`**

```javascript
// tests/constantes.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGasFiles } = require('./helpers/loadGas');

test('listas de productos e insumos son consistentes', () => {
  const gas = loadGasFiles(['Constantes.gs']);

  assert.equal(gas.PRODUCTOS_SALIDA.length, 6);
  assert.equal(gas.PRODUCTOS_ACOPIO.length, 4);

  gas.PRODUCTOS_SALIDA.forEach((producto) => {
    assert.ok(gas.LABELS_PRODUCTO[producto], 'falta label para ' + producto);
  });

  gas.PRODUCTOS_ACOPIO.forEach((producto) => {
    assert.ok(
      gas.PRODUCTOS_SALIDA.includes(producto),
      producto + ' debe estar también en PRODUCTOS_SALIDA'
    );
  });

  assert.equal(gas.TIPOS_INSUMO.length, 5);
  gas.TIPOS_INSUMO.forEach((tipo) => {
    assert.ok(gas.LABELS_INSUMO[tipo], 'falta label para ' + tipo);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test tests/constantes.test.js`
Expected: FAIL — `ENOENT` reading `Constantes.gs` (file doesn't exist yet).

- [ ] **Step 4: Implement `Constantes.gs`**

```javascript
// Constantes.gs
var PRODUCTOS_SALIDA = [
  'piedra_6_19',
  'piedra_19_38',
  'piedra_0_6',
  'piedra_6_12',
  'piedra_rechazo',
  'piedra_bola'
];

var PRODUCTOS_ACOPIO = [
  'piedra_6_19',
  'piedra_0_6',
  'piedra_rechazo',
  'piedra_bola'
];

var LABELS_PRODUCTO = {
  piedra_6_19: 'Piedra 6-19',
  piedra_19_38: 'Piedra 19-38',
  piedra_0_6: 'Piedra 0-6',
  piedra_6_12: 'Piedra 6-12',
  piedra_rechazo: 'Piedra Rechazo',
  piedra_bola: 'Piedra Bola'
};

var TIPOS_INSUMO = [
  'aceite_motor',
  'aceite_hidraulico',
  'refrigerante',
  'agua_destilada',
  'grasa'
];

var LABELS_INSUMO = {
  aceite_motor: 'Aceite Motor',
  aceite_hidraulico: 'Aceite Hidráulico',
  refrigerante: 'Refrigerante',
  agua_destilada: 'Agua Destilada',
  grasa: 'Grasa'
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tests/constantes.test.js`
Expected: PASS (1 test, 0 failures).

- [ ] **Step 6: Write the failing tests for `Logica.gs`**

```javascript
// tests/logica.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGasFiles } = require('./helpers/loadGas');

test('calcularStockActual suma inicial y producido, resta entregado', () => {
  const gas = loadGasFiles(['Logica.gs']);
  assert.equal(gas.calcularStockActual(10, 5, 3), 12);
  assert.equal(gas.calcularStockActual(0, 2, 5), -3);
});

test('esMismoDia compara solo la parte de fecha (YYYY-MM-DD)', () => {
  const gas = loadGasFiles(['Logica.gs']);
  assert.equal(gas.esMismoDia('2026-07-27T10:00:00.000Z', '2026-07-27T23:00:00.000Z'), true);
  assert.equal(gas.esMismoDia('2026-07-26T23:59:00.000Z', '2026-07-27T00:01:00.000Z'), false);
});

test('agruparContadoresHoy filtra por fecha y agrupa por tipo/producto', () => {
  const gas = loadGasFiles(['Logica.gs']);
  const movimientos = [
    { tipo: 'entrada_bruto', producto: '', fecha: '2026-07-27T08:00:00.000Z' },
    { tipo: 'entrada_bruto', producto: '', fecha: '2026-07-26T08:00:00.000Z' },
    { tipo: 'salida', producto: 'piedra_6_19', fecha: '2026-07-27T09:00:00.000Z' },
    { tipo: 'salida', producto: 'piedra_6_19', fecha: '2026-07-27T10:00:00.000Z' },
    { tipo: 'produccion', producto: 'piedra_bola', fecha: '2026-07-27T11:00:00.000Z' }
  ];
  const resultado = gas.agruparContadoresHoy(movimientos, '2026-07-27T12:00:00.000Z');
  assert.equal(resultado.entrada_bruto, 1);
  assert.deepEqual(resultado.salida, { piedra_6_19: 2 });
  assert.deepEqual(resultado.produccion, { piedra_bola: 1 });
});

test('calcularHorasTrabajadas resta salida menos entrada', () => {
  const gas = loadGasFiles(['Logica.gs']);
  assert.equal(gas.calcularHorasTrabajadas(1000, 1008.5), 8.5);
});

test('puedeRegistrarHorometro rechaza pisar un momento ya cargado hoy', () => {
  const gas = loadGasFiles(['Logica.gs']);
  assert.equal(gas.puedeRegistrarHorometro(null, 'entrada'), true);
  assert.equal(gas.puedeRegistrarHorometro(null, 'salida'), true);
  assert.equal(
    gas.puedeRegistrarHorometro({ horometroEntrada: 1000, horometroSalida: null }, 'entrada'),
    false
  );
  assert.equal(
    gas.puedeRegistrarHorometro({ horometroEntrada: 1000, horometroSalida: null }, 'salida'),
    true
  );
  assert.equal(
    gas.puedeRegistrarHorometro({ horometroEntrada: 1000, horometroSalida: 1008 }, 'salida'),
    false
  );
});
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `node --test tests/logica.test.js`
Expected: FAIL — `ENOENT` reading `Logica.gs`.

- [ ] **Step 8: Implement `Logica.gs`**

```javascript
// Logica.gs
function calcularStockActual(inicial, producido, entregado) {
  return inicial + producido - entregado;
}

function esMismoDia(fechaISO, fechaReferenciaISO) {
  return fechaISO.slice(0, 10) === fechaReferenciaISO.slice(0, 10);
}

function agruparContadoresHoy(movimientos, fechaHoyISO) {
  var resultado = { entrada_bruto: 0, salida: {}, produccion: {} };
  movimientos.forEach(function (m) {
    if (!esMismoDia(m.fecha, fechaHoyISO)) return;
    if (m.tipo === 'entrada_bruto') {
      resultado.entrada_bruto += 1;
    } else if (m.tipo === 'salida') {
      resultado.salida[m.producto] = (resultado.salida[m.producto] || 0) + 1;
    } else if (m.tipo === 'produccion') {
      resultado.produccion[m.producto] = (resultado.produccion[m.producto] || 0) + 1;
    }
  });
  return resultado;
}

function calcularHorasTrabajadas(horometroEntrada, horometroSalida) {
  return horometroSalida - horometroEntrada;
}

function puedeRegistrarHorometro(registroHoy, momento) {
  if (!registroHoy) return true;
  if (momento === 'entrada') {
    return registroHoy.horometroEntrada === null || registroHoy.horometroEntrada === undefined;
  }
  if (momento === 'salida') {
    return registroHoy.horometroSalida === null || registroHoy.horometroSalida === undefined;
  }
  return false;
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `node --test tests/constantes.test.js tests/logica.test.js`
Expected: PASS (6 tests total, 0 failures).

- [ ] **Step 10: Commit**

```bash
git add tests/helpers/loadGas.js tests/constantes.test.js tests/logica.test.js Constantes.gs Logica.gs
git commit -m "Add pure logic (Constantes.gs, Logica.gs) with Node tests"
```

---

### Task 2: Backend Apps Script (Sheets.gs + Code.gs), deploy, and HTTP verification

**Files:**
- Create: `Sheets.gs`
- Create: `Code.gs`
- Create: `appsscript.json`
- Create: `.claspignore`
- Create: `.gitignore`
- Create: `README.md`
- Create: `SETUP.md`

**Interfaces:**
- Consumes: `PRODUCTOS_SALIDA`, `PRODUCTOS_ACOPIO`, `LABELS_PRODUCTO`, `TIPOS_INSUMO` from `Constantes.gs`; `calcularStockActual`, `esMismoDia`, `agruparContadoresHoy`, `calcularHorasTrabajadas`, `puedeRegistrarHorometro` from `Logica.gs` (all in the same Apps Script global scope, no imports needed).
- Produces: `doPost(e)` (Apps Script entry point), action handlers reachable through `_despachar_(action, params)` for actions `setup`, `hoy`, `stock`, `registrarCamion`, `registrarProduccion`, `registrarHorometro`, `registrarInsumo`.

This task has no local automated test (it depends on live `SpreadsheetApp`/`ContentService`, which only run once deployed to Google). Verification is a real HTTP round-trip against the deployed web app — the same pattern already used for Demarcación Vial and PAVIMAX.

- [ ] **Step 1: Implement `Sheets.gs`**

```javascript
// Sheets.gs
function getSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty('SHEET_ID');
  if (sheetId) {
    return SpreadsheetApp.openById(sheetId);
  }
  var ss = SpreadsheetApp.create('Trituracion - Datos');
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}

function initSheets() {
  var ss = getSpreadsheet_();
  crearHojaMovimientos_(ss);
  crearHojaStock_(ss);
  crearHojaHorometro_(ss);
  crearHojaInsumos_(ss);
  crearHojaConfig_(ss);
}

function crearHojaMovimientos_(ss) {
  var hoja = ss.getSheetByName('MOVIMIENTOS') || ss.insertSheet('MOVIMIENTOS');
  hoja.getRange(1, 1, 1, 5).setValues([['ID', 'Fecha_Hora', 'Tipo', 'Producto', 'Cantidad_m3']]);
  hoja.setFrozenRows(1);
}

function crearHojaStock_(ss) {
  var hoja = ss.getSheetByName('STOCK') || ss.insertSheet('STOCK');
  hoja.getRange(1, 1, 1, 5).setValues([['Producto', 'Inicial', 'Producido', 'Entregado', 'Actual']]);
  hoja.setFrozenRows(1);
  PRODUCTOS_ACOPIO.forEach(function (producto, i) {
    var fila = i + 2;
    if (hoja.getRange(fila, 1).getValue() !== producto) {
      hoja.getRange(fila, 1, 1, 5).setValues([[producto, 0, 0, 0, 0]]);
    }
  });
}

function crearHojaHorometro_(ss) {
  var hoja = ss.getSheetByName('HOROMETRO') || ss.insertSheet('HOROMETRO');
  hoja.getRange(1, 1, 1, 4).setValues([['Fecha', 'Horometro_Entrada', 'Horometro_Salida', 'Horas_Trabajadas']]);
  hoja.setFrozenRows(1);
}

function crearHojaInsumos_(ss) {
  var hoja = ss.getSheetByName('INSUMOS') || ss.insertSheet('INSUMOS');
  hoja.getRange(1, 1, 1, 4).setValues([['ID', 'Fecha_Hora', 'Tipo_Insumo', 'Cantidad']]);
  hoja.setFrozenRows(1);
}

function crearHojaConfig_(ss) {
  var hoja = ss.getSheetByName('CONFIG') || ss.insertSheet('CONFIG');
  hoja.getRange(1, 1, 1, 3).setValues([['Concepto', 'Unidad', 'Factor_m3']]);
  hoja.setFrozenRows(1);
  var defaults = {
    material_bruto: 15,
    piedra_6_19: 15,
    piedra_19_38: 15,
    piedra_0_6: 15,
    piedra_6_12: 15,
    piedra_rechazo: 15,
    piedra_bola: 15,
    produccion_6_19: 10,
    produccion_0_6: 10,
    produccion_rechazo: 10,
    produccion_bola: 10
  };
  Object.keys(defaults).forEach(function (concepto, i) {
    var fila = i + 2;
    if (hoja.getRange(fila, 1).getValue() !== concepto) {
      hoja.getRange(fila, 1, 1, 3).setValues([[concepto, 'm3', defaults[concepto]]]);
    }
  });
}

function claveConfigMovimiento_(tipo, producto) {
  if (tipo === 'entrada_bruto') return 'material_bruto';
  if (tipo === 'produccion') return 'produccion_' + producto.replace('piedra_', '');
  return producto;
}

function leerConfig_() {
  var hoja = getSpreadsheet_().getSheetByName('CONFIG');
  var datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, 3).getValues();
  var config = {};
  datos.forEach(function (fila) {
    if (!fila[0]) return;
    config[fila[0]] = { unidad: fila[1], factorM3: fila[2] };
  });
  return config;
}

function leerMovimientos_() {
  var hoja = getSpreadsheet_().getSheetByName('MOVIMIENTOS');
  var lastRow = hoja.getLastRow();
  if (lastRow < 2) return [];
  var datos = hoja.getRange(2, 1, lastRow - 1, 5).getValues();
  return datos.map(function (fila) {
    return {
      id: fila[0],
      fecha: fila[1] instanceof Date ? fila[1].toISOString() : fila[1],
      tipo: fila[2],
      producto: fila[3],
      cantidadM3: fila[4]
    };
  });
}

function agregarMovimiento_(tipo, producto) {
  var config = leerConfig_();
  var clave = claveConfigMovimiento_(tipo, producto);
  var factor = config[clave] ? config[clave].factorM3 : 0;
  var hoja = getSpreadsheet_().getSheetByName('MOVIMIENTOS');
  var id = Utilities.getUuid();
  var ahora = new Date();
  hoja.appendRow([id, ahora, tipo, producto || '', factor]);
  return { id: id, fecha: ahora.toISOString(), tipo: tipo, producto: producto || '', cantidadM3: factor };
}

function recalcularStock_(producto) {
  var movimientos = leerMovimientos_();
  var producido = 0;
  var entregado = 0;
  movimientos.forEach(function (m) {
    if (m.producto !== producto) return;
    if (m.tipo === 'produccion') producido += m.cantidadM3;
    if (m.tipo === 'salida') entregado += m.cantidadM3;
  });
  var hoja = getSpreadsheet_().getSheetByName('STOCK');
  var datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, 5).getValues();
  for (var i = 0; i < datos.length; i++) {
    if (datos[i][0] === producto) {
      var fila = i + 2;
      var inicial = datos[i][1];
      var actual = calcularStockActual(inicial, producido, entregado);
      hoja.getRange(fila, 3, 1, 3).setValues([[producido, entregado, actual]]);
      return { producto: producto, inicial: inicial, producido: producido, entregado: entregado, actual: actual };
    }
  }
  throw new Error('Producto de acopio desconocido: ' + producto);
}

function leerStock_() {
  var hoja = getSpreadsheet_().getSheetByName('STOCK');
  var datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, 5).getValues();
  var stock = {};
  datos.forEach(function (fila) {
    stock[fila[0]] = { inicial: fila[1], producido: fila[2], entregado: fila[3], actual: fila[4] };
  });
  return stock;
}

function leerHorometroHoy_() {
  var hoja = getSpreadsheet_().getSheetByName('HOROMETRO');
  var lastRow = hoja.getLastRow();
  if (lastRow < 2) return null;
  var hoyStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var datos = hoja.getRange(2, 1, lastRow - 1, 4).getValues();
  for (var i = 0; i < datos.length; i++) {
    var fechaFila = datos[i][0];
    var fechaStr = fechaFila instanceof Date
      ? Utilities.formatDate(fechaFila, Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : fechaFila;
    if (fechaStr === hoyStr) {
      return {
        fila: i + 2,
        horometroEntrada: datos[i][1] === '' ? null : datos[i][1],
        horometroSalida: datos[i][2] === '' ? null : datos[i][2],
        horasTrabajadas: datos[i][3] === '' ? null : datos[i][3]
      };
    }
  }
  return null;
}

function registrarHorometro_(momento, valor) {
  var registroHoy = leerHorometroHoy_();
  if (!puedeRegistrarHorometro(registroHoy, momento)) {
    throw new Error('El horómetro de ' + momento + ' de hoy ya fue cargado.');
  }
  var hoja = getSpreadsheet_().getSheetByName('HOROMETRO');
  var hoyStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  if (!registroHoy) {
    var nuevaFila = hoja.getLastRow() + 1;
    var valores = momento === 'entrada' ? [hoyStr, valor, '', ''] : [hoyStr, '', valor, ''];
    hoja.getRange(nuevaFila, 1, 1, 4).setValues([valores]);
    return {
      fecha: hoyStr,
      horometroEntrada: momento === 'entrada' ? valor : null,
      horometroSalida: momento === 'salida' ? valor : null,
      horasTrabajadas: null
    };
  }
  var col = momento === 'entrada' ? 2 : 3;
  hoja.getRange(registroHoy.fila, col).setValue(valor);
  var entrada = momento === 'entrada' ? valor : registroHoy.horometroEntrada;
  var salida = momento === 'salida' ? valor : registroHoy.horometroSalida;
  var horas = null;
  if (entrada !== null && salida !== null) {
    horas = calcularHorasTrabajadas(entrada, salida);
    hoja.getRange(registroHoy.fila, 4).setValue(horas);
  }
  return { fecha: hoyStr, horometroEntrada: entrada, horometroSalida: salida, horasTrabajadas: horas };
}

function registrarInsumo_(tipo, cantidad) {
  var hoja = getSpreadsheet_().getSheetByName('INSUMOS');
  var id = Utilities.getUuid();
  var ahora = new Date();
  hoja.appendRow([id, ahora, tipo, cantidad]);
  return { id: id, fecha: ahora.toISOString(), tipo: tipo, cantidad: cantidad };
}

function leerInsumosHoy_() {
  var hoja = getSpreadsheet_().getSheetByName('INSUMOS');
  var lastRow = hoja.getLastRow();
  if (lastRow < 2) return {};
  var hoyISO = new Date().toISOString();
  var datos = hoja.getRange(2, 1, lastRow - 1, 4).getValues();
  var resultado = {};
  datos.forEach(function (fila) {
    var fechaISO = fila[1] instanceof Date ? fila[1].toISOString() : fila[1];
    if (!esMismoDia(fechaISO, hoyISO)) return;
    resultado[fila[2]] = (resultado[fila[2]] || 0) + fila[3];
  });
  return resultado;
}
```

- [ ] **Step 2: Implement `Code.gs`**

```javascript
// Code.gs
function doPost(e) {
  var resultado;
  try {
    var body = JSON.parse(e.postData.contents);
    resultado = _despachar_(body.action, body);
  } catch (err) {
    resultado = { error: err.message };
  }
  return ContentService
    .createTextOutput(JSON.stringify(resultado))
    .setMimeType(ContentService.MimeType.JSON);
}

function _despachar_(action, params) {
  switch (action) {
    case 'setup':
      initSheets();
      return { ok: true };
    case 'hoy':
      return accionHoy_();
    case 'stock':
      return accionStock_();
    case 'registrarCamion':
      return conLock_(function () { return accionRegistrarCamion_(params); });
    case 'registrarProduccion':
      return conLock_(function () { return accionRegistrarProduccion_(params); });
    case 'registrarHorometro':
      return accionRegistrarHorometro_(params);
    case 'registrarInsumo':
      return accionRegistrarInsumo_(params);
    default:
      throw new Error('Acción desconocida: ' + action);
  }
}

function conLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function accionHoy_() {
  var movimientos = leerMovimientos_();
  var hoyISO = new Date().toISOString();
  var contadores = agruparContadoresHoy(movimientos, hoyISO);
  return {
    camiones: { entrada_bruto: contadores.entrada_bruto, salida: contadores.salida },
    produccion: contadores.produccion,
    horometro: leerHorometroHoy_(),
    insumos: leerInsumosHoy_()
  };
}

function accionStock_() {
  return leerStock_();
}

function accionRegistrarCamion_(params) {
  var tipo = params.tipo;
  var producto = params.producto || null;
  if (tipo !== 'entrada_bruto' && tipo !== 'salida') {
    throw new Error('Tipo de camión inválido: ' + tipo);
  }
  if (tipo === 'salida' && PRODUCTOS_SALIDA.indexOf(producto) === -1) {
    throw new Error('Producto de salida inválido: ' + producto);
  }
  var movimiento = agregarMovimiento_(tipo, producto);
  if (tipo === 'salida' && PRODUCTOS_ACOPIO.indexOf(producto) !== -1) {
    recalcularStock_(producto);
  }
  return movimiento;
}

function accionRegistrarProduccion_(params) {
  var producto = params.producto;
  if (PRODUCTOS_ACOPIO.indexOf(producto) === -1) {
    throw new Error('Producto de producción inválido: ' + producto);
  }
  var movimiento = agregarMovimiento_('produccion', producto);
  recalcularStock_(producto);
  return movimiento;
}

function accionRegistrarHorometro_(params) {
  return registrarHorometro_(params.momento, Number(params.valor));
}

function accionRegistrarInsumo_(params) {
  if (TIPOS_INSUMO.indexOf(params.tipo) === -1) {
    throw new Error('Tipo de insumo inválido: ' + params.tipo);
  }
  return registrarInsumo_(params.tipo, Number(params.cantidad));
}
```

- [ ] **Step 3: Run a syntax gate over both files (catches typos before touching Google)**

Run:
```bash
node --check <(cat Constantes.gs Logica.gs Sheets.gs Code.gs)
```
Expected: no output (exit code 0). If it errors, fix the reported syntax issue before continuing — `doPost`/`ContentService`/`SpreadsheetApp`/`LockService`/`PropertiesService`/`Utilities`/`Session` are undefined globals at check-time, that's expected and not a syntax error; only real `SyntaxError` output means a problem.

- [ ] **Step 4: Write `appsscript.json`**

```json
{
  "timeZone": "America/Argentina/Tucuman",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

- [ ] **Step 5: Write `.claspignore`**

```
**/**
!*.gs
!appsscript.json
```

- [ ] **Step 6: Write `.gitignore`**

```
.clasp.json
```

- [ ] **Step 7: Commit the backend code**

```bash
git add Sheets.gs Code.gs appsscript.json .claspignore .gitignore
git commit -m "Add Apps Script backend (Sheets.gs, Code.gs) and clasp config"
```

- [ ] **Step 8: Verify clasp login is still valid**

Run: `clasp login --status`
Expected: reports logged in as `marcoskatz@grupoingeco.com.ar`. If it says not logged in, run `clasp login` with `run_in_background: true`, read the printed OAuth URL (contains `redirect_uri=http://localhost:<port>`), and have Marcos open it in his browser on the same machine to complete the login.

- [ ] **Step 9: Create the Apps Script project and deploy**

```bash
clasp create --type standalone --title "Ingeco - Planta Trituracion"
```
This writes `.clasp.json` with a new `scriptId` in the current directory. Then:
```bash
clasp push --force
clasp deploy --description "v1 inicial"
```
`clasp deploy` prints a deployment ID. Build the web app URL as `https://script.google.com/macros/s/<deploymentId>/exec` and record it — it's needed for Task 3 and for `README.md`.

- [ ] **Step 10: Run the one-time setup action against the live backend**

```bash
curl -s -L -X POST "<EXEC_URL>" -H "Content-Type: text/plain;charset=utf-8" -d '{"action":"setup"}'
```
Expected: `{"ok":true}`. This calls `initSheets()`, which creates the spreadsheet `Trituracion - Datos` (first run) and all 5 sheets with headers and default `CONFIG` factors.

- [ ] **Step 11: Verify `hoy` and `stock` return the expected empty-state shape**

```bash
curl -s -L -X POST "<EXEC_URL>" -H "Content-Type: text/plain;charset=utf-8" -d '{"action":"hoy"}'
curl -s -L -X POST "<EXEC_URL>" -H "Content-Type: text/plain;charset=utf-8" -d '{"action":"stock"}'
```
Expected `hoy`: `{"camiones":{"entrada_bruto":0,"salida":{}},"produccion":{},"horometro":null,"insumos":{}}`
Expected `stock`: all 4 acopio products with `inicial:0, producido:0, entregado:0, actual:0`.

- [ ] **Step 12: Verify a full write round-trip**

```bash
curl -s -L -X POST "<EXEC_URL>" -H "Content-Type: text/plain;charset=utf-8" -d '{"action":"registrarProduccion","producto":"piedra_bola"}'
curl -s -L -X POST "<EXEC_URL>" -H "Content-Type: text/plain;charset=utf-8" -d '{"action":"registrarCamion","tipo":"salida","producto":"piedra_bola"}'
curl -s -L -X POST "<EXEC_URL>" -H "Content-Type: text/plain;charset=utf-8" -d '{"action":"stock"}'
```
Expected: `piedra_bola` shows `producido:10, entregado:15, actual:-5` (defaults: 10 m³/tanda producida, 15 m³/camión de salida) — confirms `MOVIMIENTOS` → `STOCK` wiring is correct end-to-end. (The negative number here is expected test noise from these defaults, not a bug — Marcos will set real `Inicial`/factors before real use.)

- [ ] **Step 13: Write `README.md`**

```markdown
# Planta de Trituración — Panel

Panel web para que el operario de la planta de trituración registre camiones de
entrada (material bruto) y salida (piedra clasificada), producción hacia el
acopio, horómetro de la trituradora y consumo de insumos. Sin login.

- **App pública**: https://marcoskatz-cmd.github.io/trituracion/
- **Backend**: Google Sheets + Apps Script (solo `doPost`/`ContentService`, nunca HtmlService)
- **Planilla**: `Trituracion - Datos` (se crea sola la primera vez que se llama a `action=setup`)

## Estructura

- `index.html` — la web (frontend completo, sin build)
- `Constantes.gs` / `Logica.gs` / `Sheets.gs` / `Code.gs` — backend Apps Script
- `appsscript.json` — manifiesto
- `manifest.json` / `service-worker.js` — PWA
- `SETUP.md` — pasos para configurar desde cero

## Actualizar el panel (frontend)

Editar `index.html` → `git push origin main`. GitHub Pages redeploya solo en 1-3 min.

## Actualizar el backend

Editar los `.gs` localmente → `clasp push --force` → `clasp deploy --deploymentId <id> -d "qué cambió"` (mismo deployment, misma URL `/exec`).
```

- [ ] **Step 14: Write `SETUP.md`**

```markdown
# Setup desde cero

1. `clasp login` (cuenta `marcoskatz@grupoingeco.com.ar`).
2. `clasp create --type standalone --title "Ingeco - Planta Trituracion"` en esta carpeta.
3. `clasp push --force` (sube solo `*.gs` + `appsscript.json`, ver `.claspignore`).
4. `clasp deploy --description "v1 inicial"` → anotar la URL `/exec`.
5. `curl -X POST "<EXEC_URL>" -H "Content-Type: text/plain;charset=utf-8" -d '{"action":"setup"}'` — crea la planilla `Trituracion - Datos` y las 5 hojas.
6. Abrir la planilla creada (Script Properties → `SHEET_ID` tiene el id) y cargar a mano:
   - `STOCK`: columna `Inicial` de cada piedra acopiada.
   - `CONFIG`: los factores reales de m³ por camión/tanda (arrancan en valores de ejemplo: 15 para camiones, 10 para tandas de producción).
7. Pegar la URL `/exec` en `CONFIG.API_URL` de `index.html`.
8. `git push origin main` → GitHub Pages sirve el frontend.
```

- [ ] **Step 15: Commit the docs**

```bash
git add README.md SETUP.md
git commit -m "Add README and SETUP docs for the trituración app"
```

---

### Task 3: Frontend PWA (index.html)

**Files:**
- Create: `index.html`

**Interfaces:**
- Consumes: the deployed `EXEC_URL` from Task 2, actions `hoy`, `stock`, `registrarCamion`, `registrarProduccion`, `registrarHorometro`, `registrarInsumo`.
- Produces: `manifest.json` link and `service-worker.js` registration used by Task 4.

- [ ] **Step 1: Implement `index.html`**

```html
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Trituración INGECO</title>
<link rel="manifest" href="manifest.json">
<meta name="theme-color" content="#4a5568">
<link rel="icon" href="icon-192.png">
<style>
  :root {
    --bg: #f4f5f7;
    --card: #ffffff;
    --texto: #1a202c;
    --primario: #4a5568;
    --primario-oscuro: #2d3748;
    --borde: #e2e8f0;
    --exito: #2f855a;
    --peligro: #c53030;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    background: var(--bg);
    color: var(--texto);
    padding-bottom: 72px;
  }
  header { background: var(--primario); color: white; padding: 16px; text-align: center; }
  header h1 { margin: 0; font-size: 20px; }
  header p { margin: 4px 0 0; font-size: 13px; opacity: 0.85; }
  main { padding: 16px; max-width: 480px; margin: 0 auto; }
  section { display: none; }
  section.activa { display: block; }
  .grid-botones { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .boton-contador {
    background: var(--card);
    border: 2px solid var(--borde);
    border-radius: 12px;
    padding: 16px 8px;
    text-align: center;
    cursor: pointer;
    font-size: 15px;
  }
  .boton-contador:active { background: var(--borde); }
  .boton-contador .conteo { display: block; font-size: 26px; font-weight: 700; margin-top: 6px; color: var(--primario-oscuro); }
  .boton-ancho { grid-column: 1 / -1; background: var(--primario); color: white; border: none; }
  .boton-ancho .conteo { color: white; }
  .card { background: var(--card); border-radius: 12px; padding: 16px; margin-bottom: 12px; border: 1px solid var(--borde); }
  .card h3 { margin: 0 0 8px; font-size: 15px; }
  .fila-stock { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--borde); }
  .fila-stock:last-child { border-bottom: none; }
  label { display: block; font-size: 13px; margin-bottom: 4px; color: #4a5568; }
  input, select {
    width: 100%; padding: 10px; border: 1px solid var(--borde);
    border-radius: 8px; font-size: 16px; margin-bottom: 12px;
  }
  input:disabled { background: #edf2f7; color: #a0aec0; }
  button.accion {
    width: 100%; padding: 14px; border: none; border-radius: 10px;
    background: var(--primario); color: white; font-size: 16px; font-weight: 600;
  }
  .mensaje { text-align: center; padding: 8px; border-radius: 8px; margin-bottom: 12px; font-size: 14px; }
  .mensaje.ok { background: #c6f6d5; color: var(--exito); }
  .mensaje.error { background: #fed7d7; color: var(--peligro); }
  nav { position: fixed; bottom: 0; left: 0; right: 0; background: var(--card); border-top: 1px solid var(--borde); display: flex; }
  nav button { flex: 1; padding: 10px 4px; border: none; background: none; font-size: 11px; color: #718096; }
  nav button.activo { color: var(--primario-oscuro); font-weight: 700; }
  nav button .icono { display: block; font-size: 20px; }
</style>
</head>
<body>
<header>
  <h1>Planta de Trituración</h1>
  <p id="fecha-hoy"></p>
</header>
<main>
  <div id="mensaje" class="mensaje" style="display:none"></div>

  <section id="tab-camiones" class="activa">
    <div class="grid-botones">
      <button class="boton-contador boton-ancho" data-accion="camion-bruto">
        Entrada Material Bruto
        <span class="conteo" id="c-entrada_bruto">0</span>
      </button>
      <button class="boton-contador" data-accion="camion-salida" data-producto="piedra_6_19">Piedra 6-19<span class="conteo" id="c-salida-piedra_6_19">0</span></button>
      <button class="boton-contador" data-accion="camion-salida" data-producto="piedra_19_38">Piedra 19-38<span class="conteo" id="c-salida-piedra_19_38">0</span></button>
      <button class="boton-contador" data-accion="camion-salida" data-producto="piedra_0_6">Piedra 0-6<span class="conteo" id="c-salida-piedra_0_6">0</span></button>
      <button class="boton-contador" data-accion="camion-salida" data-producto="piedra_6_12">Piedra 6-12<span class="conteo" id="c-salida-piedra_6_12">0</span></button>
      <button class="boton-contador" data-accion="camion-salida" data-producto="piedra_rechazo">Piedra Rechazo<span class="conteo" id="c-salida-piedra_rechazo">0</span></button>
      <button class="boton-contador" data-accion="camion-salida" data-producto="piedra_bola">Piedra Bola<span class="conteo" id="c-salida-piedra_bola">0</span></button>
    </div>
  </section>

  <section id="tab-produccion">
    <div class="grid-botones">
      <button class="boton-contador" data-accion="produccion" data-producto="piedra_6_19">Piedra 6-19<span class="conteo" id="c-produccion-piedra_6_19">0</span></button>
      <button class="boton-contador" data-accion="produccion" data-producto="piedra_0_6">Piedra 0-6<span class="conteo" id="c-produccion-piedra_0_6">0</span></button>
      <button class="boton-contador" data-accion="produccion" data-producto="piedra_rechazo">Piedra Rechazo<span class="conteo" id="c-produccion-piedra_rechazo">0</span></button>
      <button class="boton-contador" data-accion="produccion" data-producto="piedra_bola">Piedra Bola<span class="conteo" id="c-produccion-piedra_bola">0</span></button>
    </div>
  </section>

  <section id="tab-stock">
    <div class="card">
      <h3>Stock de acopio (m³)</h3>
      <div id="lista-stock"></div>
    </div>
  </section>

  <section id="tab-horometro">
    <div class="card">
      <h3>Horómetro de hoy</h3>
      <label for="input-horometro-entrada">Horómetro entrada</label>
      <input type="number" id="input-horometro-entrada" step="0.1">
      <button class="accion" id="btn-horometro-entrada" style="margin-bottom:12px">Registrar entrada</button>
      <label for="input-horometro-salida">Horómetro salida</label>
      <input type="number" id="input-horometro-salida" step="0.1">
      <button class="accion" id="btn-horometro-salida">Registrar salida</button>
      <p id="horas-trabajadas" style="margin-top:12px; font-weight:600"></p>
    </div>
  </section>

  <section id="tab-insumos">
    <div class="card">
      <h3>Registrar uso de insumo</h3>
      <label for="select-insumo">Insumo</label>
      <select id="select-insumo">
        <option value="aceite_motor">Aceite Motor</option>
        <option value="aceite_hidraulico">Aceite Hidráulico</option>
        <option value="refrigerante">Refrigerante</option>
        <option value="agua_destilada">Agua Destilada</option>
        <option value="grasa">Grasa</option>
      </select>
      <label for="input-cantidad-insumo">Cantidad (litros/kg)</label>
      <input type="number" id="input-cantidad-insumo" step="0.1" min="0">
      <button class="accion" id="btn-registrar-insumo">Registrar</button>
    </div>
    <div class="card">
      <h3>Usado hoy</h3>
      <div id="lista-insumos-hoy"></div>
    </div>
  </section>
</main>

<nav>
  <button data-tab="camiones" class="activo"><span class="icono">🚛</span>Camiones</button>
  <button data-tab="produccion"><span class="icono">⚙️</span>Producción</button>
  <button data-tab="stock"><span class="icono">📦</span>Stock</button>
  <button data-tab="horometro"><span class="icono">⏱️</span>Horómetro</button>
  <button data-tab="insumos"><span class="icono">🛢️</span>Insumos</button>
</nav>

<script>
(function () {
  var CONFIG = { API_URL: 'PENDIENTE_URL_DEPLOY' };

  var LABELS_PIEDRA = {
    piedra_6_19: 'Piedra 6-19', piedra_19_38: 'Piedra 19-38', piedra_0_6: 'Piedra 0-6',
    piedra_6_12: 'Piedra 6-12', piedra_rechazo: 'Piedra Rechazo', piedra_bola: 'Piedra Bola'
  };
  var LABELS_INSUMO = {
    aceite_motor: 'Aceite Motor', aceite_hidraulico: 'Aceite Hidráulico',
    refrigerante: 'Refrigerante', agua_destilada: 'Agua Destilada', grasa: 'Grasa'
  };

  function mostrarMensaje(texto, tipo) {
    var el = document.getElementById('mensaje');
    el.textContent = texto;
    el.className = 'mensaje ' + tipo;
    el.style.display = 'block';
    setTimeout(function () { el.style.display = 'none'; }, 3000);
  }

  function llamarApi(accion, params) {
    var body = Object.assign({ action: accion }, params || {});
    return fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    }).then(function (resp) { return resp.json(); }).then(function (data) {
      if (data && data.error) throw new Error(data.error);
      return data;
    });
  }

  function cambiarTab(nombre) {
    document.querySelectorAll('section').forEach(function (s) { s.classList.remove('activa'); });
    document.getElementById('tab-' + nombre).classList.add('activa');
    document.querySelectorAll('nav button').forEach(function (b) {
      b.classList.toggle('activo', b.dataset.tab === nombre);
    });
  }

  function pintarHoy(datos) {
    document.getElementById('c-entrada_bruto').textContent = datos.camiones.entrada_bruto || 0;
    Object.keys(LABELS_PIEDRA).forEach(function (producto) {
      var elSalida = document.getElementById('c-salida-' + producto);
      if (elSalida) elSalida.textContent = (datos.camiones.salida && datos.camiones.salida[producto]) || 0;
      var elProd = document.getElementById('c-produccion-' + producto);
      if (elProd) elProd.textContent = (datos.produccion && datos.produccion[producto]) || 0;
    });
    var entradaInput = document.getElementById('input-horometro-entrada');
    var salidaInput = document.getElementById('input-horometro-salida');
    if (datos.horometro) {
      entradaInput.value = datos.horometro.horometroEntrada || '';
      salidaInput.value = datos.horometro.horometroSalida || '';
      entradaInput.disabled = !!datos.horometro.horometroEntrada;
      salidaInput.disabled = !!datos.horometro.horometroSalida;
      document.getElementById('horas-trabajadas').textContent = datos.horometro.horasTrabajadas
        ? 'Horas trabajadas hoy: ' + datos.horometro.horasTrabajadas
        : '';
    } else {
      entradaInput.disabled = false;
      salidaInput.disabled = false;
      document.getElementById('horas-trabajadas').textContent = '';
    }
    var listaInsumos = document.getElementById('lista-insumos-hoy');
    listaInsumos.innerHTML = '';
    Object.keys(LABELS_INSUMO).forEach(function (tipo) {
      var cantidad = (datos.insumos && datos.insumos[tipo]) || 0;
      var fila = document.createElement('div');
      fila.className = 'fila-stock';
      fila.innerHTML = '<span>' + LABELS_INSUMO[tipo] + '</span><span>' + cantidad + '</span>';
      listaInsumos.appendChild(fila);
    });
  }

  function pintarStock(stock) {
    var lista = document.getElementById('lista-stock');
    lista.innerHTML = '';
    Object.keys(LABELS_PIEDRA).forEach(function (producto) {
      if (!stock[producto]) return;
      var fila = document.createElement('div');
      fila.className = 'fila-stock';
      fila.innerHTML = '<span>' + LABELS_PIEDRA[producto] + '</span><span>' + stock[producto].actual + ' m³</span>';
      lista.appendChild(fila);
    });
  }

  function refrescarTodo() {
    return Promise.all([llamarApi('hoy'), llamarApi('stock')]).then(function (resultados) {
      pintarHoy(resultados[0]);
      pintarStock(resultados[1]);
    }).catch(function (err) {
      mostrarMensaje('No se pudo actualizar: ' + err.message, 'error');
    });
  }

  document.querySelectorAll('nav button').forEach(function (boton) {
    boton.addEventListener('click', function () { cambiarTab(boton.dataset.tab); });
  });

  document.querySelectorAll('[data-accion="camion-bruto"]').forEach(function (boton) {
    boton.addEventListener('click', function () {
      llamarApi('registrarCamion', { tipo: 'entrada_bruto' })
        .then(function () { mostrarMensaje('Entrada de bruto registrada', 'ok'); return refrescarTodo(); })
        .catch(function (err) { mostrarMensaje('Error: ' + err.message, 'error'); });
    });
  });

  document.querySelectorAll('[data-accion="camion-salida"]').forEach(function (boton) {
    boton.addEventListener('click', function () {
      var producto = boton.dataset.producto;
      llamarApi('registrarCamion', { tipo: 'salida', producto: producto })
        .then(function () { mostrarMensaje('Salida registrada: ' + LABELS_PIEDRA[producto], 'ok'); return refrescarTodo(); })
        .catch(function (err) { mostrarMensaje('Error: ' + err.message, 'error'); });
    });
  });

  document.querySelectorAll('[data-accion="produccion"]').forEach(function (boton) {
    boton.addEventListener('click', function () {
      var producto = boton.dataset.producto;
      llamarApi('registrarProduccion', { producto: producto })
        .then(function () { mostrarMensaje('Producción registrada: ' + LABELS_PIEDRA[producto], 'ok'); return refrescarTodo(); })
        .catch(function (err) { mostrarMensaje('Error: ' + err.message, 'error'); });
    });
  });

  document.getElementById('btn-horometro-entrada').addEventListener('click', function () {
    var valor = document.getElementById('input-horometro-entrada').value;
    if (!valor) { mostrarMensaje('Cargá un valor de horómetro', 'error'); return; }
    llamarApi('registrarHorometro', { momento: 'entrada', valor: valor })
      .then(function () { mostrarMensaje('Horómetro entrada registrado', 'ok'); return refrescarTodo(); })
      .catch(function (err) { mostrarMensaje('Error: ' + err.message, 'error'); });
  });

  document.getElementById('btn-horometro-salida').addEventListener('click', function () {
    var valor = document.getElementById('input-horometro-salida').value;
    if (!valor) { mostrarMensaje('Cargá un valor de horómetro', 'error'); return; }
    llamarApi('registrarHorometro', { momento: 'salida', valor: valor })
      .then(function () { mostrarMensaje('Horómetro salida registrado', 'ok'); return refrescarTodo(); })
      .catch(function (err) { mostrarMensaje('Error: ' + err.message, 'error'); });
  });

  document.getElementById('btn-registrar-insumo').addEventListener('click', function () {
    var tipo = document.getElementById('select-insumo').value;
    var cantidad = document.getElementById('input-cantidad-insumo').value;
    if (!cantidad || Number(cantidad) <= 0) { mostrarMensaje('Cargá una cantidad válida', 'error'); return; }
    llamarApi('registrarInsumo', { tipo: tipo, cantidad: cantidad })
      .then(function () {
        mostrarMensaje('Insumo registrado', 'ok');
        document.getElementById('input-cantidad-insumo').value = '';
        return refrescarTodo();
      })
      .catch(function (err) { mostrarMensaje('Error: ' + err.message, 'error'); });
  });

  document.getElementById('fecha-hoy').textContent = new Date().toLocaleDateString('es-AR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js');
  }

  refrescarTodo();
})();
</script>
</body>
</html>
```

- [ ] **Step 2: Replace `CONFIG.API_URL` with the real deployment URL from Task 2, Step 9**

Edit the line `var CONFIG = { API_URL: 'PENDIENTE_URL_DEPLOY' };` to use the actual `https://script.google.com/macros/s/<deploymentId>/exec` URL.

- [ ] **Step 3: Serve the file locally and verify in the browser preview**

```bash
cd ~/trituracion-repo && python3 -m http.server 4599
```
Open `http://localhost:4599/index.html` in the Browser pane (`preview_start` with that URL). Verify:
- The 5 tabs switch correctly on tap.
- Tapping "Entrada Material Bruto" and a salida/producción button increments the on-screen counter (confirms the real deployed backend round-trip works from the browser, not just curl).
- Registering a horómetro entrada disables that field and leaves salida enabled; registering salida shows "Horas trabajadas hoy".
- Registering an insumo clears the cantidad field and shows it under "Usado hoy".
Stop the server after verifying (`preview_stop`).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Add frontend PWA (index.html) wired to the deployed backend"
```

---

### Task 4: PWA installability (manifest, service worker, icons)

**Files:**
- Create: `scratchpad/generate_icons.py` (throwaway, not committed)
- Create: `icon-192.png`
- Create: `icon-512.png`
- Create: `manifest.json`
- Create: `service-worker.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: installable PWA assets referenced by `index.html` (Task 3).

- [ ] **Step 1: Generate placeholder icons with Python**

```python
# scratchpad/generate_icons.py — run once, not committed
from PIL import Image, ImageDraw, ImageFont

def make_icon(size, path):
    img = Image.new('RGB', (size, size), '#4a5568')
    draw = ImageDraw.Draw(img)
    margin = size // 8
    draw.rectangle([margin, margin, size - margin, size - margin], fill='#2d3748')
    try:
        font = ImageFont.truetype('arial.ttf', size // 2)
    except Exception:
        font = ImageFont.load_default()
    text = 'T'
    bbox = draw.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((size - w) / 2 - bbox[0], (size - h) / 2 - bbox[1]), text, fill='white', font=font)
    img.save(path)

make_icon(192, 'icon-192.png')
make_icon(512, 'icon-512.png')
```

Run: `python3 scratchpad/generate_icons.py` from `~/trituracion-repo` (writes `icon-192.png`/`icon-512.png` into the repo root — adjust the two output paths if run from elsewhere).

- [ ] **Step 2: Verify the icons were created correctly**

Run: `python3 -c "from PIL import Image; [print(p, Image.open(p).size) for p in ['icon-192.png','icon-512.png']]"`
Expected: `icon-192.png (192, 192)` and `icon-512.png (512, 512)`.

- [ ] **Step 3: Write `manifest.json`**

```json
{
  "name": "Trituración INGECO",
  "short_name": "Trituración",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#f4f5f7",
  "theme_color": "#4a5568",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 4: Write `service-worker.js`**

```javascript
const CACHE = 'trituracion-v1';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  if (url.includes('script.google.com') || url.includes('script.googleusercontent.com')) {
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
```

- [ ] **Step 5: Verify manifest + service worker load without console errors**

With the local server from Task 3 Step 3 still available (`python3 -m http.server 4599` from the repo root), reload `http://localhost:4599/index.html` in the Browser pane and check `read_console_messages` for errors. Expected: no errors; `navigator.serviceWorker.controller` becomes non-null after a reload (verify via `javascript_tool`: `navigator.serviceWorker.controller !== null`).

- [ ] **Step 6: Commit**

```bash
git add manifest.json service-worker.js icon-192.png icon-512.png
git commit -m "Add PWA manifest, service worker, and icons"
```

---

### Task 5: GitHub repo, push, and Pages

**Files:** none created — this task pushes the existing local repo (`C:\Users\Usuario\trituracion-repo`) to GitHub.

**Interfaces:**
- Consumes: the full working tree produced by Tasks 1–4.
- Produces: `https://marcoskatz-cmd.github.io/trituracion/` — the URL Task 6 links to.

- [ ] **Step 1: Ask the user for a classic GitHub PAT**

Ask Marcos for a **classic** Personal Access Token with `repo` scope and short expiration (per [[github-account]], fine-grained tokens have repeatedly failed for repo creation/content writes). Do not print or log the token; use it only for the two commands below in the current shell session.

- [ ] **Step 2: Create the GitHub repo via the API**

```bash
curl -s -X POST https://api.github.com/user/repos \
  -H "Authorization: token $GITHUB_PAT" \
  -H "Accept: application/vnd.github+json" \
  -d '{"name":"trituracion","description":"Panel de planta de trituración INGECO","private":false}'
```
Expected: JSON response with `"full_name":"marcoskatz-cmd/trituracion"`.

- [ ] **Step 3: Push the local repo**

Run from **PowerShell**, not Bash (per [[github-account]] — Bash's `git push` hangs waiting on `/dev/tty` when the credential helper needs to reauthenticate):

```powershell
cd C:\Users\Usuario\trituracion-repo
git remote add origin https://github.com/marcoskatz-cmd/trituracion.git
git branch -M main
git push -u origin main
```
If it hangs or fails with a credential prompt error, retry with the legacy helper:
```powershell
git -c credential.helper=wincred push -u origin main
```
Confirm the push actually landed (a `fatal:` from a previous GCM attempt can print even on a successful push):
```powershell
git ls-remote origin main
```

- [ ] **Step 4: Enable GitHub Pages**

```bash
curl -s -X POST https://api.github.com/repos/marcoskatz-cmd/trituracion/pages \
  -H "Authorization: token $GITHUB_PAT" \
  -H "Accept: application/vnd.github+json" \
  -d '{"source":{"branch":"main","path":"/"}}'
```
Expected: 201 with the Pages site info, or 409 if Pages auto-enabled already (safe to ignore).

- [ ] **Step 5: Verify the live URL**

Wait ~2 minutes, then:
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://marcoskatz-cmd.github.io/trituracion/
```
Expected: `200`. Open it in the Browser pane and confirm the same checks from Task 3 Step 3 (tabs switch, counters update against the live backend) now work from the public URL, not just localhost.

---

### Task 6: Hub integration

**Files:**
- Modify: `C:\Users\Usuario\apps\index.html` (the `APPS` array)
- Modify: `C:\Users\Usuario\apps\service-worker.js` (`CACHE` version bump)

**Interfaces:**
- Consumes: `https://marcoskatz-cmd.github.io/trituracion/` from Task 5.

- [ ] **Step 1: Pull the latest hub repo**

```bash
cd ~/apps && git pull origin main
```

- [ ] **Step 2: Add the tile to the `APPS` array in `index.html`**

Find the `APPS` array (per [[hub-apps-ingeco]], entries look like `{name, role, url, icon, color}`) and add:
```javascript
{ name: 'Trituración', role: 'Operario', url: 'https://marcoskatz-cmd.github.io/trituracion/', icon: '🪨', color: '#4a5568' }
```
Match the exact quoting/formatting style of the neighboring entries in the file.

- [ ] **Step 3: Bump the service worker cache version**

In `service-worker.js`, find `const CACHE = 'apps-ingeco-vN'` and increment `N` by one (per [[hub-apps-ingeco]], currently at v13, so this becomes v14).

- [ ] **Step 4: Verify the tile locally**

```bash
cd ~/apps && python3 -m http.server 4598
```
Open `http://localhost:4598/index.html` in the Browser pane, confirm the "Trituración" tile renders with the 🪨 icon and clicking it opens `https://marcoskatz-cmd.github.io/trituracion/` in a new tab/view. Stop the server after verifying.

- [ ] **Step 5: Commit and push (PowerShell, per the same `git push` gotcha as Task 5)**

```powershell
cd C:\Users\Usuario\apps
git add index.html service-worker.js
git commit -m "Add Trituración tile to the hub"
git push origin main
git ls-remote origin main
```

---

## Self-review notes

- **Spec coverage:** entrada de bruto (Task 3 tab Camiones), salida por 6 tipos (Task 3), producción por 4 tipos con stock (Task 2 `recalcularStock_` + Task 3 tab Producción), stock de solo lectura (Task 3 tab Stock), horómetro con bloqueo de campo ya cargado (Task 2 `registrarHorometro_` + Task 3), insumos de 5 tipos sin stock propio (Task 2 `registrarInsumo_`/`leerInsumosHoy_` + Task 3), sin login (no auth code anywhere), arquitectura ContentService-only (Task 2), `.claspignore` gotcha (Task 2 Step 5), deploy + hub (Tasks 5–6) — all covered.
- **Type consistency checked:** `PRODUCTOS_SALIDA`/`PRODUCTOS_ACOPIO`/`LABELS_PRODUCTO`/`TIPOS_INSUMO`/`LABELS_INSUMO` (Task 1) are used with identical names in `Sheets.gs`/`Code.gs` (Task 2) and mirrored (separately, since the frontend can't share GAS scope) in `index.html` (Task 3). Action names (`hoy`, `stock`, `registrarCamion`, `registrarProduccion`, `registrarHorometro`, `registrarInsumo`, `setup`) match exactly between `Code.gs`'s `_despachar_` and every `llamarApi(...)` call in `index.html`. Response field names (`camiones.entrada_bruto`, `camiones.salida`, `produccion`, `horometro.horometroEntrada/horometroSalida/horasTrabajadas`, `insumos`, and stock's `inicial/producido/entregado/actual`) match between `accionHoy_`/`accionStock_` and the `pintarHoy`/`pintarStock` frontend functions.
