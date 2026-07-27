const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGasFiles } = require('./helpers/loadGas');

function extraerObjetoLiteral(html, nombreVariable) {
  var marcador = 'var ' + nombreVariable + ' = {';
  var inicio = html.indexOf(marcador);
  if (inicio === -1) {
    throw new Error('No se encontró "' + marcador + '" en index.html');
  }
  var cursor = inicio + marcador.length;
  var profundidad = 1; // ya consumimos la '{' de apertura
  var fin = -1;
  for (var i = cursor; i < html.length; i++) {
    if (html[i] === '{') profundidad++;
    if (html[i] === '}') {
      profundidad--;
      if (profundidad === 0) {
        fin = i;
        break;
      }
    }
  }
  if (fin === -1) {
    throw new Error('No se encontró el cierre de "' + nombreVariable + '"');
  }
  var contenido = html.slice(cursor, fin);
  // eslint-disable-next-line no-new-func
  return Function('return {' + contenido + '};')();
}

test('LABELS_PIEDRA de index.html coincide con LABELS_PRODUCTO de Constantes.gs', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const gas = loadGasFiles(['Constantes.gs']);
  const labelsPiedra = extraerObjetoLiteral(html, 'LABELS_PIEDRA');
  // gas.LABELS_PRODUCTO viene de un vm.Context distinto (realm distinto):
  // deepStrictEqual lo trataría como "no reference-equal" pese a tener la
  // misma estructura, por eso se compara vía JSON.stringify (mismo patrón
  // que tests/logica.test.js).
  assert.deepStrictEqual(JSON.parse(JSON.stringify(labelsPiedra)), JSON.parse(JSON.stringify(gas.LABELS_PRODUCTO)));
});

test('LABELS_INSUMO de index.html coincide con LABELS_INSUMO de Constantes.gs', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const gas = loadGasFiles(['Constantes.gs']);
  const labelsInsumo = extraerObjetoLiteral(html, 'LABELS_INSUMO');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(labelsInsumo)), JSON.parse(JSON.stringify(gas.LABELS_INSUMO)));
});
