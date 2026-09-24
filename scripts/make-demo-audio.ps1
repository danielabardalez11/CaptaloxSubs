$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$projectRoot = Split-Path -Parent $PSScriptRoot
$recordingsPath = Join-Path $projectRoot 'recordings'
New-Item -ItemType Directory -Force -Path $recordingsPath | Out-Null
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $voice = $speaker.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq 'en-US' } | Select-Object -First 1
    if (-not $voice) { throw 'No hay una voz inglesa instalada en Windows.' }
    $speaker.SelectVoice($voice.VoiceInfo.Name)
    $speaker.Rate = -1
    $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
    $speaker.SetOutputToWaveFile((Join-Path $recordingsPath 'demo-en.wav'), $format)
    $speaker.Speak('Welcome to session one. Today we are building live captions for a programming conference. The workshop starts at ten and has twenty participants. Please bring your laptop. We will take a short break and then continue with the demonstration. Thank you for joining us today.')
    $speaker.SetOutputToNull()
    Write-Output 'Creado recordings/demo-en.wav (voz sintetica inglesa, PCM mono 16 kHz).'
    $speaker.SetOutputToWaveFile((Join-Path $recordingsPath 'demo-b-en.wav'), $format)
    $speaker.Speak('Welcome to session two. The bicycle is blue. Seven riders are meeting in the park this afternoon. We are discussing healthy transport and safer streets. Please remember to wear a helmet. The weather is sunny today. This is the end of our second session.')
    $speaker.SetOutputToNull()
    Write-Output 'Creado recordings/demo-b-en.wav (otra charla inglesa para comprobar aislamiento).'
} finally { $speaker.Dispose() }
