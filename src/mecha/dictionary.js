// Carga del diccionario en el navegador: se baja una sola vez (~1,4 MB comprimido) y queda en memoria.
import { createDictionary } from './words.js';

let loading = null;

export function loadDictionary() {
  loading ||= fetch('/mecha/palabras.txt')
    .then((res) => {
      if (!res.ok) throw new Error('No se pudo bajar el diccionario.');
      return res.text();
    })
    .then(createDictionary)
    .catch((error) => {
      loading = null;
      throw error;
    });
  return loading;
}
