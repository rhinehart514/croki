import { createSyncDesktopHostClient } from "../../brain/src/desktop-host-seams.mjs";

const call = createSyncDesktopHostClient();
const encrypted = call("credentials.encrypt", { plaintext: "child-secret" });
const decrypted = call("credentials.decrypt", { ciphertext: encrypted.value });
process.send?.({ encrypted: encrypted.value, decrypted: decrypted.value });
