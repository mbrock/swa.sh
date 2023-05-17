const Stream = {};

/**
 * Creates an asynchronous iterator with an unbounded buffer.
 *
 * This function takes a setup function that is used to control
 * the flow of values through the iterator. The setup function
 * receives an object with three methods: `next`, `stop`, and `fail`.
 *
 * The `next` method is used to push new values into the iterator.
 * The `stop` method is used to mark the iterator as done.
 * The `fail` method is used to stop the iterator with an error.
 *
 * @example
 * const iterator = Stream.create(({ next }) => {
 *   let i = 0;
 *   setInterval(() => {
 *     next(i++);
 *   }, 1000);
 * });
 *
 * @param {Function} setup - The setup function.
 * @returns {AsyncIterator} - An asynchronous iterator.
 */
Stream.create = function(setup) {
  let resolve, reject;
  let promise = new Promise((r, e) => { resolve = r; reject = e; });

  // Initialize an array to hold the buffered data.
  const buffer = [];

  const next = value => {
    // If there is a pending promise, resolve it with the next value.
    // Otherwise, add the value to the buffer.
    if (promise) {
      resolve({ value, done: false });
      promise = null;
    } else {
      buffer.push(value);
    }
  };

  const stop = () => {
    resolve({ done: true });
  };

  const fail = error => {
    reject(error);
  };

  setup({ next, stop, fail });

  return {
    next() {
      if (buffer.length > 0) {
        // If the buffer is not empty, return the next value from the buffer.
        return Promise.resolve({ value: buffer.shift(), done: false });
      } else if (promise === null) {
        // If the buffer is empty and there is no pending promise,
        // create a new promise.
        promise = new Promise((r, e) => { resolve = r; reject = e; });
      }

      // Return the pending promise.
      return promise;
    },
    return() {
      stop();
      return { done: true };
    },
    throw(error) {
      fail(error);
    },
    [Symbol.asyncIterator]() {
      return this;
    }
  };
};

/**
 * Merges multiple asynchronous iterators into a single iterator.
 *
 * This function takes an array of asynchronous iterators and returns
 * a new iterator that yields values from all input iterators as they
 * become available. The order of values in the output iterator is
 * determined by the order in which the input iterators produce them.
 *
 * If one iterator produces values faster than the others, its values
 * will be more frequent in the output. If an input iterator stops,
 * it is removed from the input set, and the merge continues with the
 * remaining iterators.
 *
 * If an input iterator throws an error, the merge stops and the error
 * is thrown from the output iterator.
 *
 * @example
 * const iterator1 = Stream.create(({ next }) => { ... });
 * const iterator2 = Stream.create(({ next }) => { ... });
 * const mergedIterator = Stream.merge([iterator1, iterator2]);
 *
 * @param {Array<AsyncIterator>} iterators - The input iterators.
 * @returns {AsyncGenerator} - The merged iterator.
 */
Stream.merge = async function* merge(iterators) {
  // Map each iterator to a promise that resolves with its next value.
  // Each resolved value is an object containing the value, the done status,
  // and the index of the source iterator.
  const promises = iterators.map((iterator, index) =>
    iterator.next().then(result => ({ ...result, source: index }))
  );

  // Continue until all promises (iterators) are done.
  while (promises.length > 0) {
    // Wait for the fastest promise to resolve.
    const nextPromise = Promise.race(promises);
    const { value, done, source } = await nextPromise;

    if (done) {
      // If the iterator is done, remove its promise from the array.
      const index = promises.findIndex((_, i) => i === source);
      if (index !== -1) {
        promises.splice(index, 1);
      }
    } else {
      // If the iterator is not done, yield its value and replace its promise
      // in the array with a new promise for its next value.
      yield value;
      promises[source] = iterators[source].next().then(
        result => ({ ...result, source }));
    }
  }
};

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
  return Stream.create(({ next, fail }) => {
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
      console.log(event);
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
    if (t) {
      const delay = (new Date(timestamp) - t) / 1000;

      if (delay < 3) {
        return;
      }

      if (this.$('.final > :not(.delay):last-child')) {
        this.$('.final').appendChild(
          delay > 6
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

