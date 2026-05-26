const frequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const presets = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  rock: [5, 3, 0, -2, -3, 1, 4, 5, 5, 4],
  pop: [4, 2, 0, -1, -1, 1, 3, 4, 4, 3],
  jazz: [3, 2, 1, 0, -1, 0, 1, 3, 4, 2],
  bass: [8, 6, 2, -2, -3, 0, 1, 3, 4, 5]
};
const bassBoostPattern = [6, 6, 3, 0, 0, 0, 0, 0, 0, 0];
const filters = [];
let audioContext;
let sourceNode;
let audioElement;
let micStream = null;
let analyserNode;
let gainNode;
let canvas;
let canvasCtx;
let animationId;
let bassBoosterActive = false;
let powerOn = true;
let currentSource = 'audio';
let micButton;
let powerButton;
let micStatusElement;
let bassStatusElement;

function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function createFilters() {
  filters.length = 0;
  frequencies.forEach((freq) => {
    const filter = audioContext.createBiquadFilter();
    filter.type = 'peaking';
    filter.frequency.value = freq;
    filter.Q.value = 1.0;
    filter.gain.value = 0;
    filters.push(filter);
  });

  filters.reduce((prev, current) => {
    if (prev) prev.connect(current);
    return current;
  });
}

function disconnectSource() {
  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }
  filters.forEach((filter) => filter.disconnect());
  if (analyserNode) {
    analyserNode.disconnect();
  }
  if (gainNode) {
    gainNode.disconnect();
  }
}

function connectAudioGraph() {
  if (!audioContext) return;
  disconnectSource();
  createFilters();

  if (currentSource === 'mic' && micStream) {
    sourceNode = audioContext.createMediaStreamSource(micStream);
  } else if (audioElement) {
    sourceNode = audioContext.createMediaElementSource(audioElement);
  } else {
    return;
  }

  sourceNode.connect(filters[0]);
  const lastFilter = filters[filters.length - 1];

  if (!analyserNode) {
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048;
    analyserNode.smoothingTimeConstant = 0.8;
  }

  if (!gainNode) {
    gainNode = audioContext.createGain();
    gainNode.gain.value = powerOn ? 1 : 0;
  }

  lastFilter.connect(analyserNode);
  analyserNode.connect(gainNode);
  gainNode.connect(audioContext.destination);
}

function updateFilterGain(index, value) {
  if (!filters[index]) return;
  filters[index].gain.value = Number(value);
  const output = document.querySelector(`#gain-${index}`);
  if (output) output.textContent = `${value} dB`;

  const meter = document.querySelector(`#meter-${index}`);
  if (meter) {
    const percent = ((Number(value) + 12) / 24) * 100;
    meter.style.width = `${percent}%`;
  }
}

function stopMic() {
  if (!micStream) return;
  micStream.getTracks().forEach((track) => track.stop());
  micStream = null;
  currentSource = 'audio';
  micButton.classList.remove('active');
  setMicStatus();
  connectAudioGraph();
}

function handleFileChange(event) {
  if (currentSource === 'mic') {
    stopMic();
  }

  const file = event.target.files[0];
  if (!file) return;

  const objectUrl = URL.createObjectURL(file);
  audioElement.src = objectUrl;
  currentSource = 'audio';
  audioElement.load();
  audioElement.play().catch(() => {
    // O usuário pode precisar clicar play manualmente
  });
}

function initSliders() {
  const slidersContainer = document.querySelector('.slider-grid');
  frequencies.forEach((freq, index) => {
    const control = document.createElement('div');
    control.className = 'slider-control';
    control.innerHTML = `
      <label for="band-${index}">${freq} Hz</label>
      <input type="range" id="band-${index}" min="-12" max="12" value="0" step="0.5" data-index="${index}" />
      <output id="gain-${index}">0 dB</output>
      <div class="band-meter" aria-hidden="true">
        <span class="meter-fill" id="meter-${index}" style="width: 50%;"></span>
      </div>
    `;
    slidersContainer.appendChild(control);
  });

  slidersContainer.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'range') return;
    const index = Number(target.dataset.index);
    updateFilterGain(index, target.value);
  });
}

function applyPreset(name) {
  const values = presets[name];
  if (!values) return;
  values.forEach((gain, index) => {
    const slider = document.querySelector(`#band-${index}`);
    if (slider) {
      const finalGain = bassBoosterActive ? gain + bassBoostPattern[index] : gain;
      slider.value = finalGain;
      updateFilterGain(index, finalGain);
    }
  });
}

function setBassStatus() {
  if (!bassStatusElement) return;
  bassStatusElement.textContent = bassBoosterActive ? 'Bass Booster ativado' : 'Bass Booster desligado';
}

function toggleBassBooster(button) {
  bassBoosterActive = !bassBoosterActive;
  button.classList.toggle('active', bassBoosterActive);
  setBassStatus();

  frequencies.forEach((_, index) => {
    const slider = document.querySelector(`#band-${index}`);
    if (!slider) return;
    const currentGain = Number(slider.value);

    if (bassBoosterActive) {
      const boostedGain = currentGain + bassBoostPattern[index];
      slider.value = boostedGain;
      updateFilterGain(index, boostedGain);
    } else {
      const restoredGain = currentGain - bassBoostPattern[index];
      slider.value = restoredGain;
      updateFilterGain(index, restoredGain);
    }
  });
}

function handleUrlChange(event) {
  if (currentSource === 'mic') {
    stopMic();
  }

  const url = event.target.value.trim();
  if (!url) return;
  audioElement.src = url;
  currentSource = 'audio';
  audioElement.load();
  audioElement.play().catch(() => {
    // O usuário pode precisar clicar play manualmente
  });
}

function setMicStatus() {
  if (!micStatusElement) return;
  micStatusElement.textContent = currentSource === 'mic' ? 'Microfone ativo' : 'Microfone inativo';
}

function setPowerState() {
  if (!powerButton) return;
  powerButton.textContent = powerOn ? 'Desligar' : 'Ligar';
  powerButton.classList.toggle('active', !powerOn);
  if (gainNode) {
    gainNode.gain.value = powerOn ? 1 : 0;
  }
}

function togglePower() {
  powerOn = !powerOn;
  setPowerState();
}

async function toggleMic() {
  if (currentSource === 'mic') {
    stopMic();
    connectAudioGraph();
    return;
  }

  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    currentSource = 'mic';
    micButton.classList.add('active');
    setMicStatus();
    connectAudioGraph();
  } catch (error) {
    console.error('Não foi possível acessar o microfone', error);
  }
}

function initVisualizer() {
  canvas = document.querySelector('#spectrum');
  if (!canvas) return;
  canvasCtx = canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  drawVisualizer();
}

function resizeCanvas() {
  if (!canvas) return;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * ratio;
  canvas.height = canvas.clientHeight * ratio;
  if (canvasCtx) {
    canvasCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
}

function drawVisualizer() {
  if (!analyserNode || !canvasCtx || !canvas) {
    animationId = requestAnimationFrame(drawVisualizer);
    return;
  }

  const bufferLength = analyserNode.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyserNode.getByteFrequencyData(dataArray);

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const barWidth = width / bufferLength * 1.5;
  let x = 0;

  canvasCtx.clearRect(0, 0, width, height);

  dataArray.forEach((value, index) => {
    const barHeight = (value / 255) * height;
    const hue = 220 - (index / bufferLength) * 120;
    canvasCtx.fillStyle = `hsl(${hue}, 95%, 60%)`;
    canvasCtx.fillRect(x, height - barHeight, barWidth, barHeight);
    x += barWidth + 1;
  });

  animationId = requestAnimationFrame(drawVisualizer);
}

function startApp() {
  audioElement = document.querySelector('#player');
  const fileInput = document.querySelector('#audio-file');
  const audioUrlInput = document.querySelector('#audio-url');
  const presetButtons = document.querySelector('.preset-buttons');
  const resumeButton = document.querySelector('#resume-context');
  const navToggle = document.querySelector('.nav-toggle');
  const siteNav = document.querySelector('.site-nav');
  const navLinks = document.querySelector('.nav-links');
  micButton = document.querySelector('#mic-button');
  powerButton = document.querySelector('#power-button');
  micStatusElement = document.querySelector('#mic-status');
  bassStatusElement = document.querySelector('#bass-status');

  ensureAudioContext();
  connectAudioGraph();
  initVisualizer();
  initSliders();
  setBassStatus();
  setPowerState();

  fileInput.addEventListener('change', handleFileChange);
  audioUrlInput.addEventListener('change', handleUrlChange);
  micButton.addEventListener('click', toggleMic);
  powerButton.addEventListener('click', togglePower);

  if (navToggle && siteNav) {
    navToggle.addEventListener('click', () => {
      const expanded = siteNav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(expanded));
    });
  }

  if (navLinks && siteNav) {
    navLinks.addEventListener('click', (event) => {
      if (event.target instanceof HTMLAnchorElement) {
        siteNav.classList.remove('open');
        if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  presetButtons.addEventListener('click', (event) => {
    const button = event.target;
    if (!(button instanceof HTMLButtonElement)) return;
    const preset = button.dataset.preset;
    if (button.id === 'bass-booster') {
      toggleBassBooster(button);
      return;
    }
    applyPreset(preset);
  });

  resumeButton.addEventListener('click', () => {
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
  });

  audioElement.addEventListener('play', () => {
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
  });
}

window.addEventListener('DOMContentLoaded', startApp);
