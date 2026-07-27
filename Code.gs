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
