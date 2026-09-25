# CaptaloxSubs · Whitepaper Operativo y Guía Técnica de Uso

**Subtitulado y Traducción Simultánea en Tiempo Real para Conferencias y Eventos Masivos**  
*Desarrollado para Nerdearla 2026 / Vibeathon*  
*Autora: Daniela Bardalez*

---

## 1. Resumen Ejecutivo y Propósito

En conferencias tecnológicas de escala masiva como **Nerdearla**, oradores de todo el mundo exponen conceptos complejos, terminología técnica avanzada y código fuente en vivo. Esto crea dos barreras críticas:
1. **Barrera de Idioma y Cognitiva**: La audiencia local o internacional suele perder el hilo ante oratorias rápidas en inglés o español con alta densidad técnica.
2. **Barrera de Accesibilidad**: La falta de subtitulado en vivo excluye a personas con discapacidad auditiva, ya que contratar estenotipistas humanos para múltiples salas simultáneas resulta inviable en términos de costo logístico.
3. **El obstáculo de la latencia en IA tradicional**: Los subtituladores basados en LLMs comunes operan por "bloques de oraciones" (esperan a que el orador haga una pausa larga, transcriben el bloque y luego lo mandan a traducir). Esto genera demoras de entre $5$ y $15$ segundos, rompiendo la sincronización con las diapositivas y la atención del público.

**CaptaloxSubs** resuelve este problema entregando subtitulado y traducción simultánea palabra por palabra con latencia imperceptible ($\approx 200 - 700\text{ ms}$), operando sobre la **Google Gemini Multimodal Live API** con presupuesto cero ($0 en Free Tier) y arquitectura multisala aislada.

---

## 2. Arquitectura del Sistema

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          FUENTES DE AUDIO                              │
│   • Micrófono / Consola    • Pestaña Chrome (YouTube)   • Archivo WAV  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Web Audio API
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               FRONTEND DSP: AudioWorkletProcessor                      │
│     Conversión a PCM Little-Endian 16-bit 16kHz (Ráfagas de 100 ms)    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ WebSocket Local (ws://)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     BACKEND ENGINE (Node.js)                           │
│   • Control de Sesión Aislada (Room Manager)                           │
│   • Acumulador y clasificador de tokens interinos vs confirmados       │
└─────────────────┬──────────────────────────────────┬───────────────────┘
                  │                                  │
    Persistent WS │ Gemini Live                      │ Local Pub/Sub
                  ▼                                  ▼
┌───────────────────────────────────┐    ┌───────────────────────────────┐
│       GOOGLE GEMINI LIVE API      │    │  DISTRIBUCIÓN Y CONSUMO       │
│ • gemini-3.5-live-translate       │    │ • Operador (localhost:3000)   │
│ • gemini-3.5-transcribe-live      │    │ • Audiencia Wi-Fi (Port 3001) │
│ • VAD calibrado a 100 ms          │    │ • Pantalla / OBS Overlay      │
└───────────────────────────────────┘    └───────────────────────────────┘
```

### Componentes Clave:
1. **DSP en Render Thread (`pcm-worklet.js`)**: Captura audio crudo y realiza downsampling/normalización sin bloquear la interfaz de usuario.
2. **WebSocket Bidireccional (`src/live.js` / `src/caption-session.js`)**: Mantiene un socket persistente de baja latencia con Google Gemini Live.
3. **Arquitectura de Doble Puerto**:
   - **Puerto 3000 (Operador/Emisor)**: Permite administrar salas, iniciar/detener transmisiones y configurar fuentes de audio.
   - **Puerto 3001 (Audiencia)**: Servidor desacoplado de solo lectura accesible para los asistentes vía Wi-Fi local mediante código QR. Protege las claves de API y configuraciones internas.

---

## 3. Requisitos y Puesta en Marcha

### Requisitos del Sistema
- **Node.js**: v20 o superior (recomendado v24 LTS).
- **Navegador**: Google Chrome, Edge o Chromium (soporte completo de `AudioWorklet` y `getDisplayMedia`).
- **Clave de Gemini API**: Gratuita desde [Google AI Studio](https://aistudio.google.com/).
- **Red Local (Opcional para QR de audiencia)**: Estar en la misma red Wi-Fi para que los asistentes escaneen el código desde sus teléfonos móviles.

### Instalación Rápida
1. Clonar el repositorio:
   ```bash
   git clone https://github.com/danielabardalez11/CaptaloxSubs.git
   cd CaptaloxSubs
   ```
2. Instalar dependencias:
   ```bash
   npm install
   ```
3. Configurar variables de entorno en `.env`:
   ```env
   GEMINI_API_KEY=tu_api_key_de_google_ai_studio
   GEMINI_TRANSCRIBE_MODEL=gemini-3.5-transcribe-live
   GEMINI_TRANSLATE_MODEL=gemini-3.5-live-translate-preview
   GEMINI_TEXT_MODEL=gemini-3.5-flash-lite
   PORT=3000
   AUDIENCE_PORT=3001
   ROOMS=A,B
   TRANSLATION_PROVIDER=gemini
   SPEECH_PROVIDER=gemini
   ```
4. Iniciar el servidor:
   ```bash
   npm start
   ```

---

## 4. Guía Operativa Paso a Paso

### 4.1. Panel de Control del Emisor / Operador
Acceder a: `http://localhost:3000`

1. **Selección de Sala**: En el selector superior, elegir la sala correspondiente (`Sala A`, `Sala B`, etc.).
2. **Selección de Idiomas**:
   - **Idioma de Entrada**: Seleccionar `Inglés` o `Español`.
   - **Traducción en Vivo**: Activar la casilla de traducción si se desea traducir simultáneamente (Inglés ➔ Español o Español ➔ Inglés).
3. **Selección de Fuente de Audio**:
   - **Pestaña de Chrome (YouTube / Streaming / Videollamada)**:
     - Ideal para oradores remotos o videos de demostración.
     - Al presionar **Iniciar**, el navegador mostrará una ventana emergente: seleccionar la pestaña que emite el video y marcar la casilla **"Compartir audio de la pestaña"**.
   - **Micrófono / Entrada de Línea**:
     - Ideal para el atril del orador, micrófono de solapa o salida de la consola de audio del auditorio.
   - **Archivo WAV Local**:
     - Ideal para ensayos y comprobaciones offline. Seleccionar `demo-en.wav` o `demo-b-en.wav` ubicados en la carpeta `recordings/`.
4. **Inicio de Transmisión**:
   - Presionar **Iniciar Captura**. El indicador de estado pasará a color verde y los subtítulos comenzarán a fluir palabra por palabra.
5. **Finalización y Exportación**:
   - Presionar **Detener**.
   - Se puede descargar la transcripción completa inmediatamente haciendo clic en **Exportar TXT** o **Exportar SRT** (formato estándar de subtítulos temporizados).

---

### 4.2. Acceso y Experiencia de la Audiencia (Celulares y QR)
El sistema genera dinámicamente un código QR en el panel del operador vinculado a la IP de la red Wi-Fi local:

1. Los asistentes escanean el código QR proyectado o impreso con la cámara de su teléfono móvil.
2. Se abre automáticamente el visor en el puerto seguro: `http://<IP-LOCAL>:3001/viewer?session=A`.
3. **Características del Visor de Audiencia**:
   - **Cero Instalación**: Funciona 100% en el navegador web del smartphone (iOS Safari, Android Chrome).
   - **Selector de Idioma**: El usuario puede alternar entre ver el texto original transcripto o la traducción en tiempo real.
   - **Tipografía Dinámica y Accesible**: Contraste optimizado para lectura en entornos con poca luz.

---

### 4.3. Modos de Visualización para Escenario y Transmisión

CaptaloxSubs incluye modos diseñados para la infraestructura técnica de conferencias:

* **Modo Auditorio / Pantalla Gigante**:
  - URL: `http://localhost:3000/viewer?session=A`
  - Presionar la tecla `F11` para pantalla completa. Muestra subtítulos en tamaño ampliado con tipografía de alto contraste legible desde cualquier punto del auditorio.
* **Modo OBS / vMix (Overlay Transparente)**:
  - URL: `http://localhost:3000/viewer?session=A&overlay=1`
  - Añadir como **Browser Source** (Fuente de Navegador) en OBS Studio o vMix. El fondo es transparente, permitiendo superponer los subtítulos directamente sobre la señal de cámara o la captura de diapositivas en transmisiones por Twitch, YouTube o streaming oficial.

---

## 5. Operación de Múltiples Sesiones Simultáneas (Salas A y B)

El sistema soporta escenarios paralelos sin interferencia entre transmisiones:

### Opción 1: Consola Demo Todo-en-Uno (`/demo`)
Diseñada específicamente para monitoreo de cabina o demostraciones a jurados:
1. Abrir: `http://localhost:3000/demo`.
2. Hacer clic en **"Ambas salas"**. La pantalla se dividirá mostrando el panel de control de la Sala A, el panel de control de la Sala B y el visor de audiencia en un único monitor.
3. En Sala A cargar `recordings/demo-en.wav` y dar Iniciar.
4. En Sala B cargar `recordings/demo-b-en.wav` y dar Iniciar.
5. En el visor de la derecha, cambiar entre Sala A y Sala B para constatar que cada una procesa y traduce su propio flujo de audio de forma aislada.

### Opción 2: Computadoras u Operadores Independientes
- El operador de la **Sala A** abre `http://<IP>:3000/?session=A` con el micrófono del Auditorio Principal.
- El operador de la **Sala B** abre `http://<IP>:3000/?session=B` con el micrófono del Auditorio Secundario.
- Los asistentes de cada sala escanean su respectivo código QR y reciben exclusivamente los subtítulos de su conferencia.

---

## 6. Verificación y Suite de Pruebas

Para garantizar la confiabilidad antes de un evento en vivo, se puede ejecutar la suite de pruebas automatizadas:

```powershell
npm test
```

### Cobertura de las 38 Pruebas:
- **DSP y AudioWorklet**: Validación de paquetes PCM de 100 ms, mezcla de canales y limitación de amplitud.
- **Resiliencia de Red**: Reintentos automáticos ante errores 503/429, timeouts de setup y sanitización de credenciales.
- **Aislamiento Multisesión**: Verificación estricta de que los eventos de la Sala A no se filtran a la Sala B ni a los espectadores de otras salas.
- **Seguridad**: Comprobación de que el puerto de audiencia (3001) jamás expone claves de API, rutas internas ni endpoints de administración.

---

## 7. Preguntas Frecuentes y Diagnóstico Rápido

* **¿Qué pasa si se corta la conexión a internet momentáneamente?**  
  El socket de captura intentará reconectar automáticamente. En el visor de audiencia, el último texto confirmado permanece visible para no interrumpir abruptamente la lectura.
* **¿Por qué la traducción aparece tan rápido si el orador no terminó la frase?**  
  Gracias a la calibración del VAD de Gemini a 100 ms y al pipeline de streaming de tokens interinos, el sistema traduce cláusulas en curso sin esperar pausas gramaticales completas.
* **¿Cómo silenciar el audio de prueba si uso archivos WAV?**  
  En el panel del emisor hay una casilla para habilitar o deshabilitar la preescucha local; desactivarla no afecta el envío del audio al motor de IA.
