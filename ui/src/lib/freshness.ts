let consequentialWritesAllowed = true;

export function setConsequentialWritesAllowed(allowed: boolean) {
  consequentialWritesAllowed = allowed;
}

export function requireFreshConnection() {
  if (!consequentialWritesAllowed) {
    throw new Error("Croki is reconnecting. Nothing consequential can change until the firm is current again.");
  }
}
