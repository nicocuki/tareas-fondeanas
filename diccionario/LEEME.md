# Diccionario de La Mecha

`es_AR.dic` y `es_AR.aff` son el corrector ortográfico de español de Argentina del proyecto
**RLA-ES** (Recursos Lingüísticos Abiertos del Español), tal como lo distribuye LibreOffice:
https://github.com/LibreOffice/dictionaries/tree/master/es (versión del 22/08/2026).

RLA-ES se publica con triple licencia (GPL 3, LGPL 3 o MPL 1.1, a elección). Acá se usa bajo la
**MPL 1.1** (texto completo en `MPL-1.1.txt`). La lista `public/mecha/palabras.txt` es una obra
derivada de esos archivos y se distribuye con la misma licencia.

`agregadas.txt` son palabras que el corrector no trae y que sumamos nosotros (lunfardo y comidas).

Para regenerar `public/mecha/palabras.txt` y `src/mecha/syllables.js`:

```bash
npm run diccionario
```
