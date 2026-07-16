const directionCopy = {
  rooms: {
    title: "Bet Rooms",
    read: "The smallest structural correction: the bet becomes a room and its work becomes addressable.",
  },
  map: {
    title: "Command Map",
    read: "The fast operating version: selection is scope and the canvas becomes the command surface.",
  },
  yard: {
    title: "The Workyard",
    read: "The signature version: bets are territories, teammates occupy work, and exact acts cross the wall.",
  },
};

function activateDirection(direction) {
  document.querySelectorAll("[data-screen]").forEach((screen) => {
    const active = screen.dataset.screen === direction;
    screen.classList.toggle("is-active", active);
    screen.hidden = !active;
  });
  document.querySelectorAll("[data-direction]").forEach((button) => {
    const active = button.dataset.direction === direction;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelector("#direction-title").textContent = directionCopy[direction].title;
  document.querySelector("#direction-read").textContent = directionCopy[direction].read;
  const url = new URL(window.location.href);
  url.searchParams.set("direction", direction);
  window.history.replaceState(null, "", url);
}

document.querySelectorAll("[data-direction]").forEach((button) => {
  button.addEventListener("click", () => activateDirection(button.dataset.direction));
});

function selectRoomCard(card) {
  document.querySelectorAll(".rooms-frame .work-card").forEach((candidate) => candidate.classList.remove("is-selected"));
  card.classList.add("is-selected");
  document.querySelector("[data-scope-card]").textContent = card.dataset.title;
  const names = [...card.querySelectorAll(".participant-stack .face")].map((face) => face.textContent === "Y" ? "Yara" : face.textContent === "R" ? "Reed" : "Mika");
  document.querySelector("[data-scope-agents]").textContent = names.join(", ") || "Firm";
}

document.querySelectorAll(".rooms-frame .work-card").forEach((card) => {
  card.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    selectRoomCard(card);
  });
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectRoomCard(card);
    }
  });
});

document.querySelectorAll("[data-focus-card]").forEach((button) => {
  button.addEventListener("click", () => {
    const card = document.querySelector(`#${button.dataset.focusCard}`);
    if (!card) return;
    selectRoomCard(card);
    card.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    card.focus({ preventScroll: true });
  });
});

document.querySelectorAll(".crew-chip").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".crew-chip").forEach((candidate) => candidate.classList.remove("is-selected"));
    button.classList.add("is-selected");
    document.querySelector("[data-scope-agents]").textContent = button.dataset.agent;
  });
});

let wallTrigger = null;
function changeWall(open) {
  const wall = document.querySelector("[data-wall]");
  if (!open && wall.contains(document.activeElement)) wallTrigger?.focus();
  wall.classList.toggle("is-open", open);
  wall.setAttribute("aria-hidden", String(!open));
}
document.querySelectorAll("[data-open-wall]").forEach((button) => button.addEventListener("click", () => {
  wallTrigger = button;
  changeWall(true);
}));
document.querySelectorAll("[data-close-wall]").forEach((button) => button.addEventListener("click", () => changeWall(false)));

const mapSelected = new Set(["Signal definition"]);
function renderMapScope() {
  const selectedCards = [...document.querySelectorAll("[data-map-card].is-selected, [data-map-card].is-combined")];
  const titles = selectedCards.map((card) => card.dataset.mapCard);
  const agents = [...new Set(selectedCards.flatMap((card) => card.dataset.mapAgents.split(", ").filter(Boolean)))];
  document.querySelector("[data-map-scope-card]").textContent = titles.join(" + ") || "whole bet";
  document.querySelector("[data-map-scope-agents]").textContent = agents.join(", ") || "Firm";
}
document.querySelectorAll("[data-map-card]").forEach((card) => {
  card.addEventListener("click", (event) => {
    if (!event.shiftKey) {
      mapSelected.clear();
      document.querySelectorAll("[data-map-card]").forEach((candidate) => candidate.classList.remove("is-selected", "is-combined"));
      mapSelected.add(card.dataset.mapCard);
      card.classList.add("is-selected");
    } else if (mapSelected.has(card.dataset.mapCard)) {
      mapSelected.delete(card.dataset.mapCard);
      card.classList.remove("is-selected", "is-combined");
    } else {
      mapSelected.add(card.dataset.mapCard);
      card.classList.add("is-combined");
    }
    renderMapScope();
  });
});

function selectYardCard(card) {
  document.querySelectorAll("[data-yard-card]").forEach((candidate) => candidate.classList.remove("is-selected"));
  card.classList.add("is-selected");
  document.querySelector("[data-yard-scope-card]").textContent = card.dataset.yardCard;
  document.querySelector("[data-yard-scope-agents]").textContent = card.dataset.yardAgents;
}
document.querySelectorAll("[data-yard-card]").forEach((card) => card.addEventListener("click", () => selectYardCard(card)));

let yardWallTrigger = null;
function changeYardWall(open) {
  const wall = document.querySelector("[data-yard-wall]");
  if (!open && wall.contains(document.activeElement)) yardWallTrigger?.focus();
  wall.classList.toggle("is-open", open);
  wall.setAttribute("aria-hidden", String(!open));
}
document.querySelectorAll("[data-open-yard-wall]").forEach((button) => button.addEventListener("click", (event) => {
  yardWallTrigger = event.currentTarget;
  selectYardCard(event.currentTarget);
  changeYardWall(true);
}));
document.querySelectorAll("[data-close-yard-wall]").forEach((button) => button.addEventListener("click", () => changeYardWall(false)));

document.querySelectorAll("form").forEach((form) => form.addEventListener("submit", (event) => {
  event.preventDefault();
  const field = form.querySelector("textarea, input");
  if (!field?.value.trim()) return;
  field.value = "";
  field.placeholder = "Direction staged in this prototype";
}));

const requested = new URL(window.location.href).searchParams.get("direction");
activateDirection(Object.hasOwn(directionCopy, requested) ? requested : "rooms");
