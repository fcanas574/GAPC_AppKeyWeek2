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
const resetDraftBtn = document.getElementById('resetDraftBtn');
const savePaymentBtn = document.getElementById('savePaymentBtn');
const jarPrincipalBtn = document.getElementById('jarPrincipalBtn');
const jarInterestBtn = document.getElementById('jarInterestBtn');
const jars = document.querySelectorAll('.jar');

let selectedMemberId = state.members.length ? state.members[0].id : null;
let activeJar = 'principal';
let draft = { principal: 0, interest: 0 };

function money(value) {
  return `$${Number(value).toFixed(2)}`;
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
  selectedMemberInfo.textContent = `${member.photo_emoji} ${member.name}`;

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

function addToDraft(target, value) {
  if (!selectedMemberId) {
    setStatus('Seleccione una socia primero', 'error');
    return;
  }
  if (!canAddToDraft(target, value)) {
    setStatus('Monto supera el pendiente', 'error');
    return;
  }
  if (target === 'principal') {
    draft.principal = +(draft.principal + value).toFixed(2);
  } else {
    draft.interest = +(draft.interest + value).toFixed(2);
  }
  setStatus('Monto agregado', 'ok');
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
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function savePayment() {
  if (!selectedMemberId) {
    setStatus('Seleccione una socia', 'error');
    return;
  }

  if (draft.principal === 0 && draft.interest === 0) {
    setStatus('Pago vacio', 'error');
    return;
  }

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
  } catch (error) {
    setStatus(error.message, 'error');
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
  } catch (error) {
    setStatus(error.message, 'error');
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
});

jarInterestBtn.addEventListener('click', () => {
  activeJar = 'interest';
  renderJarSelection();
});

resetDraftBtn.addEventListener('click', () => {
  draft = { principal: 0, interest: 0 };
  renderSelectedMemberPanel();
  setStatus('Borrador limpio', 'ok');
});

savePaymentBtn.addEventListener('click', savePayment);
newMeetingBtn.addEventListener('click', startNewMeeting);

hydrateDraftFromState();
renderAll();
setStatus('Lista para registrar', 'ok');
