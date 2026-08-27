# Sale Type Generator

Herramienta local para generar fondos con tipografia cinetica en perspectiva 3D y exportarlos como MP4.

## Uso

```bash
npm install
npm start
```

Abre la URL que imprime el servidor, normalmente:

```text
http://localhost:4177
```

El boton `Exportar MP4` renderiza frames desde el canvas y los codifica con `ffmpeg`.
Los archivos finales quedan en:

```text
exports/
```

## Controles

- Uno o varios textos configurables, separados con `|`.
- Composiciones: Tunel, Filas, Columnas y Reticula.
- Modos de movimiento: Avance, Pulso, Giro y Onda.
- Velocidad, espaciado, tamano y perspectiva ajustables.
- Fondo solido o gradiente y colores editables.
- Exportacion MP4 a 30 fps mediante `ffmpeg`.

## Requisitos

- Node.js local y dependencias instaladas con `npm install` en esta carpeta.
- `ffmpeg` disponible en el sistema.
