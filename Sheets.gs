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
  var lastRow = hoja.getLastRow();
  if (lastRow < 2) return {};
  var datos = hoja.getRange(2, 1, lastRow - 1, 3).getValues();
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
      fecha: fila[1] instanceof Date ? fechaLocalISO_(fila[1]) : fila[1],
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

function deshacerUltimoMovimiento_(tipo, producto) {
  var hoja = getSpreadsheet_().getSheetByName('MOVIMIENTOS');
  var lastRow = hoja.getLastRow();
  if (lastRow < 2) return { deshecho: false };
  var hoyISO = hoyLocalISO_();
  var claveProducto = producto || '';
  var datos = hoja.getRange(2, 1, lastRow - 1, 5).getValues();
  for (var i = datos.length - 1; i >= 0; i--) {
    var fila = datos[i];
    var fechaISO = fila[1] instanceof Date ? fechaLocalISO_(fila[1]) : fila[1];
    if (fila[2] === tipo && fila[3] === claveProducto && esMismoDia(fechaISO, hoyISO)) {
      hoja.deleteRow(i + 2);
      return { deshecho: true, tipo: tipo, producto: claveProducto };
    }
  }
  return { deshecho: false };
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
  var lastRow = hoja.getLastRow();
  if (lastRow < 2) throw new Error('STOCK está vacía — correr initSheets primero');
  var datos = hoja.getRange(2, 1, lastRow - 1, 5).getValues();
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
  var lastRow = hoja.getLastRow();
  if (lastRow < 2) return {};
  var datos = hoja.getRange(2, 1, lastRow - 1, 5).getValues();
  var stock = {};
  datos.forEach(function (fila) {
    stock[fila[0]] = { inicial: fila[1], producido: fila[2], entregado: fila[3], actual: fila[4] };
  });
  return stock;
}

function fechaLocalISO_(fecha) {
  var dia = Utilities.formatDate(fecha, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return dia + 'T00:00:00.000Z';
}

function hoyLocalISO_() {
  return fechaLocalISO_(new Date());
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
  var hoyISO = hoyLocalISO_();
  var datos = hoja.getRange(2, 1, lastRow - 1, 4).getValues();
  var resultado = {};
  datos.forEach(function (fila) {
    var fechaISO = fila[1] instanceof Date ? fechaLocalISO_(fila[1]) : fila[1];
    if (!esMismoDia(fechaISO, hoyISO)) return;
    resultado[fila[2]] = (resultado[fila[2]] || 0) + fila[3];
  });
  return resultado;
}
