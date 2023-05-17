function setupSpeechRecognition({ lang }) {
  const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.lang = lang;
  return recognition;
}

function tag(tagName, attributes = {}, children = []) {
  const element = document.createElement(tagName);
  Object.keys(attributes).forEach(key => {
    element.setAttribute(key, attributes[key]);
  });
  children.forEach(child => {
    if (typeof child === 'string') {
      child = document.createTextNode(child);
    } else if (child instanceof HTMLElement) {
      // do nothing
    } else {
      throw new Error('Invalid child type');
    }
    element.appendChild(child);
  });
  return element;
}

function handleResult(result) {
  return {
    transcript: result[0].transcript,
    isFinal: result.isFinal
  };
}

function accumulateTranscripts(results, startingTranscript = '') {
  return results.reduce((acc, result) => {
    const cur = handleResult(result);
    if (cur.isFinal) {
      return {
        final: acc.final + cur.transcript,
        interim: acc.interim
      };
    } else {
      return {
        final: acc.final,
        interim: acc.interim + cur.transcript
      };
    }
  }, { final: startingTranscript, interim: '' });
}

function handleResultEvent(event, transcript) {
  const newResults = Array.from(event.results).slice(event.resultIndex);
  return accumulateTranscripts(newResults, transcript);
}

class SwashDictaphone extends HTMLElement {
  constructor() {
    super();

    this.attachShadow({ mode: 'open' });

    this.shadowRoot.appendChild(
      tag('link', { rel: 'stylesheet', href: 'index.css' })
    );

    this.finalSpans = tag('span', { class: 'final' }, [
      this.finalSpan = tag('span', {}),
    ]);

    this.shadowRoot.appendChild(
      tag('span', {}, [
        this.finalSpans,
        this.interimSpan = tag('span', { class: 'interim' }),
      ]));

    this.recognition = setupSpeechRecognition({
      lang: this.getAttribute('lang') || 'en-US',
    })

    this.recognition.start();

    this.recognition.onresult = event => {
      console.log(event);

      const { final, interim } =
        handleResultEvent(event, this.finalSpan.innerText);

      this.interimSpan.textContent = interim;
      this.finalSpan.textContent = final;

      if (final) {
        const confidence = event.results[event.results.length - 1][0].confidence
        let grade;
        if (confidence > 0.95) {
          grade = 'A+';
        } else if (confidence > 0.9) {
          grade = 'A';
        } else if (confidence > 0.8) {
          grade = 'B';
        } else if (confidence > 0.7) {
          grade = 'C';
        } else if (confidence > 0.6) {
          grade = 'D';
        } else {
          grade = 'F';
        }

        this.finalSpan.setAttribute("data-grade", grade);

        this.dispatchEvent(
          new CustomEvent('onfinalspeech', { detail: final }));

        this.finalSpan = tag('span', {});
        this.finalSpans.appendChild(this.finalSpan);
      }
    };

    this.recognition.onend = () => {
      this.recognition.start();
    };
  }
}

// Define the new element
customElements.define('swash-dictaphone', SwashDictaphone);
