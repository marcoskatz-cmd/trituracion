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
