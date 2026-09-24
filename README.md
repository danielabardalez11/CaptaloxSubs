# Nerdearla · Subtítulos en vivo

MVP local para dos charlas con transcripción en el idioma original y traducción de inglés a español. Cada espectador elige sesión e idioma. Node.js + HTML/JavaScript, sin compilación ni base de datos. Licencia [MIT](LICENSE).

Entrega: **25 de septiembre de 2026, 15:00 UTC / 12:00 de Argentina**.

## Qué está comprobado

| Hito | Evidencia real | Pendiente |
| --- | --- | --- |
| Audio en vivo y transcripción ES/EN | La participante probó micrófono, subtítulos y texto durante audio en ambos idiomas | Puntuación imperfecta; latencia no caracterizada por palabra |
| Traducción EN→ES | Gemini real, voz sintética inglesa por fragmentos; contenido y última frase revisados | Probar traducción con micrófono humano en la nueva interfaz |
| Subtítulos visibles | Interfaz inicial validada por la participante | Verificar visualmente los nuevos paneles y la vista de espectador |
| Dos sesiones simultáneas | Dos conexiones reales, audios distintos, originales y traducciones completas; espectadores programáticos y cambio A→B | Ensayar ambos emisores y selectores en navegador |

**El servidor pasó la prueba de concurrencia real. La nueva interfaz todavía necesita una prueba manual; no se declara todo el MVP validado.** Evidencia detallada en [docs/VALIDATION.md](docs/VALIDATION.md).

## Arranque en Windows

Entorno utilizado: Node.js 24.19.0, npm 11.17.0. En otra computadora instalar Node.js 24 LTS y abrir esta carpeta en VS Code. En Terminal → Nueva terminal (PowerShell):

```powershell
npm.cmd ci
```

Si `.env` no existe, copiarlo una sola vez:

```powershell
Copy-Item .env.example .env
```

Crear una clave en [Google AI Studio → API keys](https://aistudio.google.com/api-keys), seleccionando o creando un proyecto. Para cuentas existentes, puede ser necesario importar el proyecto desde Projects; ver la [guía oficial de claves](https://ai.google.dev/gemini-api/docs/api-key).

Abrir `.env` en VS Code y completar `GEMINI_API_KEY`. **No pegar la clave en chats ni en código del navegador.** Los modelos tienen valores predeterminados en el código, por lo que el `.env` del primer experimento sigue funcionando sin cambios.

```dotenv
GEMINI_API_KEY=tu_clave_aqui
GEMINI_TRANSCRIBE_MODEL=gemini-3.5-transcribe-live
GEMINI_TEXT_MODEL=gemini-3.1-flash-lite
PORT=3000
AUDIENCE_PORT=3001
```

Ejecutar:

```powershell
npm.cmd test
npm.cmd start
```

- **Emisor / Operador:** <http://localhost:3000>
- **Espectador / Pantalla de escenario:** <http://localhost:3000/viewer>
- **Vista integrada para grabar demo (1–2 min):** <http://localhost:3000/demo>
- **Puerto seguro de audiencia / celular:** <http://localhost:3001/viewer> (con código QR generado en el emisor)
- Detener servidor: `Ctrl+C`. Para aplicar cambios de código o `.env`, detener y volver a ejecutar `npm.cmd start`.

Usamos `npm.cmd` para evitar conflictos con la política de ejecución de `npm.ps1`; no hace falta cambiar esa política. La clave se carga al arrancar. `git check-ignore .env` debe imprimir `.env`.

## Uso con micrófono

1. Abrir la vista de emisor en Chrome o Edge.
2. Elegir sesión A o B, idioma inglés o español y fuente Micrófono.
3. Para audio inglés, dejar marcada **Traducir del inglés al español**. En español se utiliza el original para ambas vistas; no se necesita otra traducción.
4. Iniciar y permitir el micrófono. Hablar naturalmente, con pausas breves entre frases. Se envía el audio a Google mientras la sesión está activa.
5. Abrir la vista de espectador, elegir la misma sesión y alternar **Español / Idioma original**.
6. Terminar. El micrófono se apaga y el servidor espera los últimos textos: 5 segundos para solo transcripción, 20 segundos para traducción.

No se traduce español a inglés: el mínimo requerido es inglés a español. En una charla española, “Idioma original” y “Español” muestran el mismo contenido.

Para comparar idiomas, los paneles del emisor muestran ambos textos. No se alinean artificialmente frase por frase: cada flujo puede tener diferentes límites y retardo. El espectador recibe únicamente los eventos del canal seleccionado; elegir idioma no crea nuevas llamadas a Gemini.

## Demo reproducible de dos sesiones en una computadora

Ya se generaron dos archivos ingleses en `recordings/` (ignorados por Git). Para regenerarlos en Windows con una voz inglesa instalada:

```powershell
.\scripts\make-demo-audio.ps1
```

En una computadora que bloquee scripts de PowerShell, usar archivos de audio propios desde el selector; no hace falta cambiar la política de ejecución para usar el MVP.

1. Abrir <http://localhost:3000/?session=A>. Elegir **Inglés → Archivo de audio**, seleccionar `recordings/demo-en.wav` y activar traducción.
2. Abrir otra pestaña en <http://localhost:3000/?session=B>. Elegir **Inglés → Archivo de audio**, seleccionar `recordings/demo-b-en.wav` y activar traducción.
3. Iniciar A y B con pocos segundos de diferencia. Ambos audios duran aproximadamente 21 segundos y se transmiten a velocidad real. El envío termina automáticamente al finalizar cada archivo.
4. Abrir dos espectadores: <http://localhost:3000/viewer?session=A> y <http://localhost:3000/viewer?session=B>. Alternar idioma y luego cambiar un espectador de sesión.
5. A habla de un taller a las diez para veinte participantes; B habla de una bicicleta azul y siete ciclistas. **Los contenidos no deben mezclarse.**
6. Esperar el cierre y comprobar las últimas frases: A agradece la participación; B anuncia el fin de la segunda sesión. No aprobar si se corta antes.

Se puede marcar **Escuchar el archivo durante el envío**. Para demostrar dos sesiones, conviene escuchar solo una para que no se superpongan en los parlantes. El envío de ambas continúa aunque una esté silenciada. No suspender la computadora ni las pestañas durante la prueba.

El navegador decodifica el archivo y entrega audio PCM a través del mismo AudioWorklet que se usa para el micrófono. Acepta formatos compatibles con el navegador, hasta 25 MB y 3 minutos. Esta entrada de archivo en navegador **todavía requiere prueba manual**; la entrada WAV desde terminal sí se probó con Gemini real.

## Prueba automatizada real de concurrencia

Requiere `.env` y los dos WAV generados arriba. **Hace llamadas reales a Google y consume cuota.** No se ejecuta como parte de `npm.cmd test`.

```powershell
npm.cmd run check:live
```

Levanta un servidor temporal en un puerto libre, conecta dos emisores y dos espectadores, espera que ambas conexiones Gemini estén listas y envía ambos audios simultáneamente. Comprueba texto y traducción durante el envío, contenido distintivo por sesión, últimas frases y cambio de canal. Guarda resultados en `results/live-check.json` (ignorado por Git). No activa el micrófono ni modifica un servidor que ya esté usando el puerto 3000.

Los chequeos automáticos de palabras y frases no sustituyen una revisión de fidelidad completa. En la ejecución registrada se revisaron además ambos textos completos.

Para un único WAV PCM mono de 16 bits y 16000 Hz:

```powershell
npm.cmd run transcribe -- recordings/demo-en.wav en
npm.cmd run transcribe -- recordings/demo-en.wav en translate
```

En modo `translate`, la CLI espera 20 segundos al terminar el audio; en modo transcripción, 5 segundos. Código `0`: hubo texto durante audio (y traducción cuando corresponde); `1`: error; `2`: no cumplió esas condiciones. La CLI individual no comprueba por sí sola que todas las palabras estén presentes.

## Arquitectura y decisiones

```text
Emisor A ─ PCM 16 kHz ─ servidor: sesión A ─ Gemini A
Emisor B ─ PCM 16 kHz ─ servidor: sesión B ─ Gemini B
                            │
                    textos por sesión
                            │
                 espectadores e idioma elegido
```

- Audio PCM mono de 16 bits, fragmentos de 100 ms, WebSockets. El navegador solicita 16000 Hz al motor de audio; la CLI valida el WAV y omite su cabecera.
- **Español / solo transcripción:** `gemini-3.5-transcribe-live`, con eventos provisionales y finales vía WebSocket bidireccional. [Guía oficial](https://ai.google.dev/gemini-api/docs/live-api/live-transcribe).
- **Inglés con traducción:** `gemini-3.5-transcribe-live` para transcripción continua, complementado por `CaptionSession` que traduce oraciones confirmadas a español con `gemini-3.1-flash-lite` vía REST con reintentos exponenciales y cola ordenada. Esto garantiza traducción completa de frases coherentes, números y nombres sin truncamientos.
- **Audiencia y celulares:** Servidor secundario en `AUDIENCE_PORT` (3001) para espectadores y código QR local generado dinámicamente en el panel del emisor. El puerto de audiencia solo expone la vista de visualización y `/watch`, protegiendo controles de administración y claves.
- Un emisor por sesión. Una segunda conexión al mismo canal es rechazada sin cortar la primera. Cada canal conserva hasta 30 frases y un fragmento actual; no hay base de datos ni grabación automática del audio.

## Métricas y limitaciones

`textBeforeEnd` y `translationBeforeEnd` indican que hubo salida antes de enviar fin de audio. `firstTextMs` y `firstTranslationMs` miden desde el primer fragmento enviado, incluyendo posible silencio inicial. **No miden retardo por palabra ni garantizan exactitud.**

La primera prueba simultánea con 5 segundos de espera cortó la salida de B. Se amplió la espera de traducción a 20 segundos y una repetición recibió ambos textos completos. Esto reduce el riesgo de cerrar demasiado pronto, pero no demuestra por sí solo la causa del fallo anterior ni garantiza sesiones largas. Los clientes deben revisar también las últimas frases.

El MVP admite pruebas de hasta 3 minutos por sesión. Si falla Gemini o se desconecta el emisor, se muestra el error; el usuario reinicia esa sesión. Los espectadores se reconectan automáticamente al servidor y recuperan el estado reciente. No hay recuperación de audio perdido ni reanudación automática del emisor.

## Pruebas locales

```powershell
npm.cmd test
```

Pruebas sin red externa ni clave: lectura WAV, PCM, AudioWorklet, protocolo simulado, errores y cancelación, separación de originales/traducciones, historial limitado, dos emisores y espectadores, cambio de canal, conflicto de emisor, cierre y fallo de una sesión sin cortar la otra, protección de archivos internos. La nueva interfaz requiere verificación visual adicional.

## Problemas frecuentes

- **Puerto ocupado:** detener el servidor anterior con `Ctrl+C`, o cambiar `PORT` y abrir el puerto correspondiente.
- **Falta clave:** completar `.env`, guardar y reiniciar. No compartir la clave para diagnosticar.
- **Micrófono bloqueado:** revisar permisos del sitio y Configuración de Windows → Privacidad y seguridad → Micrófono.
- **Sesión ocupada:** otro emisor usa ese canal. Terminarlo o elegir la otra sesión.
- **Error de cuota/modelo/permisos:** compartir solo el mensaje de error, sin clave. No todos los modelos aceptan esta configuración.
- **Texto incompleto o solo al final:** registrar el caso como fallo. No dar por aprobada la prueba porque haya conectado.
- **Signos de pregunta inesperados:** la puntuación la infiere el modelo. Una pausa puede influir, pero no se debe atribuir una causa sin comparar con el audio.

## Seguridad de red y escalabilidad

- **Separación de puertos por diseño**:
  - **Puerto 3000 (Operador/Emisor)**: Escucha únicamente en `127.0.0.1` (loopback). Nunca es accesible desde la red local ni expone la API key de Gemini.
  - **Puerto 3001 (Audiencia)**: Escucha en `0.0.0.0`. Solo expone `/viewer`, estilos y el WebSocket de solo lectura `/watch`. Cualquier intento de enviar audio, acceder a `/health`, `/sessions` o archivos internos devuelve `404 Not Found`.
- **Escalabilidad de audiencia**: Cada charla crea exactamente una conexión a Gemini, sin importar si hay 1 o 500 espectadores conectados al WebSocket local. La audiencia consume únicamente distribución local de texto, sin generar llamadas adicionales a la API ni consumir cuota de Google.

## Opciones gratuitas para compartir la vista de audiencia

Si se desea mostrar la vista de espectador en un celular o proyector remoto durante una demo:

1. **Red local Wi-Fi con código QR (Cero instalación)**:
   - Conectar el celular a la misma red Wi-Fi de la computadora.
   - En PowerShell como Administrador, habilitar la regla de firewall local para el puerto 3001:
     ```powershell
     .\scripts\audience-firewall.ps1
     ```
   - Escanear el código QR generado automáticamente en el panel del emisor (`http://localhost:3000`).
2. **Túnel temporal gratuito con Cloudflare (HTTPS público en 1 comando)**:
   - Sin registrar tarjeta ni crear cuenta:
     ```powershell
     cloudflared tunnel --url http://localhost:3001
     ```
   - Cloudflare genera una URL `https://*.trycloudflare.com` segura que dirige únicamente al visor de subtítulos.
3. **ngrok gratuito**:
   ```powershell
   ngrok http 3001
   ```

## Demo de 1–2 minutos: Guion paso a paso

Para grabar el video de evaluación en una sola pantalla sin cambiar de ventanas, abrir:
👉 **<http://localhost:3000/demo>**

- **0:00–0:15 (Introducción)**: Presentar el MVP: "Subtítulos en tiempo real para Nerdearla 2026. A la izquierda tenemos el panel de control del emisor y a la derecha la pantalla de la audiencia o escenario."
- **0:15–0:40 (Sala A: Audio y traducción)**: En el Emisor A, seleccionar Archivo (`demo-en.wav`) o Micrófono con 'Traducir al español' activo y pulsar **Iniciar sesión**. Mostrar cómo llegan las frases originales y la traducción inmediata al español en el panel de audiencia.
- **0:40–1:10 (Sala B y cambio de sala)**: Cambiar a Sala B (`demo-b-en.wav`) e iniciar. En el visor de audiencia, cambiar de Sala A a B: demostrar que no se mezclan los temas (taller vs bicicleta) y alternar entre 'Español' e 'Idioma original'.
- **1:10–1:30 (Cierre y arquitectura)**: Pulsar **Terminar**. Destacar: API Key protegida en el servidor, puerto de audiencia 3001 aislado con QR para celulares y 100% operativo en el free-tier de Gemini (presupuesto $0).
