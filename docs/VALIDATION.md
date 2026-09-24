# Registro de validación

## 24/09/2026 — base local

- Carpeta inicial con `Microsoft/Windows`: conservada; no había aplicación.
- Windows, Node 24.19.0, npm 11.17.0. Dependencia `ws` 8.21.3 instalada; auditoría inicial sin vulnerabilidades reportadas.
- Primer experimento: 11 pruebas locales aprobadas, servidor iniciado y `.env` ignorado por Git.

## Evidencia aportada por la participante — micrófono e interfaz inicial

La participante informó que ambas pruebas funcionaron bien y compartió métricas y transcripciones. No se recibió ni escuchó una grabación; la evaluación de fidelidad se basa en su comprobación.

| Idioma | Audio (s) | Bytes | Fragmentos | Provisionales | Finales | Primer texto (ms) | Texto durante audio |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Español | 38.024 | 1216768 | 381 | 38 | 6 | 9777 | Sí |
| Inglés | 40.384 | 1292288 | 404 | 1 | 6 | 6192 | Sí |

Observación: una frase inglesa declarativa fue puntuada como pregunta. Causa no determinada; posible influencia de la pausa, sin confirmación. No eliminar signos de pregunta automáticamente: alteraría preguntas legítimas. El objetivo inicial de primer texto en menos de 3 segundos no quedó demostrado; estas métricas incluyen silencio antes de hablar.

**Validado por la participante:** captura de micrófono, transcripción original ES/EN durante audio y subtítulos visibles en la primera interfaz. No extrapolar esta validación a los selectores y paneles nuevos.

## Traducción real con voz sintética inglesa

- Archivo generado localmente con una voz inglesa de Windows; PCM mono 16 kHz, 21.1 s. Se envió a velocidad real a Gemini, sin activar el micrófono.
- La primera configuración de la guía WebSocket fue rechazada por ubicación inválida de los campos de transcripción. Se corrigieron según la referencia de API y se volvió a probar.
- Modelo: `gemini-3.5-live-translate-preview`; original a los 3370 ms y traducción a los 3535 ms, ambos durante audio. Texto completo, incluidos “10” y “20 participantes”.
- Se comprobó que las salidas son fragmentos incrementales, no frases finales completas. La aplicación ahora concatena cada flujo de forma independiente.

## Dos sesiones reales simultáneas

Se conectaron dos emisores y dos espectadores programáticos a un servidor temporal. Ambas conexiones Gemini estuvieron listas antes de enviar dos WAV ingleses distintos en paralelo. A: conferencia/taller; B: bicicleta/ciclistas.

**Primer ensayo:** la salida de B quedó truncada aunque hubo traducción durante audio. La comprobación inicial de marcadores era insuficiente; se agregó una exigencia sobre la última frase de ambos idiomas en ambos canales. Ese ensayo NO cuenta como validación completa.

**Segundo ensayo, 2026-09-24 20:19:02 UTC:** cierre ampliado de 5 a 20 segundos para traducción; prueba completa aprobada. No se atribuye causalidad definitiva al cambio de espera a partir de una única repetición.

| Sesión | Audio (s) | Fragmentos audio | Eventos original | Eventos traducción | Primer original (ms) | Primera traducción (ms) | Ambos durante audio | Últimas frases |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| A | 21.10 | 211 | 20 | 20 | 3156 | 4151 | Sí | Completas |
| B | 21.09 | 211 | 19 | 20 | 3606 | 3807 | Sí | Completas |

Contenido revisado: A conserva inicio del taller a las 10, 20 participantes, computadora, descanso y agradecimiento final. B conserva bicicleta azul, siete ciclistas, parque, transporte, casco, clima y cierre de segunda sesión.

También se comprobaron:

- Ausencia de los marcadores de B en original/traducción de A y viceversa.
- Recepción por espectadores durante el envío.
- Cambio de espectador A→B y recepción de ambos textos de B.
- Resultado completo local en `results/live-check.json` (ignorado por Git; se reemplaza al repetir).

Esto valida el recorrido **WAV → dos conexiones Gemini → servidor → espectadores WebSocket**. No equivale a una prueba visual de los controles del navegador ni a una prueba de larga duración.

**Tercer ensayo (Arquitectura desacoplada `CaptionSession` + `gemini-3.1-flash-lite`), 2026-09-24 21:27:22 UTC:**
Transcripción live continua con `gemini-3.5-transcribe-live` y traducción de frases finales con `gemini-3.1-flash-lite` mediante cola ordenada con reintentos exponenciales y timeout de 20s. Prueba de concurrencia real aprobada (`passed: true`).

| Sesión | Audio (s) | Fragmentos audio | Interinos | Finales | Primer original (ms) | Primera traducción (ms) | Ambos durante audio | Últimas frases |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| A | 21.10 | 211 | 41 | 2 | 1589 | 14331 | Sí | Completas ("...gracias por acompañarnos hoy.") |
| B | 21.09 | 211 | 40 | 2 | 1317 | 18514 | Sí | Completas ("...final de nuestra segunda sesión.") |

Todas las comprobaciones de aislamiento, cambio de sesión A→B y recepción en audiencia pasaron exitosamente.

## Verificaciones locales de la versión con dos sesiones

- Suite ampliada: 26 pruebas locales (ver salida de `npm.cmd test`).
- Cubre independencia de sesiones incluso al cerrar/fallar una, cambio de espectador, reinicio, concatenación, original español sin traducción adicional, cola de traducción con reintentos y tolerancia a fallos, puerto de audiencia seguro, código QR local, PCM, protocolo y archivos protegidos.
- Sintaxis de scripts de navegador comprobada con Node. Navegador automatizado no disponible en la sesión inicial.

## Pendientes manuales antes de declarar el MVP completo

- [ ] Reiniciar servidor y verificar que aparecen los nuevos paneles de original/español.
- [ ] Probar micrófono inglés con traducción y comprobar las últimas frases.
- [ ] Repetir micrófono español en la nueva interfaz.
- [ ] En dos pestañas de emisor, enviar los dos archivos de demostración simultáneamente desde el navegador.
- [ ] Dos espectadores: elegir sesiones distintas y cambiar idioma durante audio.
- [ ] Cambiar A→B→A sin ver restos de la otra charla.
- [ ] Terminar A mientras B sigue, reiniciar A y comprobar limpieza de historial.
- [ ] Repetir instalación y ensayar demo de 1–2 minutos.

No marcar estos puntos como aprobados hasta ejecutarlos y registrar el resultado.
