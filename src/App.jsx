import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { Plus, Search, LogOut, Phone, Calendar, User, Trash2, Pencil, X, ChefHat, ClipboardList, Loader2, RefreshCw } from "lucide-react";

// ---------------------------------------------------------------------------
// SUPABASE CONFIG — same project as the public website.
// ---------------------------------------------------------------------------
const SUPABASE_URL = "https://zwnkmpujlfeppgmhuhav.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_E5J3mtKQAE_Jco1muLxa-w_641ZuDw3";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Convert a database row (snake_case) into the shape the UI uses (camelCase)
function fromRow(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    eventType: row.event_type,
    eventDate: row.event_date || "",
    details: row.details || "",
    status: row.status,
    source: row.source,
    createdAt: row.created_at,
  };
}

// Convert a UI order object back into database columns for insert/update
function toRow(order) {
  return {
    name: order.name,
    phone: order.phone,
    event_type: order.eventType,
    event_date: order.eventDate || null,
    details: order.details,
    status: order.status,
    source: order.source,
  };
}

const EVENT_TYPES = ["Wedding / Owambe", "Corporate Event", "Private Dinner", "Other"];
const STATUSES = ["New", "Confirmed", "In Progress", "Completed", "Cancelled"];
const SOURCES = ["Phone", "Walk-in", "Website", "Referral"];

const STATUS_STYLES = {
  New: { bg: "#FBE7C6", fg: "#A8580E" },
  Confirmed: { bg: "#DCEAD2", fg: "#3E5A2C" },
  "In Progress": { bg: "#FDE0D3", fg: "#B8451C" },
  Completed: { bg: "#DDEBE3", fg: "#2C5A45" },
  Cancelled: { bg: "#F1D8D8", fg: "#8A2E2E" },
};

function emptyOrder() {
  return {
    id: null, // null means "not saved yet" — a real id comes back from Supabase on insert
    name: "",
    phone: "",
    eventType: EVENT_TYPES[0],
    eventDate: "",
    details: "",
    status: "New",
    source: "Phone",
    createdAt: null,
  };
}

export default function AdminDashboard() {
  const [authed, setAuthed] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [emailInput, setEmailInput] = useState("");
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [staffName, setStaffName] = useState("");

  const [orders, setOrders] = useState([]);
  const loadRequestId = useRef(0); // incremented each time we start a load, so we can ignore stale responses
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [modalOrder, setModalOrder] = useState(null); // order object being added/edited, or null
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // Inject brand fonts
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,600;0,700;1,500&family=Karla:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  // Restore login on page reload, and stay in sync with auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthed(!!session);
      if (session?.user?.email) setStaffName(session.user.email.split("@")[0]);
      setCheckingSession(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session);
      if (session?.user?.email) setStaffName(session.user.email.split("@")[0]);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // Load orders from shared storage once authed
  const loadOrders = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setLoadError("");
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    // If a newer refresh started while this one was in flight, ignore this
    // older response so it can't overwrite fresher data.
    if (requestId !== loadRequestId.current) return;

    if (error) {
      setLoadError("Could not load orders — check your connection and try again.");
      setOrders([]);
    } else {
      setOrders(data.map(fromRow));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authed) return;
    // Avoid calling setState synchronously inside an effect — schedule async
    const tid = setTimeout(() => {
      loadOrders();
    }, 0);
    return () => clearTimeout(tid);
  }, [authed, loadOrders]);

 // Live-update: new/changed/deleted orders show up instantly, no reload needed
  useEffect(() => {
    if (!authed) return;
    const channel = supabase
      .channel("orders-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        loadOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authed, loadOrders]); 

  // Safety-net auto-refresh every 5 minutes, in case a live update is missed
  useEffect(() => {
    if (!authed) return;
    const interval = setInterval(() => {
      loadOrders();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [authed, loadOrders]);

  // Automatically sign out after 15 minutes of no activity (mouse, keyboard, touch)
  // — useful if staff share one computer and someone forgets to log out.
  useEffect(() => {
    if (!authed) return;

    let lastActivity = Date.now();
    const markActive = () => { lastActivity = Date.now(); };
    const events = ["mousemove", "keydown", "click", "touchstart", "scroll"];
    events.forEach((evt) => window.addEventListener(evt, markActive));

    let signingOut = false;

    const idleCheck = setInterval(async () => {
      if (signingOut) return; // a sign-out attempt is already in progress
      if (Date.now() - lastActivity > 15 * 60 * 1000) {
        signingOut = true;
        try {
          await supabase.auth.signOut();
        } catch (err) {
          console.error("Idle auto sign-out failed:", err);
        } finally {
          signingOut = false;
        }
      }
    }, 30 * 1000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, markActive));
      clearInterval(idleCheck);
    };
  }, [authed]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setPwError("");
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: emailInput.trim(),
      password: pwInput,
    });
    setAuthLoading(false);
    if (error) {
      setPwError("Email or password is incorrect — check with your manager.");
    }
  };

  const saveOrder = async (order) => {
    setSaving(true);
    setLoadError("");

    if (order.id) {
      const { error } = await supabase.from("orders").update(toRow(order)).eq("id", order.id);
      if (error) {
        setLoadError("Could not save changes — please try again.");
      } else {
        setOrders((prev) => prev.map((o) => (o.id === order.id ? order : o)));
        setModalOrder(null);
      }
    } else {
      const { data, error } = await supabase.from("orders").insert([toRow(order)]).select();
      if (error) {
        setLoadError("Could not save this order — please try again.");
      } else {
        setOrders((prev) => [fromRow(data[0]), ...prev]);
        setModalOrder(null);
      }
    }
    setSaving(false);
  };

  const deleteOrder = async (id) => {
    const { error } = await supabase.from("orders").delete().eq("id", id);
    if (error) {
      setLoadError("Could not delete this order — please try again.");
    } else {
      setOrders((prev) => prev.filter((o) => o.id !== id));
    }
    setConfirmDeleteId(null);
  };

  const setStatus = async (id, status) => {
    const previous = orders;
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) {
      setLoadError("Could not update status — please try again.");
      setOrders(previous);
    }
  };

  const filtered = orders
    .filter((o) => (statusFilter === "All" ? true : o.status === statusFilter))
    .filter((o) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        o.name.toLowerCase().includes(q) ||
        o.phone.toLowerCase().includes(q) ||
        o.eventType.toLowerCase().includes(q) ||
        (o.details || "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const counts = {
    total: orders.length,
    New: orders.filter((o) => o.status === "New").length,
    Confirmed: orders.filter((o) => o.status === "Confirmed").length,
    Completed: orders.filter((o) => o.status === "Completed").length,
  };

  const fontDisplay = { fontFamily: "'Fraunces', serif" };
  const fontBody = { fontFamily: "'Karla', sans-serif" };

  // ---------------------------------------------------------------- LOGIN
  if (checkingSession) {
    return (
      <div style={{ ...fontBody, minHeight: "600px", display: "flex", alignItems: "center", justifyContent: "center", background: "#FFF6E8", color: "#5A4438" }}>
        Loading…
      </div>
    );
  }

  if (!authed) {
    return (
      <div
        style={{
          ...fontBody,
          minHeight: "600px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(160deg, #2A1B14 0%, #3E2A1C 100%)",
          padding: "24px",
        }}
      >
        <form
          onSubmit={handleLogin}
          style={{
            background: "#FFF6E8",
            borderRadius: "24px",
            padding: "40px 36px",
            width: "100%",
            maxWidth: "380px",
            boxShadow: "0 30px 60px -20px rgba(0,0,0,.5)",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "#D5311C",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "18px",
              boxShadow: "0 10px 24px -8px rgba(213,49,28,.6)",
            }}
          >
            <ChefHat color="#fff" size={28} />
          </div>
          <h1 style={{ ...fontDisplay, fontSize: "26px", fontWeight: 700, color: "#2A1B14", margin: 0 }}>
            Lolytee Admin
          </h1>
          <p style={{ color: "#5A4438", fontSize: "14px", marginTop: "6px", marginBottom: "26px" }}>
            Staff sign-in &mdash; orders &amp; bookings
          </p>

          <label style={{ fontSize: "12px", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "#5A4438" }}>
            Email
          </label>
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="you@lolytee.staff"
            style={inputStyle}
            autoFocus
          />

          <label style={{ fontSize: "12px", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "#5A4438", marginTop: "16px", display: "block" }}>
            Password
          </label>
          <input
            type="password"
            value={pwInput}
            onChange={(e) => setPwInput(e.target.value)}
            placeholder="Enter your password"
            style={inputStyle}
          />

          {pwError && (
            <p style={{ color: "#A81F10", fontSize: "13.5px", marginTop: "10px", fontWeight: 600 }}>{pwError}</p>
          )}

          <button
            type="submit"
            disabled={authLoading}
            style={{
              ...fontBody,
              width: "100%",
              marginTop: "24px",
              background: authLoading ? "#C97362" : "#D5311C",
              color: "#fff",
              border: "none",
              borderRadius: "999px",
              padding: "13px",
              fontWeight: 700,
              fontSize: "15px",
              cursor: authLoading ? "default" : "pointer",
              boxShadow: "0 10px 24px -8px rgba(213,49,28,.55)",
            }}
          >
            {authLoading ? "Logging in..." : "Log In"}
          </button>
        </form>
      </div>
    );
  }

  // ---------------------------------------------------------------- APP
  return (
    <div style={{ ...fontBody, minHeight: "600px", background: "#FFF6E8" }}>
      {/* Header */}
      <div style={{ background: "#2A1B14", color: "#FBE7C6", padding: "18px 26px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "38px", height: "38px", borderRadius: "50%", background: "#D5311C", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ChefHat color="#fff" size={19} />
          </div>
          <div>
            <div style={{ ...fontDisplay, fontSize: "18px", fontWeight: 700, color: "#fff", lineHeight: 1 }}>Lolytee Admin</div>
            <div style={{ fontSize: "11.5px", color: "#F1A22E", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", marginTop: "3px" }}>
              Orders Dashboard
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {staffName && <span style={{ fontSize: "13.5px", color: "#FBE7C6" }}>Hi, {staffName}</span>}
          <button
            onClick={async () => { await supabase.auth.signOut(); setPwInput(""); }}
            style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(255,255,255,.1)", color: "#FBE7C6", border: "none", borderRadius: "999px", padding: "8px 14px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}
          >
            <LogOut size={14} /> Log Out
          </button>
        </div>
      </div>

      <div style={{ padding: "26px", maxWidth: "1180px", margin: "0 auto" }}>
        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: "14px", marginBottom: "22px" }}>
          <StatCard label="Total Orders" value={counts.total} icon={<ClipboardList size={17} />} />
          <StatCard label="New" value={counts.New} accent="#A8580E" bg="#FBE7C6" />
          <StatCard label="Confirmed" value={counts.Confirmed} accent="#3E5A2C" bg="#DCEAD2" />
          <StatCard label="Completed" value={counts.Completed} accent="#2C5A45" bg="#DDEBE3" />
        </div>

        {/* Toolbar */}
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center", marginBottom: "20px" }}>
          <div style={{ position: "relative", flex: "1 1 220px" }}>
            <Search size={16} style={{ position: "absolute", left: "13px", top: "50%", transform: "translateY(-50%)", color: "#9C8672" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone, event type..."
              style={{ ...inputStyle, margin: 0, paddingLeft: "36px" }}
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...inputStyle, margin: 0, width: "auto", minWidth: "150px" }}>
            <option value="All">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button
            onClick={loadOrders}
            disabled={loading}
            title="Refresh orders"
            style={{ display: "flex", alignItems: "center", gap: "6px", background: "#fff", color: "#5A4438", border: "1.5px solid rgba(42,27,20,.16)", borderRadius: "999px", padding: "12px 16px", fontWeight: 700, fontSize: "14px", cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1 }}
          >
            <RefreshCw size={15} />
          </button>
          <button
            onClick={() => setModalOrder(emptyOrder())}
            style={{ display: "flex", alignItems: "center", gap: "8px", background: "#D5311C", color: "#fff", border: "none", borderRadius: "999px", padding: "12px 20px", fontWeight: 700, fontSize: "14.5px", cursor: "pointer", boxShadow: "0 10px 20px -8px rgba(213,49,28,.5)" }}
          >
            <Plus size={16} /> New Order
          </button>
        </div>

        {loadError && (
          <div style={{ background: "#F1D8D8", color: "#8A2E2E", padding: "12px 16px", borderRadius: "10px", marginBottom: "16px", fontSize: "14px", fontWeight: 600 }}>
            {loadError}
          </div>
        )}

        {/* Orders list */}
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#5A4438", padding: "40px 0", justifyContent: "center" }}>
            <Loader2 className="spin" size={18} />
            <span>Loading orders&hellip;</span>
            <style>{`.spin{animation:spin 1s linear infinite} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#9C8672" }}>
            <ClipboardList size={34} style={{ marginBottom: "10px", opacity: 0.5 }} />
            <p style={{ margin: 0, fontSize: "15px" }}>
              {orders.length === 0 ? "No orders yet. Add your first one." : "No orders match your search/filter."}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {filtered.map((o) => (
              <OrderRow
                key={o.id}
                order={o}
                onEdit={() => setModalOrder(o)}
                onDelete={() => setConfirmDeleteId(o.id)}
                onStatusChange={(s) => setStatus(o.id, s)}
              />
            ))}
          </div>
        )}
      </div>

      {modalOrder && (
        <OrderModal
          order={modalOrder}
          onClose={() => setModalOrder(null)}
          onSave={saveOrder}
          saving={saving}
        />
      )}

      {confirmDeleteId && (
        <ConfirmDialog
          message="Delete this order? This can't be undone."
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={() => deleteOrder(confirmDeleteId)}
        />
      )}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "10px",
  border: "1.5px solid rgba(42,27,20,.16)",
  background: "#fff",
  fontSize: "14.5px",
  fontFamily: "'Karla', sans-serif",
  color: "#2A1B14",
  marginTop: "6px",
  outline: "none",
  boxSizing: "border-box",
};

function StatCard({ label, value, accent = "#2A1B14", bg = "#fff", icon }) {
  return (
    <div style={{ background: bg, borderRadius: "14px", padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", color: accent, opacity: 0.85 }}>
        {icon}
        <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</span>
      </div>
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: "28px", fontWeight: 700, color: accent, marginTop: "4px" }}>{value}</div>
    </div>
  );
}

function OrderRow({ order, onEdit, onDelete, onStatusChange }) {
  const style = STATUS_STYLES[order.status] || STATUS_STYLES.New;
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "14px",
        padding: "16px 18px",
        display: "flex",
        alignItems: "center",
        gap: "18px",
        flexWrap: "wrap",
        boxShadow: "0 6px 16px -12px rgba(42,27,20,.3)",
      }}
    >
      <div style={{ flex: "1 1 180px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7px", fontWeight: 700, fontSize: "15px", color: "#2A1B14" }}>
          <User size={14} color="#9C8672" /> {order.name || "Unnamed"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#5A4438", marginTop: "4px" }}>
          <Phone size={12} /> {order.phone || "—"}
        </div>
      </div>
      <div style={{ flex: "1 1 150px" }}>
        <div style={{ fontSize: "13.5px", fontWeight: 600, color: "#2A1B14" }}>{order.eventType}</div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "#9C8672", marginTop: "3px" }}>
          <Calendar size={12} /> {order.eventDate || "No date set"}
        </div>
      </div>
      <div style={{ flex: "2 1 220px", fontSize: "13px", color: "#5A4438", minWidth: 0 }}>
        {order.details ? (order.details.length > 90 ? order.details.slice(0, 90) + "…" : order.details) : <em style={{ color: "#C6B7A5" }}>No details added</em>}
      </div>
      <div style={{ flex: "0 0 auto" }}>
        <select
          value={order.status}
          onChange={(e) => onStatusChange(e.target.value)}
          style={{
            background: style.bg,
            color: style.fg,
            border: "none",
            borderRadius: "999px",
            padding: "7px 12px",
            fontWeight: 700,
            fontSize: "12.5px",
            cursor: "pointer",
          }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", gap: "6px", flex: "0 0 auto" }}>
        <button onClick={onEdit} title="Edit" style={iconBtnStyle}>
          <Pencil size={15} color="#5A4438" />
        </button>
        <button onClick={onDelete} title="Delete" style={iconBtnStyle}>
          <Trash2 size={15} color="#A81F10" />
        </button>
      </div>
    </div>
  );
}

const iconBtnStyle = {
  background: "#FFF6E8",
  border: "none",
  borderRadius: "8px",
  width: "32px",
  height: "32px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

function OrderModal({ order, onClose, onSave, saving }) {
  const [form, setForm] = useState(order);

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) return;
    onSave(form);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(42,27,20,.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        zIndex: 100,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={submit}
        style={{
          background: "#FFF6E8",
          borderRadius: "20px",
          padding: "30px",
          width: "100%",
          maxWidth: "460px",
          maxHeight: "88vh",
          overflowY: "auto",
          fontFamily: "'Karla', sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "21px", margin: 0, color: "#2A1B14" }}>
            {order.id ? "Edit Order" : "New Order"}
          </h2>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}>
            <X size={20} color="#5A4438" />
          </button>
        </div>

        <label style={labelStyle}>Customer Name *</label>
        <input required value={form.name} onChange={(e) => update("name", e.target.value)} style={inputStyle} placeholder="e.g. Mrs. Adeyemi" />

        <label style={labelStyle}>Phone Number *</label>
        <input required value={form.phone} onChange={(e) => update("phone", e.target.value)} style={inputStyle} placeholder="080..." />

        <label style={labelStyle}>Event Type</label>
        <select value={form.eventType} onChange={(e) => update("eventType", e.target.value)} style={inputStyle}>
          {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        <label style={labelStyle}>Event Date</label>
        <input type="date" value={form.eventDate} onChange={(e) => update("eventDate", e.target.value)} style={inputStyle} />

        <label style={labelStyle}>How was this order received?</label>
        <select value={form.source} onChange={(e) => update("source", e.target.value)} style={inputStyle}>
          {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <label style={labelStyle}>Status</label>
        <select value={form.status} onChange={(e) => update("status", e.target.value)} style={inputStyle}>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <label style={labelStyle}>Details</label>
        <textarea
          value={form.details}
          onChange={(e) => update("details", e.target.value)}
          style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
          placeholder="Guest count, location, menu preferences, budget..."
        />

        <button
          type="submit"
          disabled={saving}
          style={{
            width: "100%",
            marginTop: "22px",
            background: saving ? "#C97362" : "#D5311C",
            color: "#fff",
            border: "none",
            borderRadius: "999px",
            padding: "13px",
            fontWeight: 700,
            fontSize: "15px",
            cursor: saving ? "default" : "pointer",
          }}
        >
          {saving ? "Saving..." : order.id ? "Save Changes" : "Add Order"}
        </button>
      </form>
    </div>
  );
}

const labelStyle = {
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: ".04em",
  textTransform: "uppercase",
  color: "#5A4438",
  marginTop: "14px",
  display: "block",
};

function ConfirmDialog({ message, onCancel, onConfirm }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(42,27,20,.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        zIndex: 110,
      }}
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div style={{ background: "#FFF6E8", borderRadius: "16px", padding: "26px", maxWidth: "360px", width: "100%", fontFamily: "'Karla', sans-serif" }}>
        <p style={{ color: "#2A1B14", fontSize: "15px", margin: 0 }}>{message}</p>
        <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "11px", borderRadius: "999px", border: "1.5px solid #2A1B14", background: "transparent", fontWeight: 700, cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={onConfirm} style={{ flex: 1, padding: "11px", borderRadius: "999px", border: "none", background: "#A81F10", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
