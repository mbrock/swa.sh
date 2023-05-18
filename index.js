// swa.sh - a tool, for naught
// Copyright (C) 2023  Mikael Brockman
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

function zb32word() {
  const base = "ybndrfg8ejkmcpqxot1uwisza345h769";
  const array = new Int32Array(1);
  window.crypto.getRandomValues(array);
  const i = array[0];

  return (
    base[i >>> 27 & 0x1f] +
    base[i >>> 22 & 0x1f] +
    base[i >>> 17 & 0x1f] +
    base[i >>> 12 & 0x1f] +
    base[i >>> 7 & 0x1f] +
    base[i >>> 2 & 0x1f]
  )
}

function gensym() {
  return `${zb32word()}${zb32word()}`
}


class Stream {
  constructor(setup) {
    this.buffer = [];

    const next = value => {
      if (this.promise) {
        this.resolve({ value, done: false });
        this.promise = null;
      } else {
        this.buffer.push(value);
      }
    };

    const stop = () => {
      this.resolve({ done: true });
    };

    const fail = error => {
      this.reject(error);
    };

    setup({ next, stop, fail });
  }

  async next() {
    if (this.buffer.length > 0) {
      return Promise.resolve({
        value: this.buffer.shift(),
        done: false
      });
    }

    if (!this.promise) {
      this.promise = new Promise((r, e) => {
        this.resolve = r;
        this.reject = e;
      });
    }

    return this.promise;
  }

  return() {
    this.resolve({ done: true });
    return Promise.resolve({ done: true });
  }

  throw(error) {
    this.reject(error);
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  static async *merge(iterators) {
    const promises = iterators.map((iterator, index) =>
      iterator.next().then(result => ({ ...result, source: index }))
    );

    while (promises.length > 0) {
      const nextPromise = Promise.race(promises);
      const { value, done, source } = await nextPromise;

      if (done) {
        const index = promises.findIndex((_, i) => i === source);
        if (index !== -1) {
          promises.splice(index, 1);
        }
      } else {
        yield value;
        promises[source] = iterators[source].next().then(
          result => ({ ...result, source }));
      }
    }
  }
}

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

function speechRecognitionEventStream({ language = 'en-US' }) {
  return new Stream(({ next, fail }) => {
    const recognition =
      new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.lang = language;

    recognition.onresult = event => {
      const timestamp = new Date().toISOString()
      next({ type: 'Result', timestamp });
      Array.from(event.results)
        .slice(event.resultIndex)
        .forEach(result => {
          next({
            type: result.isFinal ? 'FinalTranscript' : 'InterimTranscript',
            transcript: result[0].transcript,
            grade: result.isFinal
              ? confidenceGrade(result[0].confidence)
              : undefined,
            timestamp,
            id: gensym(),
          });
        });
    };

    recognition.onerror = error => {
      if (error.error === 'no-speech') {
        next({ type: 'NoSpeech', timestamp: new Date().toISOString() });
      } else {
        fail(error);
      }
    };

    recognition.onend = () => {
      recognition.start();
    };

    recognition.start();
  });
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
  }

  async connectedCallback() {
    this.db = this.getAttribute('db');
    this.loadAndHandleEvents();

    this.recognitionEventStream = speechRecognitionEventStream({
      language: this.getAttribute('lang') || 'en-US',
    });

    for await (const event of this.recognitionEventStream) {
      console.log("ok", event);
      this.handleEvent(event, true);
    }
  }

  loadAndHandleEvents() {
    const events = JSON.parse(localStorage.getItem(this.db) || '[]');
    events.forEach(event => this.handleEvent(event, false));
  }

  saveEvent(event) {
    let events = JSON.parse(localStorage.getItem(this.db) || '[]');
    events = [...events, event];
    localStorage.setItem(this.db, JSON.stringify(events));
  }

  reset() {
    localStorage.removeItem(this.db);
    this.$('.final').innerHTML = '';
    this.$('.interim').textContent = '';
  }

  insertDelay(timestamp) {
    const t = new Date(this.$('aside').textContent);
    const t1 = new Date(timestamp);
    if (t) {
      const delay = (t1 - t) / 1000;

      if (delay < 3) {
        return;
      }

      const delayMargin = `${Math.log(delay + 1)}ex`;

      if (this.$('.final > :not(.delay):last-child')) {
        if (delay > 20) {
          let formattedDate = t1.toLocaleString('sv-SE', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          });

          let formattedTime = t1.toLocaleString('sv-SE', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          });

          this.$('.final').appendChild(
            this.tag('div', {
              class: 'delay flex gap',
              style: `margin-top: ${delayMargin}`
            }, delay > 60 ? [
              this.tag('date', {}, [formattedDate]),
              this.tag('time', {}, [formattedTime])
            ] : [])
          )
        } else {
          this.$('.final').appendChild(
            this.tag('span', { class: 'delay dots' }, [
              ' ',
              '.'.repeat(Math.floor(delay)),
              ' ',
            ])
          );
        }
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
      Result: () => {
        this.$('.interim').textContent = '';
      },

      FinalTranscript: (event) => {
        const commandFunc = {
          'hard reset please': this.reset.bind(this),
        }[event.transcript.trim().toLowerCase()];

        if (commandFunc) {
          commandFunc();
        } else {
          this.insertDelay(event.timestamp);

          this.$('.final').appendChild(this.tag('span', {
            'data-grade': event.grade,
            'data-id': event.id,
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

