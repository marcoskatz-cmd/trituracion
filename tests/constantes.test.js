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
