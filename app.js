const screens = document.querySelectorAll(".screen");
const bottomNav = document.getElementById("bottom-nav");
const navItems = document.querySelectorAll(".nav-item");
const phoneStep = document.getElementById("phone-step");
const otpStep = document.getElementById("otp-step");
const accessError = document.getElementById("access-error");
const authStatus = document.getElementById("auth-status");
const otpHint = document.getElementById("otp-hint");
const addressSearch = document.getElementById("address-search");
const sessionSummary = document.getElementById("session-summary");
const searchSuggestions = document.getElementById("search-suggestions");
const recentList = document.getElementById("recent-list");
const recentEmpty = document.getElementById("recent-empty");
const historyList = document.getElementById("history-list");
const historyEmpty = document.getElementById("history-empty");
const resultCard = document.getElementById("result-card");
const resultNotFound = document.getElementById("result-not-found");
const resultLineNumber = document.getElementById("result-line-number");
const resultArea = document.getElementById("result-area");
const resultCity = document.getElementById("result-city");
const resultNotes = document.getElementById("result-notes");
const workersList = document.getElementById("workers-list");
const linesList = document.getElementById("lines-list");
const assignLineSelect = document.getElementById("assign-line-select");
const adminFilter = document.getElementById("admin-filter");
const managerNavItem = document.querySelector(".nav-item.manager-only");

const STORAGE_KEYS = {
  users: "deliveryLineUsers",
  organizations: "deliveryLineOrganizations",
  otpRequests: "deliveryLineOtpRequests",
  session: "deliveryLineSession",
  lines: "deliveryLineLines",
  assignments: "deliveryLineAssignments",
  history: "deliveryLineHistory",
};

const ROLE_LABELS = {
  worker: "עובד",
  manager: "מנהל",
  admin: "אדמין",
};

const MANAGER_ROLES = new Set(["admin", "manager"]);
const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const PROTECTED_SCREENS = new Set(["search-screen", "result-screen", "history-screen", "admin-screen"]);
const IS_DEMO = location.hostname === "localhost" || location.hostname === "127.0.0.1";

let currentSession = readStore(STORAGE_KEYS.session, null);
let pendingPhone = "";
let suggestionHideTimer = null;

function readStore(key, fallback) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : fallback;
}

function writeStore(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function normalizePhone(phone) {
  return phone.replace(/[^\d+]/g, "");
}

function formatPhone(phone) {
  const digits = normalizePhone(phone);
  if (digits.length === 10 && digits.startsWith("0")) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  return phone;
}

function normalizeQuery(query) {
  return query
    .trim()
    .toLowerCase()
    .replace(/[,\u05BE\u2013\u2014]/g, " ")
    .replace(/\s+/g, " ");
}

function createSessionToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canManage(role) {
  return MANAGER_ROLES.has(role);
}

function setButtonLoading(button, loading, loadingText) {
  if (!button) return;
  if (loading) {
    button.dataset.originalText = button.textContent;
    button.textContent = loadingText;
    button.disabled = true;
    button.classList.add("is-loading");
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
    button.classList.remove("is-loading");
  }
}

const authRepository = {
  getUsers() {
    return readStore(STORAGE_KEYS.users, []);
  },
  saveUsers(users) {
    writeStore(STORAGE_KEYS.users, users);
  },
  getOrganizations() {
    return readStore(STORAGE_KEYS.organizations, []);
  },
  saveOrganizations(organizations) {
    writeStore(STORAGE_KEYS.organizations, organizations);
  },
  findUserByPhone(phone) {
    return this.getUsers().find((user) => user.phone === phone);
  },
  findUserById(id) {
    return this.getUsers().find((user) => user.id === id);
  },
  hasUsers() {
    return this.getUsers().length > 0;
  },
  getOrgUsers(organizationId) {
    return this.getUsers().filter((user) => user.organization_id === organizationId);
  },
  saveSession(session) {
    writeStore(STORAGE_KEYS.session, session);
  },
  clearSession() {
    localStorage.removeItem(STORAGE_KEYS.session);
  },
  getOrganizationName(organizationId) {
    const org = this.getOrganizations().find((item) => item.id === organizationId);
    return org?.name || "ארגון";
  },
};

const dataRepository = {
  getLines(organizationId) {
    return readStore(STORAGE_KEYS.lines, []).filter((line) => line.organization_id === organizationId);
  },
  saveLines(lines) {
    writeStore(STORAGE_KEYS.lines, lines);
  },
  getAllLines() {
    return readStore(STORAGE_KEYS.lines, []);
  },
  getAssignments(organizationId) {
    return readStore(STORAGE_KEYS.assignments, []).filter((item) => item.organization_id === organizationId);
  },
  saveAssignments(assignments) {
    writeStore(STORAGE_KEYS.assignments, assignments);
  },
  getAllAssignments() {
    return readStore(STORAGE_KEYS.assignments, []);
  },
  getHistory(organizationId, userId) {
    return readStore(STORAGE_KEYS.history, [])
      .filter((item) => item.organization_id === organizationId && item.user_id === userId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  },
  addHistoryEntry(entry) {
    const history = readStore(STORAGE_KEYS.history, []);
    history.unshift(entry);
    writeStore(STORAGE_KEYS.history, history.slice(0, 200));
  },
};

const seedData = {
  forOrganization(organizationId) {
    const lines = [
      {
        id: createId("line"),
        number: 27,
        name: "מרכז נתניה",
        areas: ["נתניה", "הרצל", "סמילנסקי", "מרכז העיר"],
        notes: "למיין לעגלה כחולה, יציאה 14:30",
        color: "#ffb703",
        organization_id: organizationId,
      },
      {
        id: createId("line"),
        number: 8,
        name: "שרון דרומי",
        areas: ["געש", "שפיים", "רשפון", "יקום"],
        notes: "",
        color: "#005fcc",
        organization_id: organizationId,
      },
      {
        id: createId("line"),
        number: 31,
        name: "חדרה צפון",
        areas: ["חדרה", "האורן"],
        notes: "",
        color: "#047857",
        organization_id: organizationId,
      },
    ];

    const lineByNumber = Object.fromEntries(lines.map((line) => [line.number, line.id]));
    const assignments = [
      {
        id: createId("asgn"),
        line_id: lineByNumber[27],
        query: "הרצל 12 נתניה",
        city: "נתניה",
        street: "הרצל",
        organization_id: organizationId,
      },
      {
        id: createId("asgn"),
        line_id: lineByNumber[27],
        query: "מרכז נתניה",
        city: "נתניה",
        area: "מרכז נתניה",
        organization_id: organizationId,
      },
      {
        id: createId("asgn"),
        line_id: lineByNumber[8],
        query: "קיבוץ געש",
        city: "געש",
        organization_id: organizationId,
      },
      {
        id: createId("asgn"),
        line_id: lineByNumber[31],
        query: "רחוב האורן חדרה",
        city: "חדרה",
        street: "האורן",
        organization_id: organizationId,
      },
    ];

    const allLines = dataRepository.getAllLines().filter((line) => line.organization_id !== organizationId);
    const allAssignments = dataRepository
      .getAllAssignments()
      .filter((item) => item.organization_id !== organizationId);

    dataRepository.saveLines([...allLines, ...lines]);
    dataRepository.saveAssignments([...allAssignments, ...assignments]);
  },
};

function seedOrgDataIfNeeded(organizationId) {
  if (dataRepository.getLines(organizationId).length === 0) {
    seedData.forOrganization(organizationId);
  }
}

const searchService = {
  scoreText(text, query) {
    const normalized = normalizeQuery(text);
    if (!normalized || !query) return 0;
    if (normalized === query) return 100;
    if (normalized.includes(query)) return 80;
    const tokens = query.split(" ").filter(Boolean);
    const matched = tokens.filter((token) => normalized.includes(token)).length;
    return matched ? (matched / tokens.length) * 60 : 0;
  },
  buildSearchableText(assignment, line) {
    return [assignment.query, assignment.city, assignment.street, assignment.area, line?.name, ...(line?.areas || [])]
      .filter(Boolean)
      .join(" ");
  },
  findMatch(organizationId, rawQuery) {
    const query = normalizeQuery(rawQuery);
    if (!query) return null;

    const lines = dataRepository.getLines(organizationId);
    const lineMap = Object.fromEntries(lines.map((line) => [line.id, line]));
    const assignments = dataRepository.getAssignments(organizationId);
    let best = null;

    assignments.forEach((assignment) => {
      const line = lineMap[assignment.line_id];
      const score = this.scoreText(this.buildSearchableText(assignment, line), query);
      if (score > 0 && (!best || score > best.score)) {
        best = { score, assignment, line };
      }
    });

    lines.forEach((line) => {
      const score = Math.max(
        this.scoreText(line.name, query),
        ...line.areas.map((area) => this.scoreText(area, query))
      );
      if (score > 0 && (!best || score > best.score)) {
        best = {
          score,
          assignment: { query: rawQuery.trim(), city: line.areas[0] || line.name },
          line,
        };
      }
    });

    return best;
  },
  getSuggestions(organizationId, rawQuery, limit = 6) {
    const query = normalizeQuery(rawQuery);
    if (query.length < 2) return [];

    const lines = dataRepository.getLines(organizationId);
    const lineMap = Object.fromEntries(lines.map((line) => [line.id, line]));
    const seen = new Set();
    const suggestions = [];

    dataRepository.getAssignments(organizationId).forEach((assignment) => {
      const line = lineMap[assignment.line_id];
      const score = this.scoreText(this.buildSearchableText(assignment, line), query);
      if (score > 0 && !seen.has(assignment.query)) {
        seen.add(assignment.query);
        suggestions.push({ label: assignment.query, query: assignment.query, score });
      }
    });

    lines.forEach((line) => {
      line.areas.forEach((area) => {
        const label = `${area}, ${line.areas[0] || line.name}`;
        const score = this.scoreText(area, query);
        if (score > 0 && !seen.has(label)) {
          seen.add(label);
          suggestions.push({ label, query: area, score });
        }
      });
    });

    return suggestions.sort((a, b) => b.score - a.score).slice(0, limit);
  },
};

const otpService = {
  getRequests() {
    return readStore(STORAGE_KEYS.otpRequests, {});
  },
  saveRequests(requests) {
    writeStore(STORAGE_KEYS.otpRequests, requests);
  },
  generateCode() {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return String((bytes[0] % 900000) + 100000);
  },
  sendSms(phone, code) {
    console.info(`OTP for ${phone}: ${code}`);
  },
  start(phone) {
    const code = this.generateCode();
    const requests = this.getRequests();

    requests[phone] = {
      code,
      expires_at: Date.now() + OTP_TTL_MS,
      attempts: 0,
      verified: false,
    };

    this.saveRequests(requests);
    this.sendSms(phone, code);
    return { expires_in_seconds: OTP_TTL_MS / 1000, demo_code: code };
  },
  verify(phone, code) {
    const requests = this.getRequests();
    const request = requests[phone];

    if (!request) {
      return { ok: false, reason: "לא נמצא קוד אימות פעיל" };
    }

    if (Date.now() > request.expires_at) {
      delete requests[phone];
      this.saveRequests(requests);
      return { ok: false, reason: "קוד האימות פג תוקף. שלח קוד חדש" };
    }

    if (request.attempts >= MAX_OTP_ATTEMPTS) {
      return { ok: false, reason: "בוצעו יותר מדי ניסיונות. שלח קוד חדש" };
    }

    request.attempts += 1;

    if (request.code !== code) {
      this.saveRequests(requests);
      return { ok: false, reason: "קוד אימות שגוי" };
    }

    request.verified = true;
    this.saveRequests(requests);
    return { ok: true };
  },
};

const organizationBootstrap = {
  createFirstOrganization(phone) {
    const organization = {
      id: createId("org"),
      name: "ארגון ראשי",
      created_by: null,
    };

    const user = {
      id: createId("user"),
      phone,
      role: "admin",
      organization_id: organization.id,
    };

    organization.created_by = user.id;
    authRepository.saveOrganizations([organization]);
    authRepository.saveUsers([user]);
    seedData.forOrganization(organization.id);
    return { user, organization };
  },
};

const authService = {
  requestOtp(phoneInput) {
    const phone = normalizePhone(phoneInput);

    if (phone.length < 9) {
      return { ok: false, reason: "הזן מספר טלפון תקין" };
    }

    return { ok: true, phone, otp: otpService.start(phone) };
  },
  verifyOtp(phone, code) {
    const otpResult = otpService.verify(phone, code);

    if (!otpResult.ok) {
      return otpResult;
    }

    let user = authRepository.findUserByPhone(phone);
    let organization = null;
    let bootstrapped = false;

    if (!authRepository.hasUsers()) {
      const result = organizationBootstrap.createFirstOrganization(phone);
      user = result.user;
      organization = result.organization;
      bootstrapped = true;
    }

    if (!user) {
      return { ok: false, reason: "אין לך גישה למערכת, פנה למנהל" };
    }

    const session = {
      token: createSessionToken(),
      user_id: user.id,
      phone: user.phone,
      role: user.role,
      organization_id: user.organization_id,
      created_at: new Date().toISOString(),
    };

    authRepository.saveSession(session);
    return { ok: true, session, user, organization, bootstrapped };
  },
};

function applyRoleUi(role) {
  const isManager = canManage(role);
  managerNavItem.classList.toggle("hidden", !isManager);
  bottomNav.classList.toggle("nav-two-items", !isManager);
}

function showScreen(screenId) {
  if (PROTECTED_SCREENS.has(screenId) && !currentSession) {
    showScreen("login-screen");
    return;
  }

  if (screenId === "admin-screen" && !canManage(currentSession?.role)) {
    showScreen("search-screen");
    return;
  }

  screens.forEach((screen) => {
    screen.classList.toggle("active", screen.id === screenId);
  });

  const isLoggedInArea = screenId !== "login-screen";
  bottomNav.classList.toggle("hidden", !isLoggedInArea);

  navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.target === screenId);
  });

  if (screenId === "history-screen") {
    renderHistory();
  }

  if (screenId === "admin-screen") {
    renderAdmin();
  }
}

function showError(message) {
  accessError.textContent = message;
  accessError.classList.remove("hidden");
  authStatus.classList.add("hidden");
}

function clearAuthMessages() {
  accessError.classList.add("hidden");
  authStatus.classList.add("hidden");
}

function updateSessionSummary(session) {
  if (!session) {
    sessionSummary.textContent = "";
    return;
  }

  const orgName = authRepository.getOrganizationName(session.organization_id);
  const roleLabel = ROLE_LABELS[session.role] || session.role;
  sessionSummary.textContent = `מחובר: ${formatPhone(session.phone)} · ${roleLabel} · ${orgName}`;
}

function renderRecentSearches() {
  if (!currentSession) return;

  const history = dataRepository.getHistory(currentSession.organization_id, currentSession.user_id);
  const seen = new Set();
  const recent = [];

  history.forEach((item) => {
    if (!seen.has(item.query)) {
      seen.add(item.query);
      recent.push(item);
    }
  });

  recentList.innerHTML = "";
  const items = recent.slice(0, 5);

  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "recent-item";
    button.dataset.query = item.query;
    button.textContent = item.query;
    button.addEventListener("click", () => runSearch(item.query));
    recentList.appendChild(button);
  });

  recentEmpty.classList.toggle("hidden", items.length > 0);
}

function renderHistory() {
  if (!currentSession) return;

  const history = dataRepository.getHistory(currentSession.organization_id, currentSession.user_id);
  historyList.innerHTML = "";

  history.forEach((item) => {
    const article = document.createElement("article");
    article.className = "card history-item";
    article.innerHTML = `<strong>${item.query}</strong><span>קו ${item.line_number} · ${item.line_name}</span>`;
    article.addEventListener("click", () => runSearch(item.query));
    historyList.appendChild(article);
  });

  historyEmpty.classList.toggle("hidden", history.length > 0);
}

function renderResult(match, query) {
  if (!match?.line) {
    resultCard.classList.add("hidden");
    resultNotFound.classList.remove("hidden");
    return;
  }

  const { line, assignment } = match;
  resultCard.classList.remove("hidden");
  resultNotFound.classList.add("hidden");
  resultCard.style.borderTopColor = line.color || "var(--warning)";
  resultLineNumber.textContent = String(line.number);
  resultArea.textContent = line.name;
  resultCity.textContent = assignment.city || line.areas[0] || "—";
  resultNotes.textContent = line.notes || "אין הערות";

  dataRepository.addHistoryEntry({
    id: createId("hist"),
    user_id: currentSession.user_id,
    organization_id: currentSession.organization_id,
    query: query.trim(),
    line_id: line.id,
    line_number: line.number,
    line_name: line.name,
    timestamp: new Date().toISOString(),
  });

  renderRecentSearches();
}

function runSearch(rawQuery) {
  const query = rawQuery.trim();
  if (!query || !currentSession) return;

  hideSuggestions();
  addressSearch.value = query;

  const searchBtn = document.getElementById("search-btn");
  setButtonLoading(searchBtn, true, "מחפש...");
  window.setTimeout(() => {
    const match = searchService.findMatch(currentSession.organization_id, query);
    renderResult(match, query);
    setButtonLoading(searchBtn, false);
    showScreen("result-screen");
  }, 180);
}

function showSuggestions(items) {
  searchSuggestions.innerHTML = "";

  if (!items.length) {
    searchSuggestions.classList.add("hidden");
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.role = "option";
    button.textContent = item.label;
    button.addEventListener("click", () => runSearch(item.query));
    li.appendChild(button);
    searchSuggestions.appendChild(li);
  });

  searchSuggestions.classList.remove("hidden");
}

function hideSuggestions() {
  searchSuggestions.classList.add("hidden");
  searchSuggestions.innerHTML = "";
}

function renderWorkers(filter = "") {
  if (!currentSession) return;

  const normalizedFilter = normalizeQuery(filter);
  workersList.innerHTML = "";
  const users = authRepository.getOrgUsers(currentSession.organization_id);

  users.forEach((user) => {
    const phoneLabel = formatPhone(user.phone);
    const roleLabel = ROLE_LABELS[user.role] || user.role;
    const haystack = normalizeQuery(`${phoneLabel} ${roleLabel}`);

    if (normalizedFilter && !haystack.includes(normalizedFilter)) {
      return;
    }

    const row = document.createElement("div");
    row.className = "list-row";
    row.dataset.filterText = haystack;

    const phoneSpan = document.createElement("span");
    phoneSpan.textContent = phoneLabel;

    const roleSelect = document.createElement("select");
    roleSelect.setAttribute("aria-label", `הרשאת ${phoneLabel}`);
    ["worker", "manager", "admin"].forEach((role) => {
      const option = document.createElement("option");
      option.value = role;
      option.textContent = ROLE_LABELS[role];
      option.selected = user.role === role;
      roleSelect.appendChild(option);
    });
    roleSelect.disabled = user.id === currentSession.user_id;
    roleSelect.addEventListener("change", () => {
      const usersAll = authRepository.getUsers();
      const target = usersAll.find((item) => item.id === user.id);
      if (!target) return;
      target.role = roleSelect.value;
      authRepository.saveUsers(usersAll);
      if (user.id === currentSession.user_id) {
        currentSession.role = target.role;
        authRepository.saveSession(currentSession);
        applyRoleUi(currentSession.role);
        updateSessionSummary(currentSession);
      }
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "danger-btn";
    removeBtn.textContent = "הסר";
    removeBtn.disabled = user.id === currentSession.user_id;
    removeBtn.addEventListener("click", () => {
      const orgUsers = authRepository.getOrgUsers(currentSession.organization_id);
      const admins = orgUsers.filter((item) => item.role === "admin");
      if (user.role === "admin" && admins.length <= 1) {
        window.alert("לא ניתן להסיר את האדמין האחרון");
        return;
      }
      if (!window.confirm(`להסיר את ${phoneLabel}?`)) return;
      authRepository.saveUsers(authRepository.getUsers().filter((item) => item.id !== user.id));
      renderWorkers(adminFilter.value);
    });

    row.append(phoneSpan, roleSelect, removeBtn);
    workersList.appendChild(row);
  });
}

function renderLines(filter = "") {
  if (!currentSession) return;

  const normalizedFilter = normalizeQuery(filter);
  linesList.innerHTML = "";
  assignLineSelect.innerHTML = "";

  dataRepository.getLines(currentSession.organization_id).forEach((line) => {
    const option = document.createElement("option");
    option.value = line.id;
    option.textContent = `קו ${line.number} · ${line.name}`;
    assignLineSelect.appendChild(option);

    const haystack = normalizeQuery(`קו ${line.number} ${line.name} ${line.areas.join(" ")}`);
    if (normalizedFilter && !haystack.includes(normalizedFilter)) {
      return;
    }

    const row = document.createElement("div");
    row.className = "line-row";
    row.dataset.filterText = haystack;

    const title = document.createElement("b");
    title.textContent = `קו ${line.number}`;

    const areas = document.createElement("span");
    areas.textContent = line.areas.join(" · ");

    const actions = document.createElement("div");
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "עריכה";
    editBtn.addEventListener("click", () => editLine(line));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "danger-btn";
    deleteBtn.textContent = "מחיקה";
    deleteBtn.addEventListener("click", () => deleteLine(line));

    actions.append(editBtn, deleteBtn);
    row.append(title, areas, actions);
    linesList.appendChild(row);
  });
}

function renderAdmin() {
  renderWorkers(adminFilter.value);
  renderLines(adminFilter.value);
}

function editLine(line) {
  const name = window.prompt("שם אזור חלוקה:", line.name);
  if (name === null) return;

  const areasInput = window.prompt("רחובות/אזורים (מופרדים בפסיק):", line.areas.join(", "));
  if (areasInput === null) return;

  const notes = window.prompt("הערות:", line.notes || "");
  if (notes === null) return;

  const allLines = dataRepository.getAllLines();
  const target = allLines.find((item) => item.id === line.id);
  if (!target) return;

  target.name = name.trim() || target.name;
  target.areas = areasInput
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  target.notes = notes.trim();
  dataRepository.saveLines(allLines);
  renderAdmin();
}

function deleteLine(line) {
  if (!window.confirm(`למחוק את קו ${line.number}?`)) return;

  dataRepository.saveLines(dataRepository.getAllLines().filter((item) => item.id !== line.id));
  dataRepository.saveAssignments(dataRepository.getAllAssignments().filter((item) => item.line_id !== line.id));
  renderAdmin();
}

function addLine() {
  const numberInput = window.prompt("מספר קו:", "");
  if (numberInput === null) return;

  const number = Number(numberInput);
  if (!Number.isFinite(number) || number <= 0) {
    window.alert("הזן מספר קו תקין");
    return;
  }

  const name = window.prompt("שם אזור:", "");
  if (name === null || !name.trim()) return;

  const areasInput = window.prompt("רחובות/אזורים (מופרדים בפסיק):", "");
  if (areasInput === null) return;

  const line = {
    id: createId("line"),
    number,
    name: name.trim(),
    areas: areasInput
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    notes: "",
    color: "#005fcc",
    organization_id: currentSession.organization_id,
  };

  dataRepository.saveLines([...dataRepository.getAllLines(), line]);
  renderAdmin();
}

function addWorker() {
  const phone = normalizePhone(document.getElementById("new-worker").value);
  if (phone.length < 9) {
    window.alert("הזן מספר טלפון תקין");
    return;
  }

  if (authRepository.findUserByPhone(phone)) {
    window.alert("עובד עם מספר זה כבר קיים");
    return;
  }

  authRepository.saveUsers([
    ...authRepository.getUsers(),
    {
      id: createId("user"),
      phone,
      role: "worker",
      organization_id: currentSession.organization_id,
    },
  ]);

  document.getElementById("new-worker").value = "";
  renderWorkers(adminFilter.value);
}

function assignAddress() {
  const query = document.getElementById("assign-line").value.trim();
  const lineId = assignLineSelect.value;

  if (!query || !lineId) {
    window.alert("בחר קו והזן כתובת לשיוך");
    return;
  }

  dataRepository.saveAssignments([
    ...dataRepository.getAllAssignments(),
    {
      id: createId("asgn"),
      line_id: lineId,
      query,
      city: query.split(" ").pop() || query,
      organization_id: currentSession.organization_id,
    },
  ]);

  document.getElementById("assign-line").value = "";
  renderAdmin();
  window.alert("הכתובת שויכה בהצלחה");
}

function completeLogin(session, options = {}) {
  currentSession = session;
  seedOrgDataIfNeeded(session.organization_id);
  applyRoleUi(session.role);
  updateSessionSummary(session);
  renderRecentSearches();
  showScreen("search-screen");
  if (!options.skipFocus) {
    addressSearch.focus();
  }
}

function logout() {
  authRepository.clearSession();
  currentSession = null;
  pendingPhone = "";
  updateSessionSummary(null);
  phoneStep.classList.remove("hidden");
  otpStep.classList.add("hidden");
  clearAuthMessages();
  document.getElementById("phone").value = "";
  document.getElementById("otp").value = "";
  showScreen("login-screen");
}

function bindEnterKey(input, action) {
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      action();
    }
  });
}

function initApp() {
  if (currentSession) {
    const user = authRepository.findUserById(currentSession.user_id);

    if (!user || user.organization_id !== currentSession.organization_id) {
      authRepository.clearSession();
      currentSession = null;
      showScreen("login-screen");
      return;
    }

    currentSession.role = user.role;
    currentSession.phone = user.phone;
    authRepository.saveSession(currentSession);
    completeLogin(currentSession, { skipFocus: true });
    return;
  }

  showScreen("login-screen");
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

document.getElementById("send-code").addEventListener("click", () => {
  clearAuthMessages();
  const button = document.getElementById("send-code");
  setButtonLoading(button, true, "שולח...");

  window.setTimeout(() => {
    const result = authService.requestOtp(document.getElementById("phone").value);
    setButtonLoading(button, false);

    if (!result.ok) {
      showError(result.reason);
      return;
    }

    pendingPhone = result.phone;
    phoneStep.classList.add("hidden");
    otpStep.classList.remove("hidden");
    otpHint.textContent = IS_DEMO
      ? `קוד נשלח ב-SMS. בדמו: ${result.otp.demo_code}. תוקף הקוד 5 דקות.`
      : "קוד נשלח ב-SMS. תוקף הקוד 5 דקות.";
    document.getElementById("otp").value = "";
    document.getElementById("otp").focus();
  }, 250);
});

document.getElementById("verify-code").addEventListener("click", () => {
  clearAuthMessages();
  const button = document.getElementById("verify-code");
  setButtonLoading(button, true, "מאמת...");

  window.setTimeout(() => {
    const otp = document.getElementById("otp").value.trim();
    const result = authService.verifyOtp(pendingPhone, otp);
    setButtonLoading(button, false);

    if (!result.ok) {
      showError(result.reason);
      return;
    }

    if (result.bootstrapped) {
      authStatus.textContent = "יוצר ארגון ומשייך אדמין...";
      authStatus.classList.remove("hidden");
      window.setTimeout(() => completeLogin(result.session), 650);
      return;
    }

    completeLogin(result.session);
  }, 250);
});

document.getElementById("back-to-phone").addEventListener("click", () => {
  otpStep.classList.add("hidden");
  phoneStep.classList.remove("hidden");
  clearAuthMessages();
  document.getElementById("phone").focus();
});

document.querySelectorAll(".logout-btn").forEach((button) => {
  button.addEventListener("click", logout);
});

document.getElementById("search-btn").addEventListener("click", () => {
  runSearch(addressSearch.value);
});

document.getElementById("new-search").addEventListener("click", () => {
  showScreen("search-screen");
  addressSearch.focus();
  addressSearch.select();
});

document.getElementById("back-to-search").addEventListener("click", () => {
  showScreen("search-screen");
  addressSearch.focus();
});

addressSearch.addEventListener("input", () => {
  if (!currentSession) return;
  window.clearTimeout(suggestionHideTimer);
  const items = searchService.getSuggestions(currentSession.organization_id, addressSearch.value);
  showSuggestions(items);
});

addressSearch.addEventListener("blur", () => {
  suggestionHideTimer = window.setTimeout(hideSuggestions, 150);
});

addressSearch.addEventListener("focus", () => {
  if (!currentSession || !addressSearch.value.trim()) return;
  const items = searchService.getSuggestions(currentSession.organization_id, addressSearch.value);
  showSuggestions(items);
});

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    showScreen(item.dataset.target);
  });
});

document.getElementById("add-worker-btn").addEventListener("click", addWorker);
document.getElementById("add-line-btn").addEventListener("click", addLine);
document.getElementById("assign-btn").addEventListener("click", assignAddress);
adminFilter.addEventListener("input", () => renderAdmin());

bindEnterKey(document.getElementById("phone"), () => document.getElementById("send-code").click());
bindEnterKey(document.getElementById("otp"), () => document.getElementById("verify-code").click());
bindEnterKey(addressSearch, () => document.getElementById("search-btn").click());
bindEnterKey(document.getElementById("new-worker"), addWorker);
bindEnterKey(document.getElementById("assign-line"), assignAddress);

initApp();
registerServiceWorker();
