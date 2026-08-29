# Sale Type Generator

Herramienta web para generar fondos con tipografia cinetica en perspectiva 3D y exportarlos como MP4.

## Version publica

https://tataportal.github.io/visualtools-bgmaker/

## Uso

```bash
npm install
npm start
```

Abre la URL que imprime el servidor, normalmente:

```text
http://localhost:4177
```

El boton `Exportar MP4` renderiza y codifica el archivo directamente en el navegador.
No requiere servidor de exportacion ni sube el contenido a terceros.

## Controles

- Uno o varios textos configurables, separados con `|`.
- Composiciones: Tunel, Filas, Columnas y Reticula.
- Randomizador que conserva la composicion seleccionada y los ajustes editoriales.
- Modos de movimiento: Avance, Pulso, Giro y Onda.
- Rangos amplios para velocidad, espaciado, tamano y perspectiva.
- Controles procedurales de cantidad, variacion, amplitud, frecuencia, torsion y semilla.
- Punto de fuga X/Y y origen de profundidad Z configurable para el tunel.
- Fondo solido o gradiente y colores editables.
- Exportacion MP4 H.264 a 30 fps en el navegador.

## Requisitos

- Para usar la version publica: Chrome o Safari actualizado.
- Para desarrollo local: Node.js y dependencias instaladas con `npm install`.
