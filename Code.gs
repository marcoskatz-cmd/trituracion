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
    case 'hoy':
      return accionHoy_();
    case 'stock':
      return accionStock_();
    case 'registrarCamion':
      return conLock_(function () { return accionRegistrarCamion_(params); });
    case 'registrarProduccion':
      return conLock_(function () { return accionRegistrarProduccion_(params); });
    case 'deshacerUltimo':
      return conLock_(function () { return accionDeshacerUltimo_(params); });
    case 'registrarRemanenteBruto':
      return conLock_(function () { return accionRegistrarRemanenteBruto_(params); });
    case 'registrarHorometro':
      return conLock_(function () { return accionRegistrarHorometro_(params); });
    case 'registrarInsumo':
      return conLock_(function () { return accionRegistrarInsumo_(params); });
    case 'registrarObservacion':
      return conLock_(function () { return accionRegistrarObservacion_(params); });
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
  var hoyISO = hoyLocalISO_();
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
  var producto = tipo === 'entrada_bruto' ? 'material_bruto' : (params.producto || null);
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
  if (tipo === 'entrada_bruto') {
    recalcularStock_('material_bruto');
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

function accionDeshacerUltimo_(params) {
  var tipo = params.tipo;
  var producto = tipo === 'entrada_bruto' ? 'material_bruto' : (params.producto || null);
  if (tipo !== 'entrada_bruto' && tipo !== 'salida' && tipo !== 'produccion') {
    throw new Error('Tipo de movimiento inválido: ' + tipo);
  }
  if (tipo === 'salida' && PRODUCTOS_SALIDA.indexOf(producto) === -1) {
    throw new Error('Producto de salida inválido: ' + producto);
  }
  if (tipo === 'produccion' && PRODUCTOS_ACOPIO.indexOf(producto) === -1) {
    throw new Error('Producto de producción inválido: ' + producto);
  }
  var resultado = deshacerUltimoMovimiento_(tipo, producto);
  if (resultado.deshecho) {
    var esAcopioAfectado =
      (tipo === 'salida' && PRODUCTOS_ACOPIO.indexOf(producto) !== -1) ||
      tipo === 'produccion' ||
      tipo === 'entrada_bruto';
    if (esAcopioAfectado) {
      recalcularStock_(producto);
    }
  }
  return resultado;
}

function accionRegistrarRemanenteBruto_(params) {
  var remanente = Number(params.remanente);
  if (!isFinite(remanente) || remanente < 0) {
    throw new Error('Remanente de material bruto inválido');
  }
  return registrarRemanenteBruto_(remanente);
}

function accionRegistrarHorometro_(params) {
  var valor = Number(params.valor);
  if (!isFinite(valor)) {
    throw new Error('Valor de horómetro inválido');
  }
  return registrarHorometro_(params.momento, valor);
}

function accionRegistrarInsumo_(params) {
  if (TIPOS_INSUMO.indexOf(params.tipo) === -1) {
    throw new Error('Tipo de insumo inválido: ' + params.tipo);
  }
  var cantidad = Number(params.cantidad);
  if (!isFinite(cantidad) || cantidad <= 0) {
    throw new Error('Cantidad de insumo inválida');
  }
  return registrarInsumo_(params.tipo, cantidad);
}

function accionRegistrarObservacion_(params) {
  var texto = String(params.observacion || '').trim();
  if (!texto) {
    throw new Error('La observación no puede estar vacía');
  }
  return registrarObservacion_(texto);
}
