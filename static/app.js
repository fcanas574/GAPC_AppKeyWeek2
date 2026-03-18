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
const ttsToggleBtn = document.getElementById('ttsToggleBtn');
const resetDraftBtn = document.getElementById('resetDraftBtn');
const savePaymentBtn = document.getElementById('savePaymentBtn');
const jarPrincipalBtn = document.getElementById('jarPrincipalBtn');
const jarInterestBtn = document.getElementById('jarInterestBtn');
const jars = document.querySelectorAll('.jar');

let selectedMemberId = state.members.length ? state.members[0].id : null;
let activeJar = 'principal';
let draft = { principal: 0, interest: 0 };
const speechSupported =
  typeof window !== 'undefined' &&
  'speechSynthesis' in window &&
  'SpeechSynthesisUtterance' in window;
let ttsEnabled = loadTtsPreference();
let preferredVoice = null;
let lastSpeech = { text: '', timestamp: 0 };

const coinImageByValue = {
  '0.01': '/static/static/images/coins/1c_c.jpg',
  '0.05': '/static/static/images/coins/5c_c.jpg',
  '0.10': '/static/static/images/coins/10c_c.jpg',
  '0.25': '/static/static/images/coins/25c_c.jpg',
  '1.00': '/static/static/images/coins/1d_c.jpg',
};

const billImageByValue = {
  '5.00': '/static/static/images/bills/1_b2.jpg',
  '10.00': '/static/static/images/bills/1_b3.jpg',
};

function money(value) {
  return `$${Number(value).toFixed(2)}`;
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
    ttsToggleBtn.textContent = 'Voz: NO';
    ttsToggleBtn.classList.add('unsupported');
    ttsToggleBtn.disabled = true;
    return;
  }

  const hasSpanishVoice = Boolean(preferredVoice || pickSpanishVoice());
  if (!hasSpanishVoice) {
    ttsToggleBtn.textContent = 'Voz: SIN ES';
    ttsToggleBtn.classList.add('unsupported');
    ttsToggleBtn.disabled = true;
    return;
  }

  ttsToggleBtn.disabled = false;
  if (ttsEnabled) {
    ttsToggleBtn.textContent = 'Voz: ON';
  } else {
    ttsToggleBtn.textContent = 'Voz: OFF';
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
  const started = new Date(state.meeting.started_at).toLocaleString();
  meetingBadge.textContent = `Reunion ${state.meeting.id} | ${started}`;
}

function memberCardTemplate(member) {
  const selectedClass = member.id === selectedMemberId ? 'selected' : '';
  return `
    <article class="member-card ${member.attendance} ${selectedClass}" data-member-id="${member.id}">
      <p class="member-photo">${member.photo_emoji}</p>
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
}

function renderSelectedMemberPanel() {
  const member = getSelectedMember();
  if (!member) {
    selectedMemberInfo.classList.add('empty');
    selectedMemberInfo.textContent = 'Seleccione una socia';
    principalAmount.textContent = '$0.00';
    interestAmount.textContent = '$0.00';
    principalRemaining.textContent = '';
    interestRemaining.textContent = '';
    return;
  }

  selectedMemberInfo.classList.remove('empty');
  selectedMemberInfo.innerHTML = `
    <span class="selected-member-photo">${member.photo_emoji}</span>
    <span class="selected-member-name">${member.name}</span>
  `;

  principalAmount.textContent = money(draft.principal);
  interestAmount.textContent = money(draft.interest);

  const principalLeft = Math.max(
    0,
    member.loan.principal_remaining + member.loan.current_payment.principal - draft.principal,
  );
  const interestLeft = Math.max(
    0,
    member.loan.interest_remaining + member.loan.current_payment.interest - draft.interest,
  );

  principalRemaining.textContent = `Falta: ${money(principalLeft)}`;
  interestRemaining.textContent = `Falta: ${money(interestLeft)}`;
}

function tokenTemplate(value) {
  const normalized = Number(value).toFixed(2);
  const coinSrc = coinImageByValue[normalized];
  const billSrc = billImageByValue[normalized];
  const numeric = Number(value);

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
  tokenRack.innerHTML = state.denominations.map(tokenTemplate).join('');
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
  renderJarSelection();
}

function canAddToDraft(target, value) {
  const member = getSelectedMember();
  if (!member) {
    return false;
  }

  const available =
    target === 'principal'
      ? member.loan.principal_remaining + member.loan.current_payment.principal
      : member.loan.interest_remaining + member.loan.current_payment.interest;

  const next = target === 'principal' ? draft.principal + value : draft.interest + value;
  return next <= available + 0.001;
}

function getRemainingForTarget(target) {
  const member = getSelectedMember();
  if (!member) {
    return null;
  }

  if (target === 'principal') {
    return Math.max(
      0,
      member.loan.principal_remaining + member.loan.current_payment.principal - draft.principal,
    );
  }

  return Math.max(
    0,
    member.loan.interest_remaining + member.loan.current_payment.interest - draft.interest,
  );
}

function speakRemainingForTarget(target) {
  const remaining = getRemainingForTarget(target);
  if (remaining === null) {
    speak('Seleccione una socia primero', 'critical');
    return;
  }

  const targetLabel = target === 'principal' ? 'principal' : 'interes';
  speak(`En ${targetLabel}, falta ${amountToSpeech(remaining)}`);
}

function addToDraft(target, value) {
  if (!selectedMemberId) {
    setStatus('Seleccione una socia primero', 'error');
    speak('Seleccione una socia primero', 'critical');
    return;
  }
  if (!canAddToDraft(target, value)) {
    setStatus('Monto supera el pendiente', 'error');
    speak('Monto supera el pendiente', 'critical');
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
    if (!state.members.find((m) => m.id === selectedMemberId) && state.members.length) {
      selectedMemberId = state.members[0].id;
    }
    hydrateDraftFromState();
    renderAll();
    setStatus('Asistencia actualizada', 'ok');
    const member = getMemberById(memberId);
    const statusLabel = status === 'present' ? 'presente' : 'ausente';
    const memberName = member ? member.name : 'socia';
    speak(`${memberName}, ${statusLabel}`);
  } catch (error) {
    setStatus(error.message, 'error');
    speak(error.message, 'critical');
  }
}

async function savePayment() {
  if (!selectedMemberId) {
    setStatus('Seleccione una socia', 'error');
    speak('Seleccione una socia', 'critical');
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
    hydrateDraftFromState();
    renderAll();
    setStatus('Pago guardado', 'ok');
    speak(
      `Pago guardado. Principal ${amountToSpeech(paidPrincipal)}. Interes ${amountToSpeech(paidInterest)}.`,
    );
  } catch (error) {
    setStatus(error.message, 'error');
    speak(error.message, 'critical');
  }
}

async function startNewMeeting() {
  try {
    const data = await postJson('/api/meeting/new', {});
    state = data.state;
    selectedMemberId = state.members.length ? state.members[0].id : null;
    hydrateDraftFromState();
    renderAll();
    setStatus('Nueva reunion iniciada', 'ok');
    speak('Nueva reunion iniciada');
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
  setStatus('Socia seleccionada', 'ok');
  const member = getSelectedMember();
  if (member) {
    speak(`Socia seleccionada: ${member.name}`);
  }
});

tokenRack.addEventListener('click', (event) => {
  const token = event.target.closest('.money-token');
  if (!token) {
    return;
  }
  addToDraft(activeJar, Number(token.dataset.value));
});

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

initTts();
hydrateDraftFromState();
renderAll();
setStatus('Lista para registrar', 'ok');
