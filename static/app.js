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
const memberForm = document.getElementById('memberForm');
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
const resetDraftBtn = document.getElementById('resetDraftBtn');
const savePaymentBtn = document.getElementById('savePaymentBtn');
const jarPrincipalBtn = document.getElementById('jarPrincipalBtn');
const jarInterestBtn = document.getElementById('jarInterestBtn');
const jars = document.querySelectorAll('.jar');

let selectedMemberId = null;
let activeJar = 'principal';
let draft = { principal: 0, interest: 0 };
const speechSupported =
  typeof window !== 'undefined' &&
  'speechSynthesis' in window &&
  'SpeechSynthesisUtterance' in window;
let ttsEnabled = loadTtsPreference();
let preferredVoice = null;
let lastSpeech = { text: '', timestamp: 0 };
const SpeechRecognitionCtor =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition || null
    : null;
const nameSttSupported = Boolean(SpeechRecognitionCtor);
let nameRecognizer = null;
let nameListening = false;
let nameBaseValue = '';

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

function amountToSpeech(value) {
  const safeValue = Number(value);
  if (!Number.isFinite(safeValue)) {
    return '0 dolares';
  }

  const abs = Math.abs(safeValue);
  const dollars = Math.floor(abs);
  const cents = Math.round((abs - dollars) * 100);

  if (dollars === 0 && cents > 0) {
    return `${cents} centavos`;
  }

  if (dollars > 0 && cents === 0) {
    return `${dollars} ${dollars === 1 ? 'dolar' : 'dolares'}`;
  }

  if (dollars > 0 && cents > 0) {
    return `${dollars} ${dollars === 1 ? 'dolar' : 'dolares'} con ${cents} centavos`;
  }

  return '0 dolares';
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
    ttsToggleBtn.setAttribute('aria-label', 'Sin voz en espanol');
    ttsToggleBtn.setAttribute('title', 'Sin voz en espanol');
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
  if (lastSpeech.text === normalized && now - lastSpeech.timestamp < 900) {
    return;
  }

  lastSpeech = { text: normalized, timestamp: now };

  if (priority === 'critical') {
    window.speechSynthesis.cancel();
  }

  // Do not speak if no Spanish voice is available; this avoids random English fallback.
  preferredVoice = preferredVoice || pickSpanishVoice();
  if (!preferredVoice) {
    updateTtsButton();
    return;
  }

  const utterance = new SpeechSynthesisUtterance(normalized);
  utterance.lang = preferredVoice.lang;
  utterance.rate = 0.9;
  utterance.pitch = 1.08;
  utterance.voice = preferredVoice;

  window.speechSynthesis.speak(utterance);
}

function initTts() {
  if (!speechSupported) {
    updateTtsButton();
    return;
  }

  preferredVoice = pickSpanishVoice();
  updateTtsButton();
  window.speechSynthesis.onvoiceschanged = () => {
    preferredVoice = pickSpanishVoice();
    updateTtsButton();
  };
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
    setStatus('No se pudo usar el microfono para dictar nombre', 'error');
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

function setStatus(message, type = '') {
  statusMsg.textContent = message;
  statusMsg.className = 'status-msg';
  if (type) {
    statusMsg.classList.add(type);
  }
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
  const current = getSelectedMember();
  if (!selectedExists || !current || !memberHasPending(current)) {
    selectedMemberId = pickBestMemberId();
  }
}

function getMemberById(memberId) {
  return state.members.find((member) => member.id === memberId) || null;
}

function hydrateDraftFromState() {
  const member = getSelectedMember();
  if (!member) {
    draft = { principal: 0, interest: 0 };
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
  meetingBadge.textContent = `Reunion ${state.meeting.id} | ${started}`;
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
      <button class="money-token" draggable="true" data-value="${value}" title="${money(value)}">
        <img class="coin-image" src="${coinSrc}" alt="Moneda ${money(value)}" />
        <span class="coin-value">${money(value)}</span>
      </button>
    `;
  }

  if (tokenEntry.kind === 'bill' && billSrc) {
    return `
      <button class="money-token bill-token" draggable="true" data-value="${value}" title="${money(value)}">
        <img class="bill-image" src="${billSrc}" alt="Billete ${money(value)}" />
        <span class="coin-value">${money(value)}</span>
      </button>
    `;
  }

  if (coinSrc) {
    return `
      <button class="money-token" draggable="true" data-value="${value}" title="${money(value)}">
        <img class="coin-image" src="${coinSrc}" alt="Moneda ${money(value)}" />
        <span class="coin-value">${money(value)}</span>
      </button>
    `;
  }

  if (billSrc) {
    return `
      <button class="money-token bill-token" draggable="true" data-value="${value}" title="${money(value)}">
        <img class="bill-image" src="${billSrc}" alt="Billete ${money(value)}" />
        <span class="coin-value">${money(value)}</span>
      </button>
    `;
  }

  if (numeric >= 5) {
    return `
      <button class="money-token bill-token" draggable="true" data-value="${value}" title="${money(value)}">
        <span class="bill-top">Billete</span>
        <span class="bill-value">${money(value)}</span>
      </button>
    `;
  }

  return `<button class="money-token" draggable="true" data-value="${value}">${money(value)}</button>`;
}

function renderTokens() {
  const tokenEntries = buildTokenEntries();
  tokenRack.innerHTML = tokenEntries.map(tokenTemplate).join('');
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

  const targetLabel = target === 'principal' ? 'principal' : 'interes';
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
  setStatus('Monto agregado', 'ok');
  const targetLabel = target === 'principal' ? 'principal' : 'interes';
  speak(`Agregado ${amountToSpeech(value)} a ${targetLabel}`);
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
  if (!selectedMemberId) {
    setStatus('Seleccione un socio o socia', 'error');
    speak('Seleccione un socio o socia', 'critical');
    return;
  }

  if (draft.principal === 0 && draft.interest === 0) {
    setStatus('Pago vacio', 'error');
    speak('Pago vacio', 'critical');
    return;
  }

  const paidPrincipal = draft.principal;
  const paidInterest = draft.interest;

  try {
    const data = await postJson('/api/payment', {
      member_id: selectedMemberId,
      principal: draft.principal,
      interest: draft.interest,
    });
    state = data.state;
    ensureSelectedMember();
    hydrateDraftFromState();
    renderAll();

    const summary = data.payment_summary;
    const totalChange = summary?.change?.total || 0;
    if (totalChange > 0) {
      setStatus(`Pago guardado. Debe dar vuelto: ${money(totalChange)}`, 'ok');
      speak(`Pago guardado. Debe dar vuelto de ${amountToSpeech(totalChange)}.`);
    } else {
      setStatus('Pago guardado', 'ok');
      speak(
        `Pago guardado. Principal ${amountToSpeech(paidPrincipal)}. Interes ${amountToSpeech(paidInterest)}.`,
      );
    }
  } catch (error) {
    setStatus(error.message, 'error');
    speak(error.message, 'critical');
  }
}

async function startNewMeeting() {
  try {
    const data = await postJson('/api/meeting/new', {});
    state = data.state;
    ensureSelectedMember();
    hydrateDraftFromState();
    renderAll();
    setStatus('Nueva reunion iniciada', 'ok');
    speak('Nueva reunion iniciada');
  } catch (error) {
    setStatus(error.message, 'error');
    speak(error.message, 'critical');
  }
}

async function resetDemoData() {
  try {
    const data = await postJson('/api/demo/reset', {});
    state = data.state;
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
  if (!memberMode || !existingMemberWrap || !memberNameInput) {
    return;
  }

  updateMemberModeLabels();

  const isExisting = memberMode.value === 'existing';
  existingMemberWrap.classList.toggle('hidden', !isExisting);
  memberNameInput.required = !isExisting;

  if (isExisting && existingMemberSelect && !existingMemberSelect.value && selectedMemberId) {
    existingMemberSelect.value = String(selectedMemberId);
  }

  if (isExisting && existingMemberSelect?.value) {
    const member = getMemberById(Number(existingMemberSelect.value));
    if (member && memberGenderSelect) {
      memberGenderSelect.value = normalizeGender(member.gender);
      updateMemberModeLabels();
    }
  }
}

async function saveMember(event) {
  event.preventDefault();
  if (!memberForm) {
    return;
  }

  const formData = new FormData(memberForm);
  const selectedExistingId = String(existingMemberSelect?.value || '').trim();
  const typedName = String(memberNameInput?.value || '').trim();
  const effectiveMode =
    memberMode?.value === 'existing' || (selectedExistingId && typedName.length === 0)
      ? 'existing'
      : 'new';

  formData.set('mode', effectiveMode);
  if (effectiveMode === 'existing') {
    formData.set('member_id', selectedExistingId);
  } else {
    formData.delete('member_id');
  }

  if (effectiveMode === 'existing' && !selectedExistingId) {
    setStatus('Seleccione un socio o socia para actualizar', 'error');
    speak('Seleccione un socio o socia para actualizar', 'critical');
    return;
  }

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
    setStatus(`${memberNounCapitalized(savedMember?.gender || memberGenderSelect?.value)} y prestamo guardados`, 'ok');
    speak(`${noun} y prestamo guardados`);

    if (memberPhotoInput) {
      memberPhotoInput.value = '';
    }
  } catch (error) {
    setStatus(error.message, 'error');
    speak(error.message, 'critical');
  }
}

memberGrid.addEventListener('click', (event) => {
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

  selectedMemberId = Number(card.dataset.memberId);
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
    addToLoanInput(target, Number(token.dataset.value));
  });
}

bindAdminTokenRack(adminPrincipalTokens, 'principal');
bindAdminTokenRack(adminInterestTokens, 'interest');

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
if (memberMode) {
  memberMode.addEventListener('change', handleMemberModeChange);
}
if (memberGenderSelect) {
  memberGenderSelect.addEventListener('change', handleMemberModeChange);
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
  });
}
if (clearPrincipalBtn) {
  clearPrincipalBtn.addEventListener('click', () => clearLoanInput('principal'));
}
if (clearInterestBtn) {
  clearInterestBtn.addEventListener('click', () => clearLoanInput('interest'));
}
if (memberForm) {
  memberForm.addEventListener('submit', saveMember);
}

initTts();
initNameSpeechToText();
handleMemberModeChange();
ensureSelectedMember();
hydrateDraftFromState();
renderAll();
setStatus('Lista para registrar', 'ok');
