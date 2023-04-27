let OPENAI_API_KEY

const transcriptionResult = document.getElementById("transcriptionResult")

async function listen() {
  OPENAI_API_KEY = prompt("OpenAI API key")

  let mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
  let audioContext = new AudioContext()
  await audioContext.audioWorklet.addModule("rms.js")

  let source = audioContext.createMediaStreamSource(mediaStream)
  let rmsProcessor = new AudioWorkletNode(audioContext, "rms")
  source.connect(rmsProcessor)

  let mediaRecorder = new MediaRecorder(mediaStream)

  mediaRecorder.ondataavailable = (event) => {
    transcribe([event.data])
  }

  rmsProcessor.port.onmessage = (event) => {
    console.log(event.data)
    if (!event.data.silent) {
      if (mediaRecorder.state !== "recording") {
        mediaRecorder.start()
      }

      const paragraph = document.createElement("p")
      transcriptionResult.appendChild(paragraph)
      paragraph.innerText = "👂"

    } else {
      mediaRecorder.stop()
    }
  }

  mediaRecorder.start()
}


document.querySelector("#listenButton").addEventListener("click", listen)

async function transcribe(chunks) {
  const blob = new Blob(chunks, { type: "audio/mp4" })
  const formData = new FormData()
  formData.append("file", blob, "audio.mp4")
  formData.append("model", "whisper-1")

  const paragraph = transcriptionResult.lastChild
  paragraph.innerText = "🤖"

  try {
    console.log("transcribing")
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    })

    const result = await response.json()
    paragraph.innerText = result.text
  } catch (error) {
    console.error(error)
  }
}
