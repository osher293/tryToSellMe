const screens = document.querySelectorAll(".screen");
const bottomNav = document.getElementById("bottom-nav");
const navItems = document.querySelectorAll(".nav-item");
const phoneStep = document.getElementById("phone-step");
const activateStep = document.getElementById("activate-step");
const setPasswordStep = document.getElementById("set-password-step");
const passwordStep = document.getElementById("password-step");
const accessError = document.getElementById("access-error");
const authStatus = document.getElementById("auth-status");
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
  session: "deliveryLineSession",
  lines: "deliveryLineLines",
  assignments: "deliveryLineAssignments",
  history: "deliveryLineHistory",
  cityStreetOverrides: "deliveryLineCityStreetOverrides",
};

const ROLE_LABELS = {
  worker: "עובד",
  manager: "מנהל",
  admin: "אדמין",
};

const MANAGER_ROLES = new Set(["admin", "manager"]);
const PROTECTED_SCREENS = new Set(["search-screen", "result-screen", "history-screen", "admin-screen"]);

// חשבון אדמין-התאוששות: מבטיח כניסה תמיד למספר הזה, גם אם ה-localStorage נמצא במצב לא תקין.
// הסיסמה לא נשמרת כטקסט גלוי בקוד - רק טביעת SHA-256 שלה, ונבדקת בהשוואת hash.
const RECOVERY_ADMIN_PHONE = normalizePhone("0506411890");
const RECOVERY_ADMIN_PASSWORD_HASH =
  "617116600cf1e7d7f236687d603986df4796345088818ea7728df26abb4ac337";

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

let currentSession = readStore(STORAGE_KEYS.session, null);
let pendingPhone = "";
let suggestionHideTimer = null;
let currentLineStreetsModalLineId = null;
let currentEditLineId = null;

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

function generateActivationCode() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String((bytes[0] % 900000) + 100000);
}

function passwordLengthForRole(role) {
  return role === "worker" ? 4 : 7;
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
      activation_code: null,
      password: null,
    };

    organization.created_by = user.id;
    authRepository.saveOrganizations([organization]);
    authRepository.saveUsers([user]);
    seedData.forOrganization(organization.id);
    return { user, organization };
  },
};

function ensureRecoveryAdmin(phone) {
  const existing = authRepository.findUserByPhone(phone);
  if (existing) return existing;

  const organizations = authRepository.getOrganizations();
  let organization = organizations[0];

  if (!organization) {
    organization = { id: createId("org"), name: "ארגון ראשי", created_by: null };
    authRepository.saveOrganizations([organization]);
  }

  const user = {
    id: createId("user"),
    phone,
    role: "admin",
    organization_id: organization.id,
    activation_code: null,
    password: null,
  };

  authRepository.saveUsers([...authRepository.getUsers(), user]);
  seedOrgDataIfNeeded(organization.id);

  if (!organization.created_by) {
    organization.created_by = user.id;
    authRepository.saveOrganizations(
      authRepository.getOrganizations().map((item) => (item.id === organization.id ? organization : item))
    );
  }

  return user;
}

const authService = {
  startLogin(phoneInput) {
    const phone = normalizePhone(phoneInput);

    if (phone.length < 9) {
      return { ok: false, reason: "הזן מספר טלפון תקין" };
    }

    if (phone === RECOVERY_ADMIN_PHONE) {
      return { ok: true, phone, mode: "password" };
    }

    if (!authRepository.hasUsers()) {
      return { ok: true, phone, mode: "bootstrap" };
    }

    const user = authRepository.findUserByPhone(phone);

    if (!user) {
      return { ok: false, reason: "אין לך גישה למערכת, פנה למנהל" };
    }

    if (user.password) {
      return { ok: true, phone, mode: "password" };
    }

    if (user.activation_code) {
      return { ok: true, phone, mode: "activate" };
    }

    return { ok: true, phone, mode: "set-password", role: user.role };
  },
  completeLoginForUser(user) {
    const session = {
      token: createSessionToken(),
      user_id: user.id,
      phone: user.phone,
      role: user.role,
      organization_id: user.organization_id,
      created_at: new Date().toISOString(),
    };

    authRepository.saveSession(session);
    return { ok: true, session };
  },
  beginBootstrap(phone) {
    const result = organizationBootstrap.createFirstOrganization(phone);
    return { ok: true, role: result.user.role };
  },
  verifyActivationCode(phone, code) {
    const users = authRepository.getUsers();
    const user = users.find((item) => item.phone === phone);

    if (!user) {
      return { ok: false, reason: "אין לך גישה למערכת, פנה למנהל" };
    }

    if (!user.activation_code || user.activation_code !== code.trim()) {
      return { ok: false, reason: "קוד הפעלה שגוי" };
    }

    user.activation_code = null;
    authRepository.saveUsers(users);
    return { ok: true, role: user.role };
  },
  setPassword(phone, password, confirmPassword) {
    const users = authRepository.getUsers();
    const user = users.find((item) => item.phone === phone);

    if (!user) {
      return { ok: false, reason: "אין לך גישה למערכת, פנה למנהל" };
    }

    const requiredLength = passwordLengthForRole(user.role);

    if (password !== confirmPassword) {
      return { ok: false, reason: "הסיסמאות אינן תואמות" };
    }

    if (!/^\d+$/.test(password) || password.length !== requiredLength) {
      return { ok: false, reason: `הסיסמה צריכה להיות בת ${requiredLength} ספרות` };
    }

    user.password = password;
    authRepository.saveUsers(users);
    return this.completeLoginForUser(user);
  },
  async verifyPassword(phone, password) {
    if (phone === RECOVERY_ADMIN_PHONE) {
      const hash = await sha256Hex(password.trim());

      if (hash !== RECOVERY_ADMIN_PASSWORD_HASH) {
        return { ok: false, reason: "סיסמה שגויה" };
      }

      const user = ensureRecoveryAdmin(phone);
      user.role = "admin";
      user.password = password.trim();
      authRepository.saveUsers(
        authRepository.getUsers().map((item) => (item.id === user.id ? user : item))
      );
      return this.completeLoginForUser(user);
    }

    const user = authRepository.findUserByPhone(phone);

    if (!user || user.password !== password.trim()) {
      return { ok: false, reason: "סיסמה שגויה" };
    }

    return this.completeLoginForUser(user);
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

  document.querySelector(".app-shell").classList.toggle("app-shell--wide", screenId === "admin-screen");

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

    const title = document.createElement("strong");
    title.textContent = item.query;

    const meta = document.createElement("span");
    meta.textContent = `קו ${item.line_number} · ${item.line_name}`;

    article.append(title, meta);
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

    const phoneCell = document.createElement("div");
    phoneCell.className = "list-row-phone";

    const phoneSpan = document.createElement("span");
    phoneSpan.textContent = phoneLabel;
    phoneCell.appendChild(phoneSpan);

    if (user.activation_code) {
      const codeBtn = document.createElement("button");
      codeBtn.type = "button";
      codeBtn.className = "text-btn code-btn";
      codeBtn.textContent = "הצג קוד הפעלה";
      codeBtn.addEventListener("click", () => {
        window.alert(`קוד הפעלה חד-פעמי ל-${phoneLabel}:\n${user.activation_code}\n\nמסור אותו לעובד לכניסה הראשונה.`);
      });
      phoneCell.appendChild(codeBtn);
    }

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

    row.append(phoneCell, roleSelect, removeBtn);
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

    const info = document.createElement("div");
    info.className = "line-row-info";

    const title = document.createElement("b");
    title.textContent = `קו ${line.number}`;

    const areasText = line.areas.join(" · ");
    const areas = document.createElement("span");
    areas.textContent = areasText;
    areas.title = areasText;

    info.append(title, areas);

    const actions = document.createElement("div");
    actions.className = "line-row-actions";

    const streetsBtn = document.createElement("button");
    streetsBtn.type = "button";
    streetsBtn.textContent = "רחובות";
    streetsBtn.addEventListener("click", () => openLineStreetsModal(line));

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "עריכה";
    editBtn.addEventListener("click", () => openEditLineModal(line));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "danger-btn";
    deleteBtn.textContent = "מחיקה";
    deleteBtn.addEventListener("click", () => deleteLine(line));

    actions.append(streetsBtn, editBtn, deleteBtn);
    row.append(info, actions);
    linesList.appendChild(row);
  });

  linesList.classList.toggle("scrollable", linesList.children.length > 6);
}

function renderAdmin() {
  renderWorkers(adminFilter.value);
  renderLines(adminFilter.value);
  renderCityDatabaseSelect();
}

function openEditLineModal(line) {
  currentEditLineId = line.id;
  document.getElementById("edit-line-modal-title").textContent = `עריכת קו ${line.number}`;
  document.getElementById("edit-line-name").value = line.name;
  document.getElementById("edit-line-areas").value = line.areas.join(", ");
  document.getElementById("edit-line-notes").value = line.notes || "";
  document.getElementById("edit-line-modal").classList.remove("hidden");
  document.getElementById("edit-line-name").focus();
}

function closeEditLineModal() {
  document.getElementById("edit-line-modal").classList.add("hidden");
  currentEditLineId = null;
}

function saveEditLineModal() {
  if (!currentEditLineId) return;

  const name = document.getElementById("edit-line-name").value.trim();
  if (!name) {
    window.alert("הזן שם אזור חלוקה");
    return;
  }

  const allLines = dataRepository.getAllLines();
  const target = allLines.find((item) => item.id === currentEditLineId);
  if (!target) return;

  target.name = name;
  target.areas = document
    .getElementById("edit-line-areas")
    .value.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  target.notes = document.getElementById("edit-line-notes").value.trim();

  dataRepository.saveLines(allLines);
  closeEditLineModal();
  renderAdmin();
}

function deleteLine(line) {
  if (!window.confirm(`למחוק את קו ${line.number}?`)) return;

  dataRepository.saveLines(dataRepository.getAllLines().filter((item) => item.id !== line.id));
  dataRepository.saveAssignments(dataRepository.getAllAssignments().filter((item) => item.line_id !== line.id));
  renderAdmin();
}

function formatAssignmentLine(assignment) {
  if (assignment.street) return `${assignment.city} - ${assignment.street}`;
  return assignment.query;
}

function openLineStreetsModal(line) {
  currentLineStreetsModalLineId = line.id;
  document.getElementById("line-streets-modal-title").textContent = `רחובות משוייכים לקו ${line.number}`;

  const assignments = dataRepository.getAllAssignments().filter((item) => item.line_id === line.id);
  document.getElementById("line-streets-modal-textarea").value = assignments.map(formatAssignmentLine).join("\n");
  document.getElementById("line-streets-modal").classList.remove("hidden");
}

function closeLineStreetsModal() {
  document.getElementById("line-streets-modal").classList.add("hidden");
  currentLineStreetsModalLineId = null;
}

function saveLineStreetsModal() {
  if (!currentLineStreetsModalLineId) return;

  const lineId = currentLineStreetsModalLineId;
  const rawLines = document
    .getElementById("line-streets-modal-textarea")
    .value.split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const existingByFormat = new Map(
    dataRepository
      .getAllAssignments()
      .filter((item) => item.line_id === lineId)
      .map((item) => [formatAssignmentLine(item), item])
  );

  const finalEntries = [];
  const usedKeys = new Set();

  const addEntry = (key, buildEntry) => {
    if (usedKeys.has(key)) return;
    usedKeys.add(key);
    finalEntries.push(existingByFormat.get(key) || buildEntry());
  };

  rawLines.forEach((rawLine) => {
    const dashIndex = rawLine.indexOf(" - ");

    if (dashIndex !== -1) {
      const city = rawLine.slice(0, dashIndex).trim();
      const streets = rawLine
        .slice(dashIndex + 3)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      streets.forEach((street) => {
        addEntry(`${city} - ${street}`, () => ({
          id: createId("asgn"),
          line_id: lineId,
          query: `${street} ${city}`,
          city,
          street,
          organization_id: currentSession.organization_id,
        }));
      });
      return;
    }

    rawLine
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((query) => {
        addEntry(query, () => ({
          id: createId("asgn"),
          line_id: lineId,
          query,
          city: query.split(" ").pop() || query,
          organization_id: currentSession.organization_id,
        }));
      });
  });

  const otherAssignments = dataRepository.getAllAssignments().filter((item) => item.line_id !== lineId);
  dataRepository.saveAssignments([...otherAssignments, ...finalEntries]);
  closeLineStreetsModal();
  renderAdmin();
  window.alert("השינויים נשמרו");
}

function addLine() {
  const numberInput = window.prompt("מספר קו (אפשר גם עם אות, למשל 18א):", "");
  if (numberInput === null) return;

  const number = numberInput.trim();
  if (!number) {
    window.alert("הזן מספר קו תקין");
    return;
  }

  const existingLines = dataRepository.getLines(currentSession.organization_id);
  const normalizedNumber = normalizeQuery(number);
  if (existingLines.some((item) => normalizeQuery(String(item.number)) === normalizedNumber)) {
    window.alert(`קו ${number} כבר קיים. אם זה קו נפרד לאזור אחר, תן לו סיומת שונה (למשל 18א, 18ב)`);
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

  const code = generateActivationCode();

  authRepository.saveUsers([
    ...authRepository.getUsers(),
    {
      id: createId("user"),
      phone,
      role: "worker",
      organization_id: currentSession.organization_id,
      activation_code: code,
      password: null,
    },
  ]);

  document.getElementById("new-worker").value = "";
  renderWorkers(adminFilter.value);
  window.alert(`העובד נוסף.\nקוד הפעלה חד-פעמי: ${code}\nמסור אותו לעובד לכניסה הראשונה.`);
}

function assignAddress() {
  const rawInput = document.getElementById("assign-line").value.trim();
  const lineId = assignLineSelect.value;

  const queries = rawInput
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!queries.length || !lineId) {
    window.alert("בחר קו והזן כתובת לשיוך");
    return;
  }

  const newAssignments = queries.map((query) => ({
    id: createId("asgn"),
    line_id: lineId,
    query,
    city: query.split(" ").pop() || query,
    organization_id: currentSession.organization_id,
  }));

  dataRepository.saveAssignments([...dataRepository.getAllAssignments(), ...newAssignments]);

  document.getElementById("assign-line").value = "";
  renderAdmin();
  window.alert(queries.length > 1 ? `${queries.length} כתובות שויכו בהצלחה` : "הכתובת שויכה בהצלחה");
}

let cityStreetsData = null;

async function ensureCityStreetsLoaded() {
  if (cityStreetsData) return cityStreetsData;
  const response = await fetch("data/cities-streets.json");
  if (!response.ok) {
    throw new Error(`failed to load city streets database (HTTP ${response.status})`);
  }
  cityStreetsData = await response.json();
  return cityStreetsData;
}

function getAllKnownCities() {
  const overrides = readStore(STORAGE_KEYS.cityStreetOverrides, {});
  return new Set([...Object.keys(cityStreetsData || {}), ...Object.keys(overrides)]);
}

function findCityMatch(inputCity) {
  const allCities = getAllKnownCities();
  if (allCities.has(inputCity)) return inputCity;

  const normalizedInput = normalizeQuery(inputCity);
  for (const city of allCities) {
    const normalizedCity = normalizeQuery(city);
    if (normalizedCity.includes(normalizedInput) || normalizedInput.includes(normalizedCity)) {
      return city;
    }
  }

  return null;
}

function getCityStreets(city) {
  const overrides = readStore(STORAGE_KEYS.cityStreetOverrides, {});
  if (overrides[city]) return overrides[city];
  return (cityStreetsData && cityStreetsData[city]) || [];
}

function saveCityStreetsOverride(city, streets) {
  const overrides = readStore(STORAGE_KEYS.cityStreetOverrides, {});
  overrides[city] = streets;
  writeStore(STORAGE_KEYS.cityStreetOverrides, overrides);
}

async function loadCityStreets() {
  const cityInput = document.getElementById("city-input");
  const city = cityInput.value.trim();
  const block = document.getElementById("city-streets-block");
  const textarea = document.getElementById("city-streets-textarea");

  if (!city) {
    window.alert("הזן שם עיר");
    return;
  }

  try {
    await ensureCityStreetsLoaded();
  } catch (error) {
    window.alert("טעינת מאגר הרחובות נכשלה. בדוק שהקובץ data/cities-streets.json נגיש מהשרת שאתה מריץ, ונסה לרענן את הדף.");
    return;
  }

  const matchedCity = findCityMatch(city);

  if (!matchedCity) {
    window.alert('העיר לא נמצאה במאגר. ניתן להוסיף אותה במסך "מאגר רחובות לפי עיר" שבניהול.');
    return;
  }

  const streets = getCityStreets(matchedCity);

  if (!streets.length) {
    window.alert("אין עדיין רחובות שמורים לעיר הזו במאגר");
    return;
  }

  cityInput.value = matchedCity;
  textarea.value = streets.join("\n");
  block.classList.remove("hidden");
}

function saveCityStreets() {
  const city = document.getElementById("city-input").value.trim();
  const lineId = assignLineSelect.value;
  const textarea = document.getElementById("city-streets-textarea");
  const streets = textarea.value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!city || !lineId) {
    window.alert("בחר קו וטען רחובות לעיר");
    return;
  }

  if (!streets.length) {
    window.alert("אין רחובות לשיוך");
    return;
  }

  const newAssignments = streets.map((street) => ({
    id: createId("asgn"),
    line_id: lineId,
    query: `${street} ${city}`,
    city,
    street,
    organization_id: currentSession.organization_id,
  }));

  dataRepository.saveAssignments([...dataRepository.getAllAssignments(), ...newAssignments]);

  document.getElementById("city-input").value = "";
  textarea.value = "";
  document.getElementById("city-streets-block").classList.add("hidden");
  renderAdmin();
  window.alert(`${newAssignments.length} רחובות שויכו לקו בהצלחה`);
}

function loadSelectedCityStreets() {
  const select = document.getElementById("city-database-select");
  const textarea = document.getElementById("city-database-textarea");
  textarea.value = getCityStreets(select.value).join("\n");
}

function renderCityDatabaseSelect() {
  const select = document.getElementById("city-database-select");

  if (!cityStreetsData) {
    select.innerHTML = '<option value="">טוען ערים...</option>';
    ensureCityStreetsLoaded()
      .then(() => renderCityDatabaseSelect())
      .catch(() => {
        select.innerHTML = '<option value="">טעינת המאגר נכשלה - בדוק את השרת ורענן</option>';
      });
    return;
  }

  const cities = Array.from(getAllKnownCities()).sort((a, b) => a.localeCompare(b, "he"));
  const previousValue = select.value;

  select.innerHTML = "";
  cities.forEach((city) => {
    const option = document.createElement("option");
    option.value = city;
    option.textContent = city;
    select.appendChild(option);
  });

  select.value = cities.includes(previousValue) ? previousValue : cities[0] || "";
  loadSelectedCityStreets();
}

function saveCityDatabaseStreets() {
  const select = document.getElementById("city-database-select");
  const textarea = document.getElementById("city-database-textarea");
  const city = select.value;

  if (!city) return;

  const streets = textarea.value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  saveCityStreetsOverride(city, streets);
  window.alert(`הרחובות של ${city} נשמרו`);
}

function resetCityDatabaseStreets() {
  const select = document.getElementById("city-database-select");
  const city = select.value;

  if (!city) return;

  const isInOriginalDatabase = Boolean(cityStreetsData && cityStreetsData[city]);
  if (!isInOriginalDatabase) {
    window.alert("העיר הזו אינה קיימת במאגר המקורי, ולכן אין אליה רשימה לאפס. אפשר רק לערוך ולשמור.");
    return;
  }

  if (!window.confirm(`לאפס את הרחובות של ${city} לרשימה המקורית מהמאגר הממשלתי? כל שינוי שעשית בעיר זו יימחק.`)) {
    return;
  }

  const overrides = readStore(STORAGE_KEYS.cityStreetOverrides, {});
  delete overrides[city];
  writeStore(STORAGE_KEYS.cityStreetOverrides, overrides);
  loadSelectedCityStreets();
  window.alert(`הרחובות של ${city} אופסו לרשימה המקורית`);
}

function addNewCityToDatabase() {
  const input = document.getElementById("new-city-input");
  const city = input.value.trim();

  if (!city) {
    window.alert("הזן שם עיר");
    return;
  }

  saveCityStreetsOverride(city, []);
  input.value = "";
  renderCityDatabaseSelect();

  const select = document.getElementById("city-database-select");
  select.value = city;
  loadSelectedCityStreets();
  document.getElementById("city-database-textarea").focus();
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

function hideAllAuthSteps() {
  phoneStep.classList.add("hidden");
  activateStep.classList.add("hidden");
  setPasswordStep.classList.add("hidden");
  passwordStep.classList.add("hidden");
}

function showPhoneStep() {
  hideAllAuthSteps();
  phoneStep.classList.remove("hidden");
  clearAuthMessages();
  document.getElementById("phone").focus();
}

function showActivateStep() {
  hideAllAuthSteps();
  activateStep.classList.remove("hidden");
  document.getElementById("activation-code").value = "";
  document.getElementById("activation-code").focus();
}

function showSetPasswordStep(role) {
  hideAllAuthSteps();
  setPasswordStep.classList.remove("hidden");

  const requiredLength = passwordLengthForRole(role);
  const newPasswordInput = document.getElementById("new-password");
  const confirmPasswordInput = document.getElementById("confirm-password");
  newPasswordInput.maxLength = requiredLength;
  confirmPasswordInput.maxLength = requiredLength;
  newPasswordInput.value = "";
  confirmPasswordInput.value = "";
  document.getElementById("set-password-hint").textContent =
    `בחר סיסמה בת ${requiredLength} ספרות שתשמש אותך בכניסות הבאות.`;
  newPasswordInput.focus();
}

function showPasswordStep() {
  hideAllAuthSteps();
  passwordStep.classList.remove("hidden");
  document.getElementById("login-password").value = "";
  document.getElementById("login-password").focus();
}

function logout() {
  authRepository.clearSession();
  currentSession = null;
  pendingPhone = "";
  updateSessionSummary(null);
  document.getElementById("phone").value = "";
  showPhoneStep();
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
  setButtonLoading(button, true, "בודק...");

  window.setTimeout(() => {
    const result = authService.startLogin(document.getElementById("phone").value);
    setButtonLoading(button, false);

    if (!result.ok) {
      showError(result.reason);
      return;
    }

    pendingPhone = result.phone;

    if (result.mode === "bootstrap") {
      authStatus.textContent = "יוצר ארגון ומשייך אדמין...";
      authStatus.classList.remove("hidden");
      window.setTimeout(() => {
        const bootstrapResult = authService.beginBootstrap(pendingPhone);
        authStatus.classList.add("hidden");
        showSetPasswordStep(bootstrapResult.role);
      }, 650);
      return;
    }

    if (result.mode === "password") {
      showPasswordStep();
      return;
    }

    if (result.mode === "set-password") {
      showSetPasswordStep(result.role);
      return;
    }

    showActivateStep();
  }, 200);
});

document.getElementById("activate-btn").addEventListener("click", () => {
  clearAuthMessages();
  const button = document.getElementById("activate-btn");
  setButtonLoading(button, true, "מאמת...");

  window.setTimeout(() => {
    const code = document.getElementById("activation-code").value.trim();
    const result = authService.verifyActivationCode(pendingPhone, code);
    setButtonLoading(button, false);

    if (!result.ok) {
      showError(result.reason);
      return;
    }

    showSetPasswordStep(result.role);
  }, 200);
});

document.getElementById("save-password-btn").addEventListener("click", () => {
  clearAuthMessages();
  const button = document.getElementById("save-password-btn");
  setButtonLoading(button, true, "שומר...");

  window.setTimeout(() => {
    const password = document.getElementById("new-password").value.trim();
    const confirmPassword = document.getElementById("confirm-password").value.trim();
    const result = authService.setPassword(pendingPhone, password, confirmPassword);
    setButtonLoading(button, false);

    if (!result.ok) {
      showError(result.reason);
      return;
    }

    completeLogin(result.session);
  }, 200);
});

document.getElementById("login-password-btn").addEventListener("click", () => {
  clearAuthMessages();
  const button = document.getElementById("login-password-btn");
  setButtonLoading(button, true, "מתחבר...");

  window.setTimeout(async () => {
    const password = document.getElementById("login-password").value;
    const result = await authService.verifyPassword(pendingPhone, password);
    setButtonLoading(button, false);

    if (!result.ok) {
      showError(result.reason);
      return;
    }

    completeLogin(result.session);
  }, 200);
});

document.getElementById("back-to-phone-from-activate").addEventListener("click", showPhoneStep);
document.getElementById("back-to-phone-from-password").addEventListener("click", showPhoneStep);

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

document.querySelectorAll(".admin-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".admin-tab").forEach((item) => {
      item.classList.toggle("active", item === tab);
      item.setAttribute("aria-selected", String(item === tab));
    });

    document.querySelectorAll(".admin-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === tab.dataset.panel);
    });
  });
});

document.getElementById("add-worker-btn").addEventListener("click", addWorker);
document.getElementById("add-line-btn").addEventListener("click", addLine);
document.getElementById("assign-btn").addEventListener("click", assignAddress);
document.getElementById("load-streets-btn").addEventListener("click", loadCityStreets);
document.getElementById("save-city-streets-btn").addEventListener("click", saveCityStreets);
document.getElementById("city-database-select").addEventListener("change", loadSelectedCityStreets);
document.getElementById("save-city-database-btn").addEventListener("click", saveCityDatabaseStreets);
document.getElementById("reset-city-database-btn").addEventListener("click", resetCityDatabaseStreets);
document.getElementById("add-city-btn").addEventListener("click", addNewCityToDatabase);
document.getElementById("line-streets-modal-save").addEventListener("click", saveLineStreetsModal);
document.getElementById("line-streets-modal-close").addEventListener("click", closeLineStreetsModal);
document.getElementById("line-streets-modal").addEventListener("click", (event) => {
  if (event.target.id === "line-streets-modal") closeLineStreetsModal();
});
document.getElementById("edit-line-modal-save").addEventListener("click", saveEditLineModal);
document.getElementById("edit-line-modal-close").addEventListener("click", closeEditLineModal);
document.getElementById("edit-line-modal").addEventListener("click", (event) => {
  if (event.target.id === "edit-line-modal") closeEditLineModal();
});
adminFilter.addEventListener("input", () => renderAdmin());

bindEnterKey(document.getElementById("phone"), () => document.getElementById("send-code").click());
bindEnterKey(document.getElementById("activation-code"), () => document.getElementById("activate-btn").click());
bindEnterKey(document.getElementById("confirm-password"), () => document.getElementById("save-password-btn").click());
bindEnterKey(document.getElementById("login-password"), () => document.getElementById("login-password-btn").click());
bindEnterKey(addressSearch, () => document.getElementById("search-btn").click());
bindEnterKey(document.getElementById("new-worker"), addWorker);
bindEnterKey(document.getElementById("assign-line"), assignAddress);
bindEnterKey(document.getElementById("city-input"), loadCityStreets);

initApp();
registerServiceWorker();
ensureCityStreetsLoaded().catch(() => {});
