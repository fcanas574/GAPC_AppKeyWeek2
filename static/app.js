const initialStateEl = document.getElementById('initialState');
let state = JSON.parse(initialStateEl.textContent);

const memberGrid = document.getElementById('memberGrid');
const meetingBadge = document.getElementById('meetingBadge');
const selectedMemberInfo = document.getElementById('selectedMemberInfo');
const principalAmount = document.getElementById('principalAmount');
const interestAmount = document.getElementById('interestAmount');
const principalRemaining = document.getElementById('principalRemaining');
const interestRemaining = document.getElementById('interestRemaining');
const tokenRack = document.getElementById('tokenRack');
const statusMsg = document.getElementById('statusMsg');
const newMeetingBtn = document.getElementById('newMeetingBtn');
const resetDemoBtn = document.getElementById('resetDemoBtn');
const ttsToggleBtn = document.getElementById('ttsToggleBtn');
const openMemberAdminBtn = document.getElementById('openMemberAdminBtn');
const memberAdminModal = document.getElementById('memberAdminModal');
const memberAdminBackdrop = document.getElementById('memberAdminBackdrop');
const closeMemberAdminBtn = document.getElementById('closeMemberAdminBtn');
const memberForm = document.getElementById('memberForm');
const memberSettingsModal = document.getElementById('memberSettingsModal');
const memberSettingsBackdrop = document.getElementById('memberSettingsBackdrop');
const closeMemberSettingsBtn = document.getElementById('closeMemberSettingsBtn');
const memberSettingsForm = document.getElementById('memberSettingsForm');
const settingsMemberId = document.getElementById('settingsMemberId');
const settingsMemberName = document.getElementById('settingsMemberName');
const settingsNameVoiceBtn = document.getElementById('settingsNameVoiceBtn');
const settingsMemberGender = document.getElementById('settingsMemberGender');
const settingsPrincipalTotal = document.getElementById('settingsPrincipalTotal');
const settingsInterestTotal = document.getElementById('settingsInterestTotal');
const settingsPrincipalTokens = document.getElementById('settingsPrincipalTokens');
const settingsInterestTokens = document.getElementById('settingsInterestTokens');
const settingsClearPrincipalBtn = document.getElementById('settingsClearPrincipalBtn');
const settingsClearInterestBtn = document.getElementById('settingsClearInterestBtn');
const settingsSaveBtn = document.querySelector('#memberSettingsForm .confirm-btn');
const deleteMemberSettingsBtn = document.getElementById('deleteMemberSettingsBtn');
const memberWizardProgress = document.getElementById('memberWizardProgress');
const memberWizardPrevBtn = document.getElementById('memberWizardPrevBtn');
const memberWizardNextBtn = document.getElementById('memberWizardNextBtn');
const memberMode = document.getElementById('memberMode');
const memberGenderSelect = document.getElementById('memberGenderSelect');
const existingMemberWrap = document.getElementById('existingMemberWrap');
const existingMemberSelect = document.getElementById('existingMemberSelect');
const memberNameInput = document.getElementById('memberNameInput');
const nameVoiceBtn = document.getElementById('nameVoiceBtn');
const principalTotalInput = document.getElementById('principalTotalInput');
const interestTotalInput = document.getElementById('interestTotalInput');
const adminPrincipalTokens = document.getElementById('adminPrincipalTokens');
const adminInterestTokens = document.getElementById('adminInterestTokens');
const clearPrincipalBtn = document.getElementById('clearPrincipalBtn');
const clearInterestBtn = document.getElementById('clearInterestBtn');
const memberPhotoInput = document.getElementById('memberPhotoInput');
const memberSaveBtn = document.querySelector('#memberForm .member-save-btn');
const wizardStepRows = Array.from(document.querySelectorAll('.member-wizard-step'));
const resetDraftBtn = document.getElementById('resetDraftBtn');
const savePaymentBtn = document.getElementById('savePaymentBtn');
const jarPrincipalBtn = document.getElementById('jarPrincipalBtn');
const jarInterestBtn = document.getElementById('jarInterestBtn');
const jars = document.querySelectorAll('.jar');

let selectedMemberId = null;
let activeJar = 'principal';
let draft = { principal: 0, interest: 0 };
const paymentDraftByMemberId = new Map();
let paymentSaveInFlight = false;
const speechSupported =
  typeof window !== 'undefined' &&
  'speechSynthesis' in window &&
  'SpeechSynthesisUtterance' in window;
let ttsEnabled = loadTtsPreference();
let preferredVoice = null;
let lastSpeech = { text: '', timestamp: 0 };
let speechWatchdogId = null;
let speechLongWatchdogId = null;
let speechRetryInProgress = false;
let speechUnlockBound = false;
let normalSpeechTimeoutId = null;
let pendingNormalSpeech = '';
let draftSummaryTimeoutId = null;
let draftSummaryTarget = 'principal';
let activeSpeechText = '';
let lastQueuedSpeech = { text: '', timestamp: 0 };
const SpeechRecognitionCtor =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition || null
    : null;
const nameSttSupported = Boolean(SpeechRecognitionCtor);
let nameRecognizer = null;
let nameListening = false;
let nameBaseValue = '';
let settingsNameRecognizer = null;
let settingsNameListening = false;
let settingsNameBaseValue = '';
let memberWizardLastStep = '';
let memberWizardCurrentStep = 1;
const memberWizardTotalSteps = 4;
let touchDragState = null;
let touchDragGhost = null;
let touchDropHighlightEl = null;

const coinImageByValue = {
  '0.01': '/static/static/images/coins/1c_c.jpg',
  '0.05': '/static/static/images/coins/5c_c.jpg',
  '0.10': '/static/static/images/coins/10c_c.jpg',
  '0.25': '/static/static/images/coins/25c_c.jpg',
  '1.00': '/static/static/images/coins/1d_c.jpg',
};

const billImageByValue = {
  '1.00': '/static/static/images/bills/1_b1.jpg',
  '5.00': '/static/static/images/bills/5_b3.jpg',
  '10.00': '/static/static/images/bills/10_b4.jpg',
  '20.00': '/static/static/images/bills/20_b2.jpg',
};

function money(value) {
  return `$${Number(value).toFixed(2)}`;
}

function normalizeGender(gender) {
  return gender === 'male' ? 'male' : 'female';
}

function memberNoun(gender) {
  return normalizeGender(gender) === 'male' ? 'socio' : 'socia';
}

function memberNounCapitalized(gender) {
  const noun = memberNoun(gender);
  return noun.charAt(0).toUpperCase() + noun.slice(1);
}

function selectedAdjective(gender) {
  return normalizeGender(gender) === 'male' ? 'seleccionado' : 'seleccionada';
}

function buildTokenEntries() {
  const tokenEntries = [];
  for (const denomination of state.denominations) {
    const normalized = Number(denomination).toFixed(2);

    if (normalized === '1.00') {
      tokenEntries.push({ value: 1, kind: 'coin' });
      tokenEntries.push({ value: 1, kind: 'bill' });
      continue;
    }

    tokenEntries.push({ value: denomination, kind: 'auto' });
  }

  return tokenEntries;
}

function loadTtsPreference() {
  try {
    const saved = window.localStorage.getItem('gapcTtsEnabled');
    return saved === null ? true : saved === 'true';
  } catch (error) {
    return true;
  }
}

function persistTtsPreference() {
  try {
    window.localStorage.setItem('gapcTtsEnabled', String(ttsEnabled));
  } catch (error) {
    // Ignore storage errors and keep in-memory preference.
  }
}

function pickSpanishVoice() {
  if (!speechSupported) {
    return null;
  }

  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) {
    return null;
  }

  const spanishVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith('es'));
  if (!spanishVoices.length) {
    return null;
  }

  const preferredLangs = ['es-SV', 'es-419', 'es-MX', 'es-US', 'es-ES', 'es'];
  const preferredNameHints = [
    'paulina',
    'monica',
    'sofia',
    'helena',
    'google',
    'microsoft',
    'natural',
  ];

  const scored = spanishVoices
    .map((voice) => {
      const lang = voice.lang.toLowerCase();
      const name = voice.name.toLowerCase();
      let score = 0;

      const langIndex = preferredLangs.findIndex((candidate) => lang === candidate.toLowerCase());
      if (langIndex >= 0) {
        score += 300 - langIndex * 20;
      }

      if (lang.startsWith('es-')) {
        score += 40;
      }

      if (voice.localService) {
        score += 15;
      }

      if (preferredNameHints.some((hint) => name.includes(hint))) {
        score += 35;
      }

      return { voice, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.voice || spanishVoices[0];
}

function clearSpeechWatchdogs() {
  if (speechWatchdogId) {
    window.clearTimeout(speechWatchdogId);
    speechWatchdogId = null;
  }
  if (speechLongWatchdogId) {
    window.clearTimeout(speechLongWatchdogId);
    speechLongWatchdogId = null;
  }
}

function touchSpeechEngine() {
  if (!speechSupported) {
    return;
  }

  try {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.resume();
  } catch (error) {
    // Ignore browser speech transient failures.
  }
}

function resetSpeechEngine() {
  if (!speechSupported) {
    return;
  }

  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
    window.speechSynthesis.getVoices();
  } catch (error) {
    // Ignore browser speech transient failures.
  }
}

function estimatedSpeechDurationMs(text) {
  const safeLength = String(text || '').length;
  return Math.min(9000, Math.max(2800, safeLength * 95));
}

function bindSpeechUnlockOnInteraction() {
  if (!speechSupported || speechUnlockBound) {
    return;
  }

  const unlock = () => {
    touchSpeechEngine();
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  speechUnlockBound = true;
}

function buildUtterance(message, voice) {
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = voice.lang;
  utterance.rate = 0.9;
  utterance.pitch = 1.08;
  utterance.voice = voice;
  return utterance;
}

function queueSpeech(message, priority, isRetry = false) {
  if (!speechSupported || !ttsEnabled) {
    return;
  }

  const now = Date.now();
  if (activeSpeechText === message) {
    return;
  }
  if (lastQueuedSpeech.text === message && now - lastQueuedSpeech.timestamp < 2500) {
    return;
  }
  lastQueuedSpeech = { text: message, timestamp: now };

  touchSpeechEngine();
  preferredVoice = preferredVoice || pickSpanishVoice();
  if (!preferredVoice) {
    updateTtsButton();
    return;
  }

  if (priority === 'critical') {
    try {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }
      window.speechSynthesis.resume();
    } catch (error) {
      // Ignore transient synthesis errors.
    }
  }

  const utterance = buildUtterance(message, preferredVoice);

  utterance.onstart = () => {
    activeSpeechText = message;
  };

  utterance.onend = () => {
    if (activeSpeechText === message) {
      activeSpeechText = '';
    }
  };

  utterance.onerror = () => {
    if (activeSpeechText === message) {
      activeSpeechText = '';
    }
  };

  try {
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    if (activeSpeechText === message) {
      activeSpeechText = '';
    }
  }
}

function amountToSpeech(value) {
  const safeValue = Number(value);
  if (!Number.isFinite(safeValue)) {
    return '0 dólares';
  }

  const abs = Math.abs(safeValue);
  const dollars = Math.floor(abs);
  const cents = Math.round((abs - dollars) * 100);

  if (dollars === 0 && cents > 0) {
    return `${cents} centavos`;
  }

  if (dollars > 0 && cents === 0) {
    return `${dollars} ${dollars === 1 ? 'dólar' : 'dólares'}`;
  }

  if (dollars > 0 && cents > 0) {
    return `${dollars} ${dollars === 1 ? 'dólar' : 'dólares'} con ${cents} centavos`;
  }

  return '0 dólares';
}

function updateTtsButton() {
  if (!ttsToggleBtn) {
    return;
  }

  ttsToggleBtn.classList.remove('off', 'unsupported');
  if (!speechSupported) {
    ttsToggleBtn.innerHTML = '<span class="audio-icon" aria-hidden="true">🔇</span>';
    ttsToggleBtn.setAttribute('aria-label', 'Voz no disponible');
    ttsToggleBtn.setAttribute('title', 'Voz no disponible');
    ttsToggleBtn.classList.add('unsupported');
    ttsToggleBtn.disabled = true;
    return;
  }

  const hasSpanishVoice = Boolean(preferredVoice || pickSpanishVoice());
  if (!hasSpanishVoice) {
    ttsToggleBtn.innerHTML = '<span class="audio-icon" aria-hidden="true">🔇</span>';
    ttsToggleBtn.setAttribute('aria-label', 'Sin voz en español');
    ttsToggleBtn.setAttribute('title', 'Sin voz en español');
    ttsToggleBtn.classList.add('unsupported');
    ttsToggleBtn.disabled = true;
    return;
  }

  ttsToggleBtn.disabled = false;
  if (ttsEnabled) {
    ttsToggleBtn.innerHTML = '<span class="audio-icon" aria-hidden="true">🔊</span>';
    ttsToggleBtn.setAttribute('aria-label', 'Voz activada');
    ttsToggleBtn.setAttribute('title', 'Voz activada');
  } else {
    ttsToggleBtn.innerHTML = '<span class="audio-icon" aria-hidden="true">🔈</span>';
    ttsToggleBtn.setAttribute('aria-label', 'Voz desactivada');
    ttsToggleBtn.setAttribute('title', 'Voz desactivada');
    ttsToggleBtn.classList.add('off');
  }
}

function speak(message, priority = 'normal') {
  if (!speechSupported || !ttsEnabled || !message) {
    return;
  }

  const normalized = String(message).trim();
  if (!normalized) {
    return;
  }

  const now = Date.now();
  if (lastSpeech.text === normalized && now - lastSpeech.timestamp < 2200) {
    return;
  }

  lastSpeech = { text: normalized, timestamp: now };

  if (priority === 'critical') {
    if (normalSpeechTimeoutId) {
      window.clearTimeout(normalSpeechTimeoutId);
      normalSpeechTimeoutId = null;
      pendingNormalSpeech = '';
    }
    queueSpeech(normalized, priority);
    return;
  }

  // Buffer normal messages to avoid overlap/cut when many UI events fire quickly.
  pendingNormalSpeech = normalized;
  if (normalSpeechTimeoutId) {
    window.clearTimeout(normalSpeechTimeoutId);
  }

  normalSpeechTimeoutId = window.setTimeout(() => {
    normalSpeechTimeoutId = null;
    if (!pendingNormalSpeech || !ttsEnabled) {
      return;
    }

    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      // Wait until engine is free, keeping only latest normal message.
      normalSpeechTimeoutId = window.setTimeout(() => {
        if (!pendingNormalSpeech || !ttsEnabled) {
          normalSpeechTimeoutId = null;
          return;
        }
        const messageToSpeak = pendingNormalSpeech;
        pendingNormalSpeech = '';
        queueSpeech(messageToSpeak, 'normal');
        normalSpeechTimeoutId = null;
      }, 450);
      return;
    }

    const messageToSpeak = pendingNormalSpeech;
    pendingNormalSpeech = '';
    queueSpeech(messageToSpeak, 'normal');
  }, 220);
}

function clearDraftSummarySpeech() {
  if (draftSummaryTimeoutId) {
    window.clearTimeout(draftSummaryTimeoutId);
    draftSummaryTimeoutId = null;
  }
}

function scheduleDraftSummarySpeech(target) {
  draftSummaryTarget = target;
  clearDraftSummarySpeech();

  draftSummaryTimeoutId = window.setTimeout(() => {
    draftSummaryTimeoutId = null;
    const member = getSelectedMember();
    if (!member) {
      return;
    }

    const targetLabel = draftSummaryTarget === 'principal' ? 'Principal' : 'Interés';
    const totalGiven = draftSummaryTarget === 'principal' ? draft.principal : draft.interest;
    const remaining = getRemainingForTarget(draftSummaryTarget);
    if (remaining === null) {
      return;
    }

    if (remaining <= 0.001) {
      const paidLabel = draftSummaryTarget === 'principal' ? 'Préstamo pagado' : 'Interés pagado';
      speak(`${targetLabel}: ${amountToSpeech(totalGiven)}. ${paidLabel}.`);
      return;
    }

    speak(`${targetLabel}: ${amountToSpeech(totalGiven)}. Restante: ${amountToSpeech(remaining)}.`);
  }, 3000);
}

function initTts() {
  if (!speechSupported) {
    updateTtsButton();
    return;
  }

  bindSpeechUnlockOnInteraction();
  touchSpeechEngine();
  preferredVoice = pickSpanishVoice();
  updateTtsButton();

  window.speechSynthesis.onvoiceschanged = () => {
    touchSpeechEngine();
    preferredVoice = pickSpanishVoice();
    updateTtsButton();
  };

  window.addEventListener('pageshow', () => {
    touchSpeechEngine();
    preferredVoice = pickSpanishVoice() || preferredVoice;
    updateTtsButton();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      touchSpeechEngine();
      preferredVoice = pickSpanishVoice() || preferredVoice;
      updateTtsButton();
    }
  });
}

function updateNameVoiceButton() {
  if (!nameVoiceBtn) {
    return;
  }

  nameVoiceBtn.classList.remove('listening', 'unsupported');
  if (!nameSttSupported) {
    nameVoiceBtn.disabled = true;
    nameVoiceBtn.classList.add('unsupported');
    nameVoiceBtn.textContent = '🚫';
    nameVoiceBtn.setAttribute('aria-label', 'Dictado no disponible');
    nameVoiceBtn.setAttribute('title', 'Dictado no disponible');
    return;
  }

  nameVoiceBtn.disabled = false;
  if (nameListening) {
    nameVoiceBtn.classList.add('listening');
    nameVoiceBtn.textContent = '⏹';
    nameVoiceBtn.setAttribute('aria-label', 'Detener dictado');
    nameVoiceBtn.setAttribute('title', 'Detener dictado');
  } else {
    nameVoiceBtn.textContent = '🎤';
    nameVoiceBtn.setAttribute('aria-label', 'Dictar nombre');
    nameVoiceBtn.setAttribute('title', 'Dictar nombre');
  }
}

function initNameSpeechToText() {
  updateNameVoiceButton();
  if (!nameVoiceBtn || !nameSttSupported || !memberNameInput) {
    return;
  }

  nameRecognizer = new SpeechRecognitionCtor();
  nameRecognizer.lang = 'es-SV';
  nameRecognizer.continuous = false;
  nameRecognizer.interimResults = true;
  nameRecognizer.maxAlternatives = 1;

  nameRecognizer.onstart = () => {
    nameListening = true;
    nameBaseValue = String(memberNameInput.value || '').trim();
    updateNameVoiceButton();
    setStatus('Escuchando nombre...', 'ok');
  };

  nameRecognizer.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      transcript += event.results[i][0].transcript;
    }

    transcript = transcript.trim();
    if (!transcript) {
      return;
    }

    memberNameInput.value = nameBaseValue
      ? `${nameBaseValue} ${transcript}`.replace(/\s+/g, ' ').trim()
      : transcript;
  };

  nameRecognizer.onerror = () => {
    setStatus('No se pudo usar el micrófono para dictar nombre', 'error');
  };

  nameRecognizer.onend = () => {
    nameListening = false;
    updateNameVoiceButton();
  };

  nameVoiceBtn.addEventListener('click', () => {
    if (!nameRecognizer) {
      return;
    }

    if (nameListening) {
      nameRecognizer.stop();
      return;
    }

    try {
      nameRecognizer.start();
    } catch (error) {
      setStatus('No se pudo iniciar dictado por voz', 'error');
    }
  });
}

function updateSettingsNameVoiceButton() {
  if (!settingsNameVoiceBtn) {
    return;
  }

  settingsNameVoiceBtn.classList.remove('listening', 'unsupported');
  if (!nameSttSupported) {
    settingsNameVoiceBtn.disabled = true;
    settingsNameVoiceBtn.classList.add('unsupported');
    settingsNameVoiceBtn.textContent = '🚫';
    settingsNameVoiceBtn.setAttribute('aria-label', 'Dictado no disponible');
    settingsNameVoiceBtn.setAttribute('title', 'Dictado no disponible');
    return;
  }

  settingsNameVoiceBtn.disabled = false;
  if (settingsNameListening) {
    settingsNameVoiceBtn.classList.add('listening');
    settingsNameVoiceBtn.textContent = '⏹';
    settingsNameVoiceBtn.setAttribute('aria-label', 'Detener dictado');
    settingsNameVoiceBtn.setAttribute('title', 'Detener dictado');
  } else {
    settingsNameVoiceBtn.textContent = '🎤';
    settingsNameVoiceBtn.setAttribute('aria-label', 'Dictar nombre');
    settingsNameVoiceBtn.setAttribute('title', 'Dictar nombre');
  }
}

function initSettingsNameSpeechToText() {
  updateSettingsNameVoiceButton();
  if (!settingsNameVoiceBtn || !nameSttSupported || !settingsMemberName) {
    return;
  }

  settingsNameRecognizer = new SpeechRecognitionCtor();
  settingsNameRecognizer.lang = 'es-SV';
  settingsNameRecognizer.continuous = false;
  settingsNameRecognizer.interimResults = true;
  settingsNameRecognizer.maxAlternatives = 1;

  settingsNameRecognizer.onstart = () => {
    settingsNameListening = true;
    settingsNameBaseValue = String(settingsMemberName.value || '').trim();
    updateSettingsNameVoiceButton();
    setStatus('Escuchando nombre...', 'ok');
  };

  settingsNameRecognizer.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      transcript += event.results[i][0].transcript;
    }

    transcript = transcript.trim();
    if (!transcript) {
      return;
    }

    settingsMemberName.value = settingsNameBaseValue
      ? `${settingsNameBaseValue} ${transcript}`.replace(/\s+/g, ' ').trim()
      : transcript;
  };

  settingsNameRecognizer.onerror = () => {
    setStatus('No se pudo usar el micrófono para dictar nombre', 'error');
  };

  settingsNameRecognizer.onend = () => {
    settingsNameListening = false;
    updateSettingsNameVoiceButton();
  };

  settingsNameVoiceBtn.addEventListener('click', () => {
    if (!settingsNameRecognizer) {
      return;
    }

    if (settingsNameListening) {
      speak('Deteniendo dictado de nombre.');
      settingsNameRecognizer.stop();
      return;
    }

    try {
      speak('Iniciando dictado de nombre.', 'critical');
      settingsNameRecognizer.start();
    } catch (error) {
      setStatus('No se pudo iniciar dictado por voz', 'error');
    }
  });
}

function narrateSettingsActions(member) {
  if (!member) {
    return;
  }

  speak(
    `Configuración de ${member.name}. Opciones disponibles: ` +
      'uno, editar nombre con teclado o micrófono. ' +
      'dos, seleccionar género entre socia y socio. ' +
      'tres, agregar fichas en préstamo principal. ' +
      'cuatro, agregar fichas en interés. ' +
      'cinco, guardar cambios. ' +
      'seis, eliminar socio o socia.',
    'critical',
  );
}

function setStatus(message, type = '') {
  statusMsg.textContent = message;
  statusMsg.className = 'status-msg';
  if (type) {
    statusMsg.classList.add(type);
  }
}

function speakWizardStep(stepKey, message) {
  if (memberWizardLastStep === stepKey) {
    return;
  }
  memberWizardLastStep = stepKey;
  speak(message, 'critical');
}

function cleanOptionForSpeech(text) {
  return String(text || '')
    .replace(/\//g, ' o ')
    .replace(/\s+/g, ' ')
    .trim();
}

function narrateSelectStep(stepKey, stepNumber, stepLabel, selectElement) {
  if (!selectElement || !selectElement.options?.length) {
    return;
  }

  const options = Array.from(selectElement.options).map((opt) => cleanOptionForSpeech(opt.textContent));
  const first = options[0] || '';
  const second = options[1] || '';

  let message = `Paso ${stepNumber}: ${stepLabel}.`;
  if (first) {
    message += ` Primera opción: ${first}.`;
  }
  if (second) {
    message += ` Segunda opción: ${second}.`;
  }
  if (options.length > 2) {
    message += ` Hay ${options.length} opciones en total.`;
  }

  speakWizardStep(stepKey, message);
}

function narrateSimpleStep(stepKey, message) {
  speakWizardStep(stepKey, message);
}

function getWizardMode() {
  return 'new';
}

function isWizardRowVisible(row, mode) {
  const rowMode = row.dataset.mode;
  if (!rowMode) {
    return true;
  }
  return rowMode === mode;
}

function narrateCurrentWizardStep() {
  if (memberWizardCurrentStep === 1) {
    narrateSelectStep('wizard-step-1', 1, 'seleccione el género', memberGenderSelect);
    return;
  }
  if (memberWizardCurrentStep === 2) {
    narrateSimpleStep(
      'wizard-step-2',
      'Paso 2: escriba nombre y puede añadir foto. Primera opción: teclado. Segunda opción: micrófono.',
    );
    return;
  }
  if (memberWizardCurrentStep === 3) {
    narrateSimpleStep(
      'wizard-step-3',
      'Paso 3: registre préstamo e interés. Primera opción: escribir monto. Segunda opción: usar fichas.',
    );
    return;
  }

  narrateSimpleStep('wizard-step-4', 'Paso 4: confirme y guarde.');
}

function focusWizardStep() {
  const mode = getWizardMode();
  const rows = wizardStepRows.filter(
    (row) => Number(row.dataset.step) === memberWizardCurrentStep && isWizardRowVisible(row, mode),
  );
  const focusable = rows
    .flatMap((row) => Array.from(row.querySelectorAll('select, input, button')))
    .find((element) => !element.disabled);

  if (focusable) {
    focusable.focus();
  }
}

function renderMemberWizardStep() {
  const mode = getWizardMode();
  for (const row of wizardStepRows) {
    const rowStep = Number(row.dataset.step);
    const visible = rowStep === memberWizardCurrentStep && isWizardRowVisible(row, mode);
    row.classList.toggle('active', visible);
  }

  if (memberWizardProgress) {
    memberWizardProgress.textContent = `Paso ${memberWizardCurrentStep} de ${memberWizardTotalSteps}`;
  }

  if (memberWizardPrevBtn) {
    memberWizardPrevBtn.disabled = memberWizardCurrentStep <= 1;
  }

  if (memberWizardNextBtn) {
    memberWizardNextBtn.classList.toggle('hidden', memberWizardCurrentStep >= memberWizardTotalSteps);
  }

  if (memberSaveBtn) {
    memberSaveBtn.classList.toggle('hidden', memberWizardCurrentStep !== memberWizardTotalSteps);
  }
}

function validateWizardStep(stepNumber) {
  if (stepNumber === 2) {
    if (!String(memberNameInput?.value || '').trim()) {
      setStatus('Ingrese nombre del nuevo socio o socia', 'error');
      speak('Ingrese nombre del nuevo socio o socia.', 'critical');
      return false;
    }
  }

  if (stepNumber === 3) {
    const principal = Number.parseFloat(principalTotalInput?.value || '0');
    const interest = Number.parseFloat(interestTotalInput?.value || '0');
    if (!Number.isFinite(principal) || !Number.isFinite(interest) || principal < 0 || interest < 0) {
      setStatus('Ingrese préstamo e interés válidos', 'error');
      speak('Ingrese préstamo e interés válidos.', 'critical');
      return false;
    }
  }

  return true;
}

function goToWizardStep(stepNumber) {
  memberWizardCurrentStep = Math.max(1, Math.min(memberWizardTotalSteps, stepNumber));
  renderMemberWizardStep();
  narrateCurrentWizardStep();
  focusWizardStep();
}

function goToNextWizardStep() {
  if (!validateWizardStep(memberWizardCurrentStep)) {
    return;
  }
  goToWizardStep(memberWizardCurrentStep + 1);
}

function goToPrevWizardStep() {
  goToWizardStep(memberWizardCurrentStep - 1);
}

function openMemberAdminModal() {
  if (!memberAdminModal) {
    return;
  }

  memberAdminModal.classList.remove('hidden');
  memberAdminModal.setAttribute('aria-hidden', 'false');
  memberWizardLastStep = '';
  goToWizardStep(1);
}

function closeMemberAdminModal() {
  if (!memberAdminModal) {
    return;
  }

  memberAdminModal.classList.add('hidden');
  memberAdminModal.setAttribute('aria-hidden', 'true');
  memberWizardLastStep = '';
  memberWizardCurrentStep = 1;
}

function announceMemberWizardStep() {
  const mode = memberMode?.value || 'new';
  const gender = normalizeGender(memberGenderSelect?.value);
  const noun = memberNoun(gender);

  if (mode === 'new') {
    narrateSelectStep(`step-gender-${gender}`, 2, 'seleccione el género del socio', memberGenderSelect);
    narrateSimpleStep(
      `step-new-name-${gender}`,
      `Paso 3: escriba el nombre del nuevo ${noun}. Primera opción: escribir en teclado. Segunda opción: dictar con micrófono.`,
    );
    return;
  }

  narrateSelectStep(`step-gender-existing-${gender}`, 2, 'seleccione el género del socio', memberGenderSelect);
  narrateSelectStep(
    `step-existing-pick-${gender}`,
    3,
    `elija el ${noun} existente`,
    existingMemberSelect,
  );
}

function getSelectedMember() {
  return state.members.find((member) => member.id === selectedMemberId) || null;
}

function memberHasPending(member) {
  return (
    member.loan.principal_remaining > 0 ||
    member.loan.interest_remaining > 0 ||
    member.loan.current_payment.principal > 0 ||
    member.loan.current_payment.interest > 0
  );
}

function pickBestMemberId() {
  const withPending = state.members.find((member) => memberHasPending(member));
  if (withPending) {
    return withPending.id;
  }
  return state.members.length ? state.members[0].id : null;
}

function ensureSelectedMember() {
  if (!state.members.length) {
    selectedMemberId = null;
    return;
  }

  const selectedExists = state.members.some((member) => member.id === selectedMemberId);
  if (!selectedExists) {
    selectedMemberId = pickBestMemberId();
  }
}

function getMemberById(memberId) {
  return state.members.find((member) => member.id === memberId) || null;
}

function saveDraftForMember(memberId) {
  if (!Number.isInteger(memberId)) {
    return;
  }

  paymentDraftByMemberId.set(memberId, {
    principal: Number(draft.principal || 0),
    interest: Number(draft.interest || 0),
  });
}

function clearDraftForMember(memberId) {
  if (!Number.isInteger(memberId)) {
    return;
  }
  paymentDraftByMemberId.delete(memberId);
}

function hydrateDraftFromState() {
  const member = getSelectedMember();
  if (!member) {
    draft = { principal: 0, interest: 0 };
    return;
  }

  const savedDraft = paymentDraftByMemberId.get(member.id);
  if (savedDraft) {
    draft = {
      principal: Number(savedDraft.principal || 0),
      interest: Number(savedDraft.interest || 0),
    };
    return;
  }

  draft = {
    principal: member.loan.current_payment.principal,
    interest: member.loan.current_payment.interest,
  };
}

function renderMeeting() {
  if (!meetingBadge) {
    return;
  }
  const started = new Date(state.meeting.started_at).toLocaleString();
  meetingBadge.textContent = `Reunión ${state.meeting.id} | ${started}`;
}

function memberPhotoMarkup(member, cssClass, altText) {
  if (member.photo_url) {
    return `<img class="${cssClass}" src="${member.photo_url}" alt="${altText}" />`;
  }
  return member.photo_emoji;
}

function memberCardTemplate(member) {
  const selectedClass = member.id === selectedMemberId ? 'selected' : '';
  return `
    <article class="member-card ${member.attendance} ${selectedClass}" data-member-id="${member.id}">
      <button
        class="member-config-btn"
        type="button"
        data-member-id="${member.id}"
        aria-label="Configurar ${member.name}"
        title="Configurar ${member.name}"
      >⚙️</button>
      <p class="member-photo">${memberPhotoMarkup(member, 'member-photo-img', member.name)}</p>
      <p class="member-name">${member.name}</p>
      <div class="attendance-row">
        <button class="att-btn present" data-member-id="${member.id}" data-status="present">✔</button>
        <button class="att-btn absent" data-member-id="${member.id}" data-status="absent">✖</button>
      </div>
    </article>
  `;
}

function renderMembers() {
  memberGrid.innerHTML = state.members.map(memberCardTemplate).join('');
  renderExistingMemberOptions();
}

function renderExistingMemberOptions() {
  if (!existingMemberSelect) {
    return;
  }

  existingMemberSelect.innerHTML = state.members
    .map(
      (member) =>
        `<option value="${member.id}">${member.name} (${memberNounCapitalized(member.gender)})</option>`,
    )
    .join('');

  const current = getSelectedMember();
  if (current) {
    existingMemberSelect.value = String(current.id);
    if (memberGenderSelect) {
      memberGenderSelect.value = normalizeGender(current.gender);
    }
  }
}

function renderSelectedMemberPanel() {
  const member = getSelectedMember();
  if (!member) {
    selectedMemberInfo.classList.add('empty');
    selectedMemberInfo.textContent = 'Seleccione un socio o socia';
    principalAmount.textContent = '$0.00';
    interestAmount.textContent = '$0.00';
    principalRemaining.textContent = '';
    interestRemaining.textContent = '';
    return;
  }

  selectedMemberInfo.classList.remove('empty');
  selectedMemberInfo.innerHTML = `
    <span class="selected-member-photo">${memberPhotoMarkup(member, 'selected-member-photo-img', member.name)}</span>
    <span class="selected-member-name">${member.name}</span>
  `;

  principalAmount.textContent = money(draft.principal);
  interestAmount.textContent = money(draft.interest);

  const principalDelta =
    member.loan.principal_remaining + member.loan.current_payment.principal - draft.principal;
  const interestDelta =
    member.loan.interest_remaining + member.loan.current_payment.interest - draft.interest;

  principalRemaining.textContent =
    principalDelta >= 0
      ? `Falta: ${money(principalDelta)}`
      : `Vuelto: ${money(Math.abs(principalDelta))}`;
  interestRemaining.textContent =
    interestDelta >= 0
      ? `Falta: ${money(interestDelta)}`
      : `Vuelto: ${money(Math.abs(interestDelta))}`;
}

function tokenTemplate(tokenEntry) {
  const value = Number(tokenEntry.value);
  const normalized = value.toFixed(2);
  const coinSrc = coinImageByValue[normalized];
  const billSrc = billImageByValue[normalized];
  const numeric = value;

  if (tokenEntry.kind === 'coin' && coinSrc) {
    return `
      <button type="button" class="money-token" draggable="true" data-value="${value}" title="${money(value)}">
        <img class="coin-image" src="${coinSrc}" alt="Moneda ${money(value)}" />
        <span class="coin-value">${money(value)}</span>
      </button>
    `;
  }

  if (tokenEntry.kind === 'bill' && billSrc) {
    return `
      <button type="button" class="money-token bill-token" draggable="true" data-value="${value}" title="${money(value)}">
        <img class="bill-image" src="${billSrc}" alt="Billete ${money(value)}" />
        <span class="coin-value">${money(value)}</span>
      </button>
    `;
  }

  if (coinSrc) {
    return `
      <button type="button" class="money-token" draggable="true" data-value="${value}" title="${money(value)}">
        <img class="coin-image" src="${coinSrc}" alt="Moneda ${money(value)}" />
        <span class="coin-value">${money(value)}</span>
      </button>
    `;
  }

  if (billSrc) {
    return `
      <button type="button" class="money-token bill-token" draggable="true" data-value="${value}" title="${money(value)}">
        <img class="bill-image" src="${billSrc}" alt="Billete ${money(value)}" />
        <span class="coin-value">${money(value)}</span>
      </button>
    `;
  }

  if (numeric >= 5) {
    return `
      <button type="button" class="money-token bill-token" draggable="true" data-value="${value}" title="${money(value)}">
        <span class="bill-top">Billete</span>
        <span class="bill-value">${money(value)}</span>
      </button>
    `;
  }

  return `<button type="button" class="money-token" draggable="true" data-value="${value}">${money(value)}</button>`;
}

function renderTokens() {
  const tokenEntries = buildTokenEntries();
  tokenRack.innerHTML = tokenEntries.map(tokenTemplate).join('');
}

function clearTouchDropHighlight() {
  if (!touchDropHighlightEl) {
    return;
  }

  touchDropHighlightEl.classList.remove('touch-drop-over');
  touchDropHighlightEl.classList.remove('drag-over');
  touchDropHighlightEl = null;
}

function setTouchDropHighlight(element, type) {
  clearTouchDropHighlight();
  if (!element) {
    return;
  }

  if (type === 'jar') {
    element.classList.add('drag-over');
  } else {
    element.classList.add('touch-drop-over');
  }
  touchDropHighlightEl = element;
}

function clearTouchDragGhost() {
  if (touchDragGhost?.parentNode) {
    touchDragGhost.parentNode.removeChild(touchDragGhost);
  }
  touchDragGhost = null;
}

function clearTouchDrag() {
  if (touchDragState?.tokenElement) {
    touchDragState.tokenElement.classList.remove('touch-dragging');
  }
  touchDragState = null;
  clearTouchDragGhost();
  clearTouchDropHighlight();
}

function getTokenSection(tokenElement) {
  if (tokenRack?.contains(tokenElement)) {
    return 'payment';
  }
  if (memberForm?.contains(tokenElement)) {
    return 'admin';
  }
  if (memberSettingsForm?.contains(tokenElement)) {
    return 'settings';
  }
  return null;
}

function createTouchDragGhost(tokenElement) {
  const ghost = tokenElement.cloneNode(true);
  ghost.classList.add('touch-drag-ghost');
  ghost.removeAttribute('draggable');
  document.body.appendChild(ghost);
  return ghost;
}

function updateTouchDragGhostPosition(touch) {
  if (!touchDragGhost) {
    return;
  }
  touchDragGhost.style.left = `${touch.clientX}px`;
  touchDragGhost.style.top = `${touch.clientY}px`;
}

function resolveAdminDropTarget(element) {
  if (!element) {
    return null;
  }
  if (element.closest('#principalTotalInput') || element.closest('#adminPrincipalTokens')) {
    return {
      target: 'principal',
      highlightEl: principalTotalInput || adminPrincipalTokens,
      highlightType: 'field',
    };
  }
  if (element.closest('#interestTotalInput') || element.closest('#adminInterestTokens')) {
    return {
      target: 'interest',
      highlightEl: interestTotalInput || adminInterestTokens,
      highlightType: 'field',
    };
  }
  return null;
}

function resolveSettingsDropTarget(element) {
  if (!element) {
    return null;
  }
  if (element.closest('#settingsPrincipalTotal') || element.closest('#settingsPrincipalTokens')) {
    return {
      target: 'principal',
      highlightEl: settingsPrincipalTotal || settingsPrincipalTokens,
      highlightType: 'field',
    };
  }
  if (element.closest('#settingsInterestTotal') || element.closest('#settingsInterestTokens')) {
    return {
      target: 'interest',
      highlightEl: settingsInterestTotal || settingsInterestTokens,
      highlightType: 'field',
    };
  }
  return null;
}

function resolvePaymentDropTarget(element) {
  if (!element) {
    return null;
  }

  const jar = element.closest('.jar[data-target]');
  if (!jar) {
    return null;
  }

  return {
    target: jar.dataset.target,
    highlightEl: jar,
    highlightType: 'jar',
  };
}

function resolveTouchDrop(section, x, y) {
  const element = document.elementFromPoint(x, y);
  if (!element) {
    return null;
  }

  if (section === 'payment') {
    return resolvePaymentDropTarget(element);
  }
  if (section === 'admin') {
    return resolveAdminDropTarget(element);
  }
  if (section === 'settings') {
    return resolveSettingsDropTarget(element);
  }

  return null;
}

function applyTouchDrop(section, target, value) {
  if (!Number.isFinite(value) || value <= 0) {
    return;
  }

  if (section === 'payment') {
    addToDraft(target, value);
    return;
  }

  if (section === 'admin') {
    addToLoanInput(target, value);
    const targetLabel = target === 'principal' ? 'préstamo' : 'interés';
    speak(`Monto añadido a ${targetLabel}: ${amountToSpeech(value)}.`, 'critical');
    return;
  }

  if (section === 'settings') {
    addToSettingsLoanInput(target, value);
    const targetLabel = target === 'principal' ? 'préstamo principal' : 'interés';
    speak(`Monto añadido a ${targetLabel}: ${amountToSpeech(value)}.`, 'critical');
  }
}

function onTokenTouchStart(event) {
  if (event.touches.length !== 1) {
    return;
  }

  const token = event.target.closest('.money-token');
  if (!token) {
    return;
  }

  const value = Number(token.dataset.value);
  const section = getTokenSection(token);
  if (!Number.isFinite(value) || value <= 0 || !section) {
    return;
  }

  touchDragState = {
    value,
    section,
    tokenElement: token,
    lastDrop: null,
  };
  touchDragGhost = createTouchDragGhost(token);
  token.classList.add('touch-dragging');
  updateTouchDragGhostPosition(event.touches[0]);
  event.preventDefault();
}

function onTokenTouchMove(event) {
  if (!touchDragState || event.touches.length !== 1) {
    return;
  }

  const touch = event.touches[0];
  updateTouchDragGhostPosition(touch);
  const drop = resolveTouchDrop(touchDragState.section, touch.clientX, touch.clientY);
  touchDragState.lastDrop = drop;

  if (drop?.highlightEl) {
    setTouchDropHighlight(drop.highlightEl, drop.highlightType);
  } else {
    clearTouchDropHighlight();
  }

  event.preventDefault();
}

function onTokenTouchEnd(event) {
  if (!touchDragState) {
    return;
  }

  const touch = event.changedTouches?.[0];
  const fallbackDrop = touch
    ? resolveTouchDrop(touchDragState.section, touch.clientX, touch.clientY)
    : null;
  const finalDrop = fallbackDrop || touchDragState.lastDrop;

  if (finalDrop?.target) {
    applyTouchDrop(touchDragState.section, finalDrop.target, touchDragState.value);
  }

  clearTouchDrag();
  event.preventDefault();
}

function onTokenTouchCancel() {
  clearTouchDrag();
}

function renderAdminLoanTokens() {
  const tokenEntries = buildTokenEntries();
  const html = tokenEntries
    .map((entry) => {
      const token = tokenTemplate(entry).replace('money-token', 'money-token admin-money-token');
      return token;
    })
    .join('');

  if (adminPrincipalTokens) {
    adminPrincipalTokens.innerHTML = html;
  }
  if (adminInterestTokens) {
    adminInterestTokens.innerHTML = html;
  }
  if (settingsPrincipalTokens) {
    settingsPrincipalTokens.innerHTML = html;
  }
  if (settingsInterestTokens) {
    settingsInterestTokens.innerHTML = html;
  }
}

function renderJarSelection() {
  jarPrincipalBtn.classList.toggle('active', activeJar === 'principal');
  jarInterestBtn.classList.toggle('active', activeJar === 'interest');
}

function renderAll() {
  renderMeeting();
  renderMembers();
  renderSelectedMemberPanel();
  renderTokens();
  renderAdminLoanTokens();
  renderJarSelection();
}

function addToLoanInput(target, value) {
  if (!Number.isFinite(value)) {
    return;
  }

  const input = target === 'principal' ? principalTotalInput : interestTotalInput;
  if (!input) {
    return;
  }

  const currentValue = Number.parseFloat(input.value || '0') || 0;
  input.value = (currentValue + value).toFixed(2);
}

function clearLoanInput(target) {
  const input = target === 'principal' ? principalTotalInput : interestTotalInput;
  if (!input) {
    return;
  }

  input.value = '';
}

function addToSettingsLoanInput(target, value) {
  if (!Number.isFinite(value)) {
    return;
  }

  const input = target === 'principal' ? settingsPrincipalTotal : settingsInterestTotal;
  if (!input) {
    return;
  }

  const currentValue = Number.parseFloat(input.value || '0') || 0;
  input.value = (currentValue + value).toFixed(2);
}

function clearSettingsLoanInput(target) {
  const input = target === 'principal' ? settingsPrincipalTotal : settingsInterestTotal;
  if (!input) {
    return;
  }

  input.value = '';
}

function updateMemberModeLabels() {
  if (!memberMode) {
    return;
  }

  const gender = normalizeGender(memberGenderSelect?.value);
  const noun = memberNoun(gender);
  const nounCapitalized = memberNounCapitalized(gender);

  if (memberMode.options[0]) {
    memberMode.options[0].textContent = `Nuevo ${noun}`;
  }
  if (memberMode.options[1]) {
    memberMode.options[1].textContent = `${nounCapitalized} existente`;
  }
}

function canAddToDraft(target, value) {
  const member = getSelectedMember();
  return Boolean(member);
}

function getRemainingForTarget(target) {
  const member = getSelectedMember();
  if (!member) {
    return null;
  }

  if (target === 'principal') {
    return member.loan.principal_remaining + member.loan.current_payment.principal - draft.principal;
  }

  return member.loan.interest_remaining + member.loan.current_payment.interest - draft.interest;
}

function speakRemainingForTarget(target) {
  const remaining = getRemainingForTarget(target);
  if (remaining === null) {
    speak('Seleccione un socio o socia primero', 'critical');
    return;
  }

  const targetLabel = target === 'principal' ? 'principal' : 'interés';
  if (remaining <= 0.001) {
    if (target === 'principal') {
      speak('Préstamo pagado.');
    } else {
      speak('Interés pagado.');
    }
    return;
  }

  if (remaining >= 0) {
    speak(`En ${targetLabel}, falta ${amountToSpeech(remaining)}`);
  } else {
    speak(`En ${targetLabel}, debe dar vuelto de ${amountToSpeech(Math.abs(remaining))}`);
  }
}

function addToDraft(target, value) {
  if (!selectedMemberId) {
    setStatus('Seleccione un socio o socia primero', 'error');
    speak('Seleccione un socio o socia primero', 'critical');
    return;
  }
  if (!canAddToDraft(target, value)) {
    setStatus('Seleccione un socio o socia primero', 'error');
    speak('Seleccione un socio o socia primero', 'critical');
    return;
  }
  if (target === 'principal') {
    draft.principal = +(draft.principal + value).toFixed(2);
  } else {
    draft.interest = +(draft.interest + value).toFixed(2);
  }
  saveDraftForMember(selectedMemberId);
  setStatus('Monto agregado', 'ok');
  scheduleDraftSummarySpeech(target);
  renderSelectedMemberPanel();
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Error de servidor');
  }
  return data;
}

async function updateAttendance(memberId, status) {
  try {
    const data = await postJson('/api/attendance', { member_id: memberId, status });
    state = data.state;
    ensureSelectedMember();
    hydrateDraftFromState();
    renderAll();
    setStatus('Asistencia actualizada', 'ok');
    const member = getMemberById(memberId);
    const statusLabel = status === 'present' ? 'presente' : 'ausente';
    const memberName = member ? member.name : 'persona';
    speak(`${memberName}, ${statusLabel}`);
  } catch (error) {
    setStatus(error.message, 'error');
    speak(error.message, 'critical');
  }
}

async function savePayment() {
  if (paymentSaveInFlight) {
    return;
  }

  if (!selectedMemberId) {
    setStatus('Seleccione un socio o socia', 'error');
    speak('Seleccione un socio o socia', 'critical');
    return;
  }

  if (draft.principal === 0 && draft.interest === 0) {
    setStatus('Pago vacío', 'error');
    speak('Pago vacío', 'critical');
    return;
  }

  const paidPrincipal = draft.principal;
  const paidInterest = draft.interest;
  const memberIdToSave = selectedMemberId;
  saveDraftForMember(memberIdToSave);

  try {
    paymentSaveInFlight = true;
    const data = await postJson('/api/payment', {
      member_id: memberIdToSave,
      principal: draft.principal,
      interest: draft.interest,
    });
    state = data.state;
    ensureSelectedMember();
    hydrateDraftFromState();
    renderAll();

    const summary = data.payment_summary;
    const changePrincipal = Number(summary?.change?.principal || 0);
    const changeInterest = Number(summary?.change?.interest || 0);
    const totalChange = Number(summary?.change?.total || changePrincipal + changeInterest || 0);
    const hasChange = changePrincipal > 0.001 || changeInterest > 0.001 || totalChange > 0.001;
    const selected = getSelectedMember();
    const principalPaid = Boolean(selected) && selected.loan.principal_remaining <= 0.001;
    const interestPaid = Boolean(selected) && selected.loan.interest_remaining <= 0.001;

    const paidParts = [];
    if (principalPaid) {
      paidParts.push('préstamo principal pagado');
    }
    if (interestPaid) {
      paidParts.push('interés pagado');
    }

    const paidSummary = paidParts.join(' y ');

    if (hasChange) {
      const changeValue = totalChange > 0.001 ? totalChange : changePrincipal + changeInterest;
      if (paidSummary) {
        setStatus(`${paidSummary.charAt(0).toUpperCase()}${paidSummary.slice(1)}, vuelto ${money(changeValue)}`, 'ok');
        speak(`${paidSummary}, vuelto ${money(changeValue)}.`, 'critical');
      } else {
        setStatus(`Pago guardado, vuelto ${money(changeValue)}`, 'ok');
        speak(`Pago guardado, vuelto ${money(changeValue)}.`, 'critical');
      }
    } else {
      setStatus('Pago guardado', 'ok');
      if (paidSummary) {
        speak(`Pago guardado. ${paidSummary}.`);
      } else {
        const parts = [];
        if (paidPrincipal > 0) {
          parts.push(`Principal ${amountToSpeech(paidPrincipal)}`);
        }
        if (paidInterest > 0) {
          parts.push(`Interés ${amountToSpeech(paidInterest)}`);
        }
        speak(parts.length ? `Pago guardado. ${parts.join('. ')}.` : 'Pago guardado.');
      }
    }

    clearDraftSummarySpeech();
    clearDraftForMember(memberIdToSave);
  } catch (error) {
    setStatus(error.message, 'error');
    speak(error.message, 'critical');
  } finally {
    paymentSaveInFlight = false;
  }
}

async function startNewMeeting() {
  try {
    const data = await postJson('/api/meeting/new', {});
    state = data.state;
    paymentDraftByMemberId.clear();
    ensureSelectedMember();
    hydrateDraftFromState();
    renderAll();
    setStatus('Nueva reunión iniciada', 'ok');
    speak('Nueva reunión iniciada');
  } catch (error) {
    setStatus(error.message, 'error');
    speak(error.message, 'critical');
  }
}

async function resetDemoData() {
  try {
    const data = await postJson('/api/demo/reset', {});
    state = data.state;
    paymentDraftByMemberId.clear();
    ensureSelectedMember();
    hydrateDraftFromState();
    renderAll();
    setStatus('Demo reiniciado', 'ok');
    speak('Demo reiniciado', 'critical');
  } catch (error) {
    setStatus(error.message, 'error');
    speak(error.message, 'critical');
  }
}

function handleMemberModeChange() {
  if (!memberNameInput) {
    return;
  }

  memberNameInput.required = true;

  renderMemberWizardStep();
}

async function saveMember(event) {
  event.preventDefault();
  if (!memberForm) {
    return;
  }

  if (memberWizardCurrentStep < memberWizardTotalSteps) {
    setStatus('Complete el paso y use Siguiente para continuar', 'ok');
    return;
  }

  const formData = new FormData(memberForm);
  const typedName = String(memberNameInput?.value || '').trim();
  const effectiveMode = 'new';

  formData.set('mode', effectiveMode);
  formData.delete('member_id');

  if (effectiveMode === 'new' && !typedName) {
    const noun = memberNoun(memberGenderSelect?.value);
    setStatus(`Ingrese nombre del nuevo ${noun}`, 'error');
    speak(`Ingrese nombre del nuevo ${noun}`, 'critical');
    return;
  }

  try {
    const response = await fetch('/api/member/save', {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'No se pudo guardar socio o socia');
    }

    state = data.state;
    selectedMemberId = data.member_id;
    ensureSelectedMember();
    hydrateDraftFromState();
    renderAll();
    const savedMember = getSelectedMember();
    const noun = memberNoun(savedMember?.gender || memberGenderSelect?.value);
    setStatus(`${memberNounCapitalized(savedMember?.gender || memberGenderSelect?.value)} y préstamo guardados`, 'ok');
    speak(`${noun} y préstamo guardados`);
    closeMemberAdminModal();
    renderMemberWizardStep();

    if (memberPhotoInput) {
      memberPhotoInput.value = '';
    }
  } catch (error) {
    setStatus(error.message, 'error');
    speak(error.message, 'critical');
  }
}

function openMemberSettingsModal(memberId) {
  const member = getMemberById(memberId);
  if (!member || !memberSettingsModal) {
    return;
  }

  settingsMemberId.value = String(member.id);
  settingsMemberName.value = String(member.name || '');
  settingsMemberGender.value = normalizeGender(member.gender);
  settingsPrincipalTotal.value = Number(member.loan.principal_total || 0).toFixed(2);
  settingsInterestTotal.value = Number(member.loan.interest_total || 0).toFixed(2);

  memberSettingsModal.classList.remove('hidden');
  memberSettingsModal.setAttribute('aria-hidden', 'false');
  settingsMemberName.focus();
  narrateSettingsActions(member);
}

function closeMemberSettingsModal() {
  if (!memberSettingsModal) {
    return;
  }
  memberSettingsModal.classList.add('hidden');
  memberSettingsModal.setAttribute('aria-hidden', 'true');
}

async function saveMemberSettings(event) {
  event.preventDefault();
  const memberId = Number(settingsMemberId?.value || 0);
  const name = String(settingsMemberName?.value || '').trim();
  const gender = normalizeGender(settingsMemberGender?.value);
  const principalTotal = Number.parseFloat(settingsPrincipalTotal?.value || '0');
  const interestTotal = Number.parseFloat(settingsInterestTotal?.value || '0');

  if (!memberId) {
    setStatus('Socio/a invalido/a', 'error');
    speak('Socio o socia invalido', 'critical');
    return;
  }
  if (!name) {
    setStatus('Nombre requerido', 'error');
    speak('Nombre requerido', 'critical');
    return;
  }
  if (!Number.isFinite(principalTotal) || !Number.isFinite(interestTotal) || principalTotal < 0 || interestTotal < 0) {
    setStatus('Ingrese préstamo e interés válidos', 'error');
    speak('Ingrese préstamo e interés válidos.', 'critical');
    return;
  }

  try {
    const data = await postJson('/api/member/update', {
      member_id: memberId,
      name,
      gender,
      principal_total: principalTotal,
      interest_total: interestTotal,
    });

    state = data.state;
    if (Number.isInteger(selectedMemberId)) {
      saveDraftForMember(selectedMemberId);
    }
    selectedMemberId = memberId;
    ensureSelectedMember();
    hydrateDraftFromState();
    renderAll();
    handleMemberModeChange();
    setStatus('Cambios del socio/a guardados', 'ok');
    speak('Cambios guardados', 'critical');
    closeMemberSettingsModal();
  } catch (error) {
    setStatus(error.message, 'error');
    speak(error.message, 'critical');
  }
}

async function deleteMemberFromSettings() {
  const selectedExistingId = Number(settingsMemberId?.value || 0);
  if (!selectedExistingId) {
    setStatus('Seleccione un socio o socia para eliminar', 'error');
    speak('Seleccione un socio o socia para eliminar', 'critical');
    return;
  }

  const member = getMemberById(selectedExistingId);
  const memberName = member?.name || 'este socio';
  const confirmed = window.confirm(`¿Eliminar a ${memberName}? Esta acción no se puede deshacer.`);
  if (!confirmed) {
    return;
  }

  try {
    const data = await postJson('/api/member/delete', { member_id: selectedExistingId });
    state = data.state;
    paymentDraftByMemberId.delete(selectedExistingId);
    ensureSelectedMember();
    hydrateDraftFromState();
    renderAll();
    handleMemberModeChange();

    const hasMembers = Array.isArray(state.members) && state.members.length > 0;
    if (!hasMembers && memberMode) {
      memberMode.value = 'new';
      handleMemberModeChange();
      goToWizardStep(1);
    }

    setStatus('Socio/a eliminado/a', 'ok');
    speak('Socio o socia eliminado', 'critical');
    closeMemberSettingsModal();
  } catch (error) {
    setStatus(error.message, 'error');
    speak(error.message, 'critical');
  }
}

memberGrid.addEventListener('click', (event) => {
  const configBtn = event.target.closest('.member-config-btn');
  if (configBtn) {
    const memberId = Number(configBtn.dataset.memberId);
    if (Number.isInteger(memberId) && memberId > 0) {
      openMemberSettingsModal(memberId);
    }
    return;
  }

  if (paymentSaveInFlight) {
    setStatus('Guardando pago, espere un momento', 'ok');
    return;
  }

  const attendanceBtn = event.target.closest('.att-btn');
  if (attendanceBtn) {
    const memberId = Number(attendanceBtn.dataset.memberId);
    const status = attendanceBtn.dataset.status;
    updateAttendance(memberId, status);
    return;
  }

  const card = event.target.closest('.member-card');
  if (!card) {
    return;
  }

  if (Number.isInteger(selectedMemberId)) {
    saveDraftForMember(selectedMemberId);
  }

  selectedMemberId = Number(card.dataset.memberId);
  clearDraftSummarySpeech();
  hydrateDraftFromState();
  renderAll();
  const member = getSelectedMember();
  if (member) {
    const noun = memberNounCapitalized(member.gender);
    const adjective = selectedAdjective(member.gender);
    setStatus(`${noun} ${adjective}`, 'ok');
    speak(`${noun} ${adjective}: ${member.name}`);
  } else {
    setStatus('Persona seleccionada', 'ok');
  }
});

tokenRack.addEventListener('click', (event) => {
  const token = event.target.closest('.money-token');
  if (!token) {
    return;
  }
  addToDraft(activeJar, Number(token.dataset.value));
});

function bindAdminTokenRack(rackElement, target) {
  if (!rackElement) {
    return;
  }

  rackElement.addEventListener('click', (event) => {
    const token = event.target.closest('.money-token');
    if (!token) {
      return;
    }
    const value = Number(token.dataset.value);
    addToLoanInput(target, value);
    const targetLabel = target === 'principal' ? 'préstamo' : 'interés';
    speak(`Monto añadido a ${targetLabel}: ${amountToSpeech(value)}.`, 'critical');
  });
}

function bindSettingsTokenRack(rackElement, target) {
  if (!rackElement) {
    return;
  }

  rackElement.addEventListener('click', (event) => {
    const token = event.target.closest('.money-token');
    if (!token) {
      return;
    }
    const value = Number(token.dataset.value);
    addToSettingsLoanInput(target, value);
    const targetLabel = target === 'principal' ? 'préstamo principal' : 'interés';
    speak(`Monto añadido a ${targetLabel}: ${amountToSpeech(value)}.`, 'critical');
  });
}

bindAdminTokenRack(adminPrincipalTokens, 'principal');
bindAdminTokenRack(adminInterestTokens, 'interest');
bindSettingsTokenRack(settingsPrincipalTokens, 'principal');
bindSettingsTokenRack(settingsInterestTokens, 'interest');

document.addEventListener('touchstart', onTokenTouchStart, { passive: false });
document.addEventListener('touchmove', onTokenTouchMove, { passive: false });
document.addEventListener('touchend', onTokenTouchEnd, { passive: false });
document.addEventListener('touchcancel', onTokenTouchCancel, { passive: true });

tokenRack.addEventListener('dragstart', (event) => {
  const token = event.target.closest('.money-token');
  if (!token) {
    return;
  }
  event.dataTransfer.setData('text/plain', token.dataset.value);
});

jars.forEach((jar) => {
  jar.addEventListener('click', () => {
    activeJar = jar.dataset.target;
    renderJarSelection();
    speakRemainingForTarget(activeJar);
  });

  jar.addEventListener('dragover', (event) => {
    event.preventDefault();
    jar.classList.add('drag-over');
  });

  jar.addEventListener('dragleave', () => {
    jar.classList.remove('drag-over');
  });

  jar.addEventListener('drop', (event) => {
    event.preventDefault();
    jar.classList.remove('drag-over');
    const value = Number(event.dataTransfer.getData('text/plain'));
    if (!value) {
      return;
    }
    addToDraft(jar.dataset.target, value);
  });
});

jarPrincipalBtn.addEventListener('click', () => {
  activeJar = 'principal';
  renderJarSelection();
  speakRemainingForTarget(activeJar);
});

jarInterestBtn.addEventListener('click', () => {
  activeJar = 'interest';
  renderJarSelection();
  speakRemainingForTarget(activeJar);
});

resetDraftBtn.addEventListener('click', () => {
  draft = { principal: 0, interest: 0 };
  clearDraftForMember(selectedMemberId);
  clearDraftSummarySpeech();
  renderSelectedMemberPanel();
  setStatus('Borrador limpio', 'ok');
  speak('Borrador limpio');
});

if (ttsToggleBtn) {
  ttsToggleBtn.addEventListener('click', () => {
    if (!speechSupported) {
      return;
    }
    ttsEnabled = !ttsEnabled;
    persistTtsPreference();
    updateTtsButton();
    if (ttsEnabled) {
      speak('Voz activada', 'critical');
    } else {
      window.speechSynthesis.cancel();
    }
  });
}

savePaymentBtn.addEventListener('click', savePayment);
newMeetingBtn.addEventListener('click', startNewMeeting);
if (resetDemoBtn) {
  resetDemoBtn.addEventListener('click', resetDemoData);
}
if (openMemberAdminBtn) {
  openMemberAdminBtn.addEventListener('click', () => {
    openMemberAdminModal();
  });
}
if (closeMemberAdminBtn) {
  closeMemberAdminBtn.addEventListener('click', closeMemberAdminModal);
}
if (memberAdminBackdrop) {
  memberAdminBackdrop.addEventListener('click', closeMemberAdminModal);
}
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeMemberAdminModal();
    closeMemberSettingsModal();
  }
});
if (memberMode) {
  memberMode.addEventListener('change', () => {
    handleMemberModeChange();
    narrateCurrentWizardStep();
  });
}
if (memberGenderSelect) {
  memberGenderSelect.addEventListener('change', () => {
    handleMemberModeChange();
    narrateCurrentWizardStep();
  });
}
if (existingMemberSelect) {
  existingMemberSelect.addEventListener('change', () => {
    if (memberMode) {
      memberMode.value = 'existing';
    }

    const member = getMemberById(Number(existingMemberSelect.value));
    if (!member) {
      return;
    }

    if (memberGenderSelect) {
      memberGenderSelect.value = normalizeGender(member.gender);
    }
    if (memberMode?.value === 'existing' && memberNameInput) {
      memberNameInput.value = member.name;
    }
    handleMemberModeChange();
    speak(`Socio seleccionado: ${member.name}.`, 'critical');
  });
}
if (clearPrincipalBtn) {
  clearPrincipalBtn.addEventListener('click', () => {
    clearLoanInput('principal');
    speak('Préstamo limpiado.', 'critical');
  });
}
if (clearInterestBtn) {
  clearInterestBtn.addEventListener('click', () => {
    clearLoanInput('interest');
    speak('Interés limpiado.', 'critical');
  });
}
if (memberForm) {
  memberForm.addEventListener('submit', saveMember);
}
if (memberPhotoInput) {
  memberPhotoInput.addEventListener('change', () => {
    if (memberPhotoInput.files && memberPhotoInput.files.length) {
      speak('Foto añadida.', 'critical');
    }
  });
}
if (memberWizardPrevBtn) {
  memberWizardPrevBtn.addEventListener('click', goToPrevWizardStep);
}
if (memberWizardNextBtn) {
  memberWizardNextBtn.addEventListener('click', goToNextWizardStep);
}
if (memberSettingsBackdrop) {
  memberSettingsBackdrop.addEventListener('click', closeMemberSettingsModal);
}
if (closeMemberSettingsBtn) {
  closeMemberSettingsBtn.addEventListener('click', closeMemberSettingsModal);
}
if (memberSettingsForm) {
  memberSettingsForm.addEventListener('submit', saveMemberSettings);
}
if (deleteMemberSettingsBtn) {
  deleteMemberSettingsBtn.addEventListener('click', deleteMemberFromSettings);
}
if (settingsMemberName) {
  settingsMemberName.addEventListener('focus', () => {
    speak('Está editando el nombre. Puede escribir o usar el botón de micrófono.');
  });

  settingsMemberName.addEventListener('change', () => {
    const value = String(settingsMemberName.value || '').trim();
    if (!value) {
      return;
    }
    speak(`Nombre actualizado: ${value}.`);
  });
}
if (settingsNameVoiceBtn) {
  settingsNameVoiceBtn.addEventListener('focus', () => {
    speak('Opción de dictado de nombre. Presione para hablar el nombre.');
  });
}
if (settingsMemberGender) {
  settingsMemberGender.addEventListener('focus', () => {
    speak('Está seleccionando género. Opciones: socia o socio.');
  });

  settingsMemberGender.addEventListener('change', () => {
    const noun = memberNoun(settingsMemberGender.value);
    speak(`Está actualizando género. Seleccionado: ${noun}.`);
  });
}
if (settingsPrincipalTotal) {
  settingsPrincipalTotal.addEventListener('focus', () => {
    speak('Está configurando préstamo principal. Puede escribir monto o usar fichas.');
  });

  settingsPrincipalTotal.addEventListener('change', () => {
    const value = Number.parseFloat(settingsPrincipalTotal.value || '0');
    if (!Number.isFinite(value) || value < 0) {
      return;
    }
    speak(`Préstamo principal configurado en ${amountToSpeech(value)}.`);
  });
}
if (settingsInterestTotal) {
  settingsInterestTotal.addEventListener('focus', () => {
    speak('Está configurando interés. Puede escribir monto o usar fichas.');
  });

  settingsInterestTotal.addEventListener('change', () => {
    const value = Number.parseFloat(settingsInterestTotal.value || '0');
    if (!Number.isFinite(value) || value < 0) {
      return;
    }
    speak(`Interés configurado en ${amountToSpeech(value)}.`);
  });
}
if (settingsClearPrincipalBtn) {
  settingsClearPrincipalBtn.addEventListener('focus', () => {
    speak('Opción para limpiar préstamo principal.');
  });

  settingsClearPrincipalBtn.addEventListener('click', () => {
    clearSettingsLoanInput('principal');
    speak('Préstamo principal limpiado.', 'critical');
  });
}
if (settingsClearInterestBtn) {
  settingsClearInterestBtn.addEventListener('focus', () => {
    speak('Opción para limpiar interés.');
  });

  settingsClearInterestBtn.addEventListener('click', () => {
    clearSettingsLoanInput('interest');
    speak('Interés limpiado.', 'critical');
  });
}
if (settingsSaveBtn) {
  settingsSaveBtn.addEventListener('focus', () => {
    speak('Opción guardar cambios del socio o socia.');
  });
}
if (deleteMemberSettingsBtn) {
  deleteMemberSettingsBtn.addEventListener('focus', () => {
    speak('Opción eliminar socio o socia. Acción permanente.');
  });
}

initTts();
initNameSpeechToText();
initSettingsNameSpeechToText();
handleMemberModeChange();
renderMemberWizardStep();
ensureSelectedMember();
hydrateDraftFromState();
renderAll();
setStatus('Lista para registrar', 'ok');
