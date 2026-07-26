import "./storage-mock.js";
window.storage = {
  async get(key, shared) {
    const raw = localStorage.getItem((shared ? "shared:" : "user:") + key);
    if (raw === null) throw new Error("not found");
    return { key, value: raw, shared: !!shared };
  },
  async set(key, value, shared) {
    localStorage.setItem((shared ? "shared:" : "user:") + key, value);
    return { key, value, shared: !!shared };
  },
  async delete(key, shared) {
    localStorage.removeItem((shared ? "shared:" : "user:") + key);
    return { key, deleted: true, shared: !!shared };
  },
  async list(prefix, shared) {
    const p = (shared ? "shared:" : "user:") + (prefix || "");
    const keys = Object.keys(localStorage).filter(k => k.startsWith(p)).map(k => k.slice(p.length));
    return { keys, prefix, shared: !!shared };
  },
};