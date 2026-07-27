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
  assert.deepStrictEqual(JSON.parse(JSON.stringify(resultado.salida)), { piedra_6_19: 2 });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(resultado.produccion)), { piedra_bola: 1 });
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
