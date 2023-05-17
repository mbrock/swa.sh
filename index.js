class BaseComponent extends HTMLElement {
  constructor(templateContent) {
    super();
    this.attachShadow({ mode: 'open' });
    this.appendTemplate(templateContent);
  }

  $(selector) {
    return this.shadowRoot.querySelector(selector);
  }

  appendTemplate(templateContent) {
    const template = document.createElement('template');
    template.innerHTML = templateContent;
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }

  tag(tagName, attributes = {}, children = []) {
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
}

class SwashDictaphone extends BaseComponent {
  constructor() {
    super(`
      <link rel="stylesheet" href="index.css">
      <article>
        <span class="final"></span>
        <span class="interim"></span>
        <aside style="display: none;"></aside>
      </article>
    `);

    this.recognition = this.setupSpeechRecognition({
      lang: this.getAttribute('lang') || 'en-US',
    });

    this.recognition.onstart = () => {
      this.setAsideContent(new Date().toISOString());
    };

    this.recognition.start();

    this.loadAndHandleEvents();

    this.recognition.onresult = event => {
      this.handleRecognitionResults(event);
    };

    this.recognition.onend = () => {
      this.recognition.start();
    };
  }

  setupSpeechRecognition({ lang }) {
    const recognition = new (
      window.SpeechRecognition || window.webkitSpeechRecognition
    )();
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.lang = lang;
    return recognition;
  }

  toEvent(result) {
    const now = new Date();
    return {
      type: result.isFinal ? 'FinalTranscript' : 'InterimTranscript',
      transcript: result[0].transcript,
      grade: result.isFinal ? confidenceGrade(result[0].confidence) : undefined,
      timestamp: now.toISOString()
    };
  }

  loadAndHandleEvents() {
    const db = 'swashDictaphoneEvents.3';
    const events = JSON.parse(localStorage.getItem(db) || '[]');
    events.forEach(event => this.handleEvent(event, false));
  }

  saveEvent(event) {
    const db = 'swashDictaphoneEvents.3';
    let events = JSON.parse(localStorage.getItem(db) || '[]');
    events = [...events, event];
    localStorage.setItem(db, JSON.stringify(events));
  }

  reset() {
    localStorage.removeItem('dictaphoneEvents');
    this.$('.final').innerHTML = '';
    this.$('.interim').textContent = '';
  }

  insertDelay(timestamp) {
    const t = new Date(this.$('aside').textContent);
    if (t) {
      const delay = (new Date(timestamp) - t) / 1000;

      if (delay < 2) {
        return;
      }

      if (this.$('.final > :not(.delay):last-child')) {
        this.$('.final').appendChild(
          delay > 10
            ? this.tag('hr', { class: 'delay', style: `margin-top: ${delay}px` })
            : this.tag('span', { class: 'delay dots' }, [
              ' ',
              '.'.repeat(Math.floor(delay)),
              ' ',
            ])
        );
      }
    }

    this.setAsideContent(timestamp);
  }

  setAsideContent(content) {
    this.$('aside').textContent = content;
  }

  handleEvent(event, shouldSave) {
    if (shouldSave) {
      this.saveEvent(event);
    }

    const eventTypeHandlers = {
      FinalTranscript: (event) => {
        const commandFunc = {
          'hard reset please': this.reset
        }[event.transcript.trim().toLowerCase()];

        if (commandFunc) {
          commandFunc();
        } else {
          this.insertDelay(event.timestamp);

          this.$('.final').appendChild(this.tag('span', {
            'data-grade': event.grade,
          }, [event.transcript]));
          this.$('.interim').textContent = '';
        }
      },

      InterimTranscript: (event) => {
        if (this.$('.interim').textContent == '') {
          console.log('inserting delay');
          console.log(JSON.stringify(this.$('.interim').textContent));
          this.insertDelay(event.timestamp);
        } else {
          console.log('not inserting delay');
          console.log(JSON.stringify(this.$('.interim').textContent));
        }

        this.$('.interim').textContent += event.transcript;
      },
    };

    const handlerFunc = eventTypeHandlers[event.type];
    if (handlerFunc) {
      handlerFunc(event);
    }

    // scroll to bottom smoothly, centering the last line
    this.$('.final > :last-child, .interim').scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }

  handleRecognitionResults(event) {
    const newEvents = Array.from(event.results)
      .slice(event.resultIndex)
      .map(result => this.toEvent(result));
    this.$('.interim').textContent = '';
    newEvents.forEach(event => this.handleEvent(event, true));
  }
}

// Define the new element
customElements.define('swash-dictaphone', SwashDictaphone);

function confidenceGrade(confidence) {
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
  return grade;
}

