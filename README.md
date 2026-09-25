# CaptaloxSubs · Subtítulos y Traducción en Tiempo Real para Nerdearla 2026

CaptaloxSubs es una solución integral de subtitulado y traducción simultánea en vivo palabra por palabra diseñada para conferencias tecnológicas como **Nerdearla 2026**. Permite transcribir y traducir en tiempo real ponencias en inglés o español con latencia mínima, utilizando los modelos de última generación **Google Gemini Live**.

---

## Características Principales

- **Streaming Palabra por Palabra (Ultra-Low Latency)**: Utiliza `gemini-3.5-live-translate-preview` y `gemini-3.5-transcribe-live` mediante WebSockets bidireccionales nativos con VAD de 100 ms. Las palabras aparecen en pantalla a medida que se pronuncian.
- **Traducción Bidireccional Completa**:
  - 🇺🇸 Inglés ➔ 🇪🇸 Español
  - 🇪🇸 Español ➔ 🇬🇧 Inglés
- **Fuentes de Audio Flexibles**:
  - **Pestaña de Chrome (YouTube / Streaming)**: Captura directa de audio de pestañas mediante `getDisplayMedia` sin micrófonos ni cables.
  - **Micrófono / Entrada de Línea**: Soporte para micrófonos de ambiente o señales de mesa de sonido.
  - **Archivos WAV**: Reproducción y prueba con archivos de audio a velocidad real.
- **Arquitectura de Doble Puerto (Seguridad y Concurrencia)**:
  - **Puerto 3000 (Operador/Emisor)**: Panel de control administrativo y gestión de salas.
  - **Puerto 3001 (Audiencia/Público)**: Visor de solo lectura para los asistentes, sin controles de emisor ni exposición de claves.
- **Acceso Móvil con Código QR**: Generación dinámica de QR en el panel para que los asistentes escaneen y lean los subtítulos en sus teléfonos en la misma red Wi-Fi.
- **Modos Visuales**:
  - **Vista Escenario / Fullscreen**: Maximiza los subtítulos para pantallas gigantes y proyectores de auditorio.
  - **Overlay para OBS / vMix**: Subtítulos limpios con fondo transparente (`/viewer?session=A&overlay=1`) para incrustar en transmisiones en vivo.
  - **Vista Demo Todo-en-Uno**: Vista dividida emisor + audiencia en una sola pantalla (`/demo`) ideal para grabar videos de demostración.
- **Exportación**: Descarga inmediata de transcripciones completas en formatos `.txt` y `.srt` sincronizado.
- **Presupuesto Cero ($0)**: 100% compatible con el Free Tier de Google AI Studio.

---

## Arquitectura

```text
Orador / Video ── PCM 16 kHz ── Servidor Node.js ── WebSocket Bidireccional ── Gemini Live API
                                       │
                      Difusión local instantánea
                                       ├─ Emisor (localhost:3000)
                                       ├─ Audiencia Celulares (Wi-Fi: 3001)
                                       └─ Pantallas / OBS Overlay (3001)
```

---

## Inicio Rápido

### 1. Requisitos
- Node.js v20+ o v24+
- Clave de API de Google Gemini (gratuita en [Google AI Studio](https://aistudio.google.com/))

### 2. Instalación
```powershell
git clone https://github.com/danielabardalez11/CaptaloxSubs.git
cd CaptaloxSubs
npm install
```

### 3. Configuración
Copia el archivo de ejemplo y agrega tu clave de Gemini:
```powershell
cp .env.example .env
```
Edita `.env`:
```env
GEMINI_API_KEY=tu_api_key_aqui
GEMINI_TRANSCRIBE_MODEL=gemini-3.5-transcribe-live
GEMINI_TRANSLATE_MODEL=gemini-3.5-live-translate-preview
PORT=3000
AUDIENCE_PORT=3001
ROOMS=A,B
TRANSLATION_PROVIDER=gemini
SPEECH_PROVIDER=gemini
```

### 4. Ejecución
```powershell
npm start
```
- **Panel del Emisor:** [http://localhost:3000](http://localhost:3000)
- **Visor de la Audiencia:** [http://localhost:3000/viewer](http://localhost:3000/viewer) (o puerto `3001` para móviles en Wi-Fi)
- **Vista Demo Todo-en-Uno (Consola Multisal):** [http://localhost:3000/demo](http://localhost:3000/demo)

---

### 5. Cómo Ejecutar y Probar Dos Sesiones en Simultáneo (Salas A y B)

CaptaloxSubs soporta oradores y conferencias concurrentes en simultáneo con aislamiento total (cero interferencia o mezcla de audio/subtítulos entre salas). 

Se puede probar de dos formas inmediatas:

#### Opción A: Vista Unificada (`/demo`) — La más rápida
1. Abrir en el navegador [http://localhost:3000/demo](http://localhost:3000/demo).
2. Hacer clic en el botón superior **"Ambas salas"** para desplegar el emisor de la **Sala A** y de la **Sala B** en paralelo junto al visor de subtítulos.
3. En la **Sala A**: Seleccionar fuente **Archivo** y cargar `recordings/demo-en.wav`.
4. En la **Sala B**: Seleccionar fuente **Archivo** y cargar `recordings/demo-b-en.wav`.
5. Presionar **Iniciar** en ambas salas:
   - Ambas sesiones transcriben y traducen al español en tiempo real en paralelo.
   - En el visor de audiencia de la derecha, cambiar de **Sala A** a **Sala B** para comprobar que cada sala recibe exclusivamente su propia transmisión sin mezcla de contenido.

#### Opción B: Múltiples Pestañas / Pantallas
1. **Emisor 1**: Abrir [http://localhost:3000/?session=A](http://localhost:3000/?session=A) (o micrófono del orador A / audio de YouTube).
2. **Emisor 2**: Abrir [http://localhost:3000/?session=B](http://localhost:3000/?session=B) (cargar `recordings/demo-b-en.wav` o micrófono B).
3. **Audiencia Sala A**: Abrir [http://localhost:3000/viewer?session=A](http://localhost:3000/viewer?session=A).
4. **Audiencia Sala B**: Abrir [http://localhost:3000/viewer?session=B](http://localhost:3000/viewer?session=B).
5. Iniciar la transmisión en ambas: los asistentes de la sala A y B leen los subtítulos sincronizados de su respectivo orador independientemente.

---

### 6. Pruebas Unitarias y Validación de Concurrencia
```powershell
npm test
```
Ejecuta las **38 pruebas unitarias automatizadas** (100% passing), incluyendo:
- Aislamiento entre múltiples salas paralelas (`A`, `B`, `C`, etc.).
- Concurrencia real y separación estricta de eventos y WebSocket streams.
- Tolerancia a desconexiones y exportación de transcripciones.

