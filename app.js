const screens = document.querySelectorAll(".screen");
const bottomNav = document.getElementById("bottom-nav");
const navItems = document.querySelectorAll(".nav-item");
const phoneStep = document.getElementById("phone-step");
const otpStep = document.getElementById("otp-step");
const accessError = document.getElementById("access-error");
const addressSearch = document.getElementById("address-search");

function showScreen(screenId) {
  screens.forEach((screen) => {
    screen.classList.toggle("active", screen.id === screenId);
  });

  const isLoggedInArea = screenId !== "login-screen";
  bottomNav.classList.toggle("hidden", !isLoggedInArea);

  navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.target === screenId);
  });
}

document.getElementById("send-code").addEventListener("click", () => {
  accessError.classList.add("hidden");
  phoneStep.classList.add("hidden");
  otpStep.classList.remove("hidden");
  document.getElementById("otp").focus();
});

document.getElementById("verify-code").addEventListener("click", () => {
  const phone = document.getElementById("phone").value.trim();
  const otp = document.getElementById("otp").value.trim();

  if (phone.endsWith("0000") || otp === "000000") {
    accessError.classList.remove("hidden");
    return;
  }

  showScreen("search-screen");
  addressSearch.focus();
});

document.getElementById("back-to-phone").addEventListener("click", () => {
  otpStep.classList.add("hidden");
  phoneStep.classList.remove("hidden");
  accessError.classList.add("hidden");
  document.getElementById("phone").focus();
});

document.getElementById("logout-btn").addEventListener("click", () => {
  showScreen("login-screen");
});

document.getElementById("search-btn").addEventListener("click", () => {
  showScreen("result-screen");
});

document.getElementById("new-search").addEventListener("click", () => {
  showScreen("search-screen");
  addressSearch.select();
});

document.querySelectorAll(".recent-item").forEach((item) => {
  item.addEventListener("click", () => {
    addressSearch.value = item.dataset.query;
    showScreen("result-screen");
  });
});

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    showScreen(item.dataset.target);
  });
});
