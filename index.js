let apiKey

const div = document.getElementById("transcriptionResult")

async function listen() {
  apiKey = localStorage.getItem("OPENAI_API_KEY") || prompt("OpenAI API key:")
  localStorage.setItem("OPENAI_API_KEY", apiKey)

  let audioContext = new AudioContext()
  await audioContext.audioWorklet.addModule("rms.js")

  let stream =
    await navigator.mediaDevices.getUserMedia({ audio: true })
  let source =
    audioContext.createMediaStreamSource(stream)
  let rms =
    new AudioWorkletNode(audioContext, "rms")

  source.connect(rms)

  let recorder = new MediaRecorder(stream)
  let p

  recorder.ondataavailable = event => transcribe([event.data], p, audioContext)

  rms.port.onmessage = event => {
    console.log(event.data)

    if (event.data.silent) {
      recorder.stop()
    } else {
      if (recorder.state !== "recording") {
        recorder.start()
      }

      p = document.createElement("p")
      div.appendChild(p)
      p.innerText = "👂"
    }
  }

  recorder.start()
}


document.querySelector("#listenButton").addEventListener("click", listen)

async function transcribe(chunks, p, audioContext) {
  const blob = new Blob(chunks, { type: "audio/mp4" })
  const formData = new FormData()
  formData.append("file", blob, "audio.mp4")
  formData.append("model", "whisper-1")

  const audioElement = document.createElement('audio')
  audioElement.src = URL.createObjectURL(blob)
  audioElement.controls = true

  try {
    console.log("transcribing")
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    })

    const result = await response.json()
    p.innerText = result.text
    p.appendChild(audioElement)

  } catch (error) {
    console.error(error)
  }
}
