import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clipboard,
  Clock3,
  Copy,
  Edit3,
  ExternalLink,
  Home,
  House,
  Loader2,
  Minus,
  MoreHorizontal,
  PackageCheck,
  Plus,
  Refrigerator,
  RotateCw,
  Search,
  Share2,
  ShoppingBasket,
  ShoppingCart,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "./lib/api";
import {
  addDays,
  dayDistance,
  formatFriendlyDate,
  formatMoney,
  formatQuantity,
  isExpired,
  isExpiringSoon,
  splitPaise,
} from "./lib/domain";
import { buildOrderPrompt, providerUrl, type Provider } from "./lib/providers";
import { householdSchema, inventorySchema, manualOrderSchema, placementSchema } from "./lib/schemas";
import { registerPantryTools } from "./lib/webmcp";
import type {
  DashboardData,
  HouseholdContext,
  InventoryInput,
  InventoryItem,
  Member,
  NextOrderItem,
  Order,
  OrderItem,
  PlacementItem,
} from "./types";

const CATEGORIES = ["Produce", "Dairy & eggs", "Pantry", "Frozen", "Snacks & drinks", "Household", "Other"];
const UNITS = ["pcs", "pack", "bottle", "carton", "tray", "kg", "g", "L", "ml"];

type Toast = { id: number; message: string; tone: "success" | "error" | "info" };

const emptyDashboard: DashboardData = { inventory: [], nextOrder: [], members: [], orders: [] };

export default function App() {
  return (
    <Routes>
      <Route path="/join/:token" element={<AppGate />} />
      <Route path="/*" element={<AppGate />} />
    </Routes>
  );
}

function AppGate() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [context, setContext] = useState<HouseholdContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const boot = useCallback(async () => {
    try {
      setError(null);
      await api.ensureSession();
      setContext(await api.getContext());
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void boot(); }, [boot]);

  if (loading) return <LoadingScreen />;
  if (error) return <FatalState message={error} onRetry={boot} />;

  if (!context) {
    return (
      <Onboarding
        token={token ?? null}
        onReady={(nextContext, inviteToken) => {
          setContext(nextContext);
          if (inviteToken) saveInviteToken(nextContext.household.id, inviteToken);
          navigate("/pantry", { replace: true });
        }}
      />
    );
  }

  if (token) saveInviteToken(context.household.id, token);

  return <HouseholdApp context={context} onContextChange={setContext} />;
}

function LoadingScreen() {
  return (
    <main className="center-screen" aria-live="polite">
      <div className="loading-mark"><ShoppingBasket size={28} /></div>
      <Loader2 className="spin" />
      <p>Opening the pantry…</p>
    </main>
  );
}

function FatalState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="center-screen">
      <div className="empty-illustration small"><AlertTriangle size={34} /></div>
      <h1>Couldn’t open Pantryhouse</h1>
      <p className="muted">{message}</p>
      <button className="button primary" onClick={onRetry}><RotateCw size={18} /> Try again</button>
    </main>
  );
}

function Onboarding({
  token,
  onReady,
}: {
  token: string | null;
  onReady: (context: HouseholdContext, inviteToken?: string) => void;
}) {
  const [preview, setPreview] = useState<{ household_name: string; members: Member[] } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [mode, setMode] = useState<"choose" | "create" | "new-member">(token ? "choose" : "create");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setBusy(true);
    api.previewInvite(token)
      .then((result) => setPreview(result))
      .catch((cause) => setPreviewError(messageOf(cause)))
      .finally(() => setBusy(false));
  }, [token]);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = householdSchema.safeParse({ householdName: form.get("householdName"), memberName: form.get("memberName") });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the details.");
    setBusy(true);
    setError(null);
    try {
      const result = await api.createHousehold(parsed.data.householdName, parsed.data.memberName);
      onReady(result.context, result.inviteToken);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  const join = async (memberId: string | null, memberName: string | null) => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const nextContext = await api.joinHousehold(token, memberId, memberName);
      onReady(nextContext, token);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  if (previewError) {
    return <FatalState message={previewError} onRetry={() => window.location.reload()} />;
  }

  return (
    <main className="onboarding-shell">
      <section className="onboarding-card">
        <div className="onboarding-art" aria-hidden="true">
          <img src="./grocery-tote.png" alt="" />
        </div>
        <div className="onboarding-copy">
          <div className="brand brand-dark"><span className="brand-mark"><ShoppingBasket /></span><span>Pantryhouse</span></div>
          {token ? (
            <>
              <p className="eyebrow">HOUSEHOLD INVITE</p>
              <h1>{busy && !preview ? "Checking your invite…" : `Join ${preview?.household_name ?? "the household"}`}</h1>
              <p className="muted">Pick your name on this device, or add yourself if you’re new.</p>
              {mode === "choose" && preview && (
                <div className="member-choice-list">
                  {preview.members.map((member) => (
                    <button key={member.id} className="member-choice" onClick={() => void join(member.id, null)} disabled={busy}>
                      <Avatar name={member.name} />
                      <span>{member.name}</span>
                      <ChevronRight size={18} />
                    </button>
                  ))}
                  <button className="button secondary full" onClick={() => setMode("new-member")}><Plus size={18} /> Add a new flatmate</button>
                </div>
              )}
              {mode === "new-member" && (
                <form className="stack" onSubmit={(event) => {
                  event.preventDefault();
                  const name = String(new FormData(event.currentTarget).get("memberName") ?? "").trim();
                  if (!name) return setError("Enter your name.");
                  void join(null, name);
                }}>
                  <label className="field"><span>Your name</span><input name="memberName" autoFocus maxLength={60} placeholder="e.g. Nisha" /></label>
                  <div className="button-row">
                    <button type="button" className="button ghost" onClick={() => setMode("choose")}><ArrowLeft size={18} /> Back</button>
                    <button className="button primary" disabled={busy}>{busy ? <Loader2 className="spin" /> : <House />} Join household</button>
                  </div>
                </form>
              )}
            </>
          ) : (
            <>
              <p className="eyebrow">A SHARED HOME FOR THE GROCERY LOOP</p>
              <h1>Know what’s home.<br />Order what isn’t.</h1>
              <p className="muted">Keep pantry stock, the next grocery run, and everyone’s share in one calm place.</p>
              <form className="stack" onSubmit={create}>
                <label className="field"><span>Household name</span><input name="householdName" autoFocus placeholder="e.g. Sunday House" /></label>
                <label className="field"><span>Your name</span><input name="memberName" placeholder="e.g. Asha" /></label>
                <button className="button primary full" disabled={busy}>{busy ? <Loader2 className="spin" /> : <House />} Create household</button>
              </form>
            </>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <p className="privacy-note">No password. Your invite link is the key to your household.</p>
        </div>
      </section>
    </main>
  );
}

function HouseholdApp({
  context,
  onContextChange,
}: {
  context: HouseholdContext;
  onContextChange: (context: HouseholdContext) => void;
}) {
  const location = useLocation();
  const [data, setData] = useState<DashboardData>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const refreshTimer = useRef<number | null>(null);

  const notify = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const toast = { id: Date.now() + Math.random(), message, tone };
    setToasts((current) => [...current, toast]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== toast.id)), 3800);
  }, []);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      setLoadError(null);
      await api.syncNextOrder(context.household.id);
      setData(await api.loadData(context.household.id));
    } catch (cause) {
      setLoadError(messageOf(cause));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [context.household.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => api.subscribe(context.household.id, () => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => void refresh(true), 120);
  }), [context.household.id, refresh]);

  useEffect(() => {
    const onFocus = () => void refresh(true);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  useEffect(() => registerPantryTools({ api, context, data, refresh }), [context, data, refresh]);

  const activeDraft = data.orders.find((order) => order.status === "draft") ?? null;
  const visibleNextOrder = data.nextOrder.filter((item) => !item.dismissed && !item.locked_order_id);

  const perform = async (work: () => Promise<void>, success?: string) => {
    try {
      await work();
      await refresh(true);
      if (success) notify(success);
    } catch (cause) {
      notify(messageOf(cause), "error");
      throw cause;
    }
  };

  if (loading) return <LoadingScreen />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><ShoppingBasket /></span><span>Pantryhouse</span></div>
        <nav aria-label="Main navigation">
          <NavItem to="/pantry" icon={<Refrigerator />} label="Pantry" />
          <NavItem to="/next-order" icon={<ShoppingCart />} label="Next order" badge={visibleNextOrder.length || undefined} />
          <NavItem to="/orders" icon={<CircleDollarSign />} label="Orders" badge={activeDraft ? 1 : undefined} />
          <NavItem to="/household" icon={<Users />} label="Household" />
        </nav>
        <div className="sidebar-footer">
          <Avatar name={context.member.name} />
          <div><strong>{context.member.name}</strong><span>{context.household.name}</span></div>
        </div>
      </aside>

      <div className="main-column">
        {api.isDemo && (
          <div className="demo-banner"><Sparkles size={16} /><span>Demo data is active. Connect Supabase to share this household.</span></div>
        )}
        {loadError && (
          <div className="error-banner"><AlertTriangle size={18} /><span>{loadError}</span><button onClick={() => void refresh()}>Retry</button></div>
        )}
        <header className="mobile-header">
          <div className="brand brand-dark"><span className="brand-mark"><ShoppingBasket /></span><span>Pantryhouse</span></div>
          <Avatar name={context.member.name} small />
        </header>
        <main className="page-content" key={location.pathname}>
          <Routes>
            <Route path="/pantry" element={<PantryPage householdId={context.household.id} data={data} perform={perform} notify={notify} />} />
            <Route path="/next-order" element={<NextOrderPage context={context} data={data} activeDraft={activeDraft} perform={perform} notify={notify} />} />
            <Route path="/orders" element={<OrdersPage context={context} data={data} activeDraft={activeDraft} perform={perform} notify={notify} />} />
            <Route path="/household" element={<HouseholdPage context={context} data={data} onContextChange={onContextChange} notify={notify} />} />
            <Route path="*" element={<Navigate to="/pantry" replace />} />
          </Routes>
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Main navigation">
        <NavItem to="/pantry" icon={<Refrigerator />} label="Pantry" compact />
        <NavItem to="/next-order" icon={<ShoppingCart />} label="Next order" badge={visibleNextOrder.length || undefined} compact />
        <NavItem to="/orders" icon={<CircleDollarSign />} label="Orders" badge={activeDraft ? 1 : undefined} compact />
        <NavItem to="/household" icon={<Users />} label="Household" compact />
      </nav>

      <div className="toast-region" aria-live="polite">
        {toasts.map((toast) => <div key={toast.id} className={`toast ${toast.tone}`}>{toast.tone === "success" ? <CheckCircle2 /> : toast.tone === "error" ? <AlertTriangle /> : <Sparkles />}<span>{toast.message}</span></div>)}
      </div>
    </div>
  );
}

function PantryPage({
  householdId,
  data,
  perform,
  notify,
}: {
  householdId: string;
  data: DashboardData;
  perform: (work: () => Promise<void>, success?: string) => Promise<void>;
  notify: (message: string, tone?: Toast["tone"]) => void;
}) {
  const [filter, setFilter] = useState<"all" | "expiring" | "out">("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<InventoryItem | null | "new">(null);
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);

  const expiringCount = data.inventory.filter((item) => isExpiringSoon(item) || isExpired(item)).length;
  const outCount = data.inventory.filter((item) => item.quantity <= 0).length;
  const filtered = data.inventory.filter((item) => {
    const matchesSearch = `${item.name} ${item.category}`.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (filter === "expiring") return isExpiringSoon(item) || isExpired(item);
    if (filter === "out") return item.quantity <= 0;
    return true;
  });

  return (
    <>
      <PageHeader eyebrow="SHARED PANTRY" title="What’s at home" action={<button className="button primary" onClick={() => setEditing("new")}><Plus /> Add item</button>} />
      <section className="metric-grid" aria-label="Pantry summary">
        <MetricCard icon={<PackageCheck />} value={data.inventory.length} label="items tracked" tone="indigo" />
        <MetricCard icon={<CalendarDays />} value={expiringCount} label="need using soon" tone="saffron" />
        <MetricCard icon={<ShoppingBasket />} value={outCount} label="out of stock" tone="tomato" />
      </section>

      <section className="toolbar">
        <label className="search-box"><Search size={18} /><span className="sr-only">Search pantry</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search the pantry" /></label>
        <div className="segmented" role="group" aria-label="Filter pantry">
          <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All</button>
          <button className={filter === "expiring" ? "active" : ""} onClick={() => setFilter("expiring")}>Expiring</button>
          <button className={filter === "out" ? "active" : ""} onClick={() => setFilter("out")}>Out</button>
        </div>
      </section>

      {filtered.length ? (
        <section className="inventory-grid">
          {filtered.map((item) => (
            <InventoryCard
              key={item.id}
              item={item}
              onAdjust={(delta) => void perform(() => api.adjustInventory(item.id, delta))}
              onEdit={() => setEditing(item)}
              onDelete={() => setDeleteTarget(item)}
            />
          ))}
        </section>
      ) : (
        <EmptyState
          title={data.inventory.length ? "Nothing matches that view" : "Your shelves are ready"}
          message={data.inventory.length ? "Try another search or filter." : "Add the first item and everyone will see it here."}
          action={!data.inventory.length ? <button className="button primary" onClick={() => setEditing("new")}><Plus /> Add first item</button> : undefined}
        />
      )}

      {editing && (
        <InventoryDialog
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            await perform(() => api.saveInventory(input.householdId, input.values, input.id), input.id ? "Item updated" : "Item added");
            setEditing(null);
          }}
          householdId={householdId}
          notify={notify}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={`Remove ${deleteTarget.name}?`}
          message="This removes the pantry item. A manual Next Order entry with the same name will stay."
          confirmLabel="Remove item"
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            await perform(() => api.deleteInventory(deleteTarget.id), "Item removed");
            setDeleteTarget(null);
          }}
        />
      )}
    </>
  );
}

function InventoryCard({ item, onAdjust, onEdit, onDelete }: { item: InventoryItem; onAdjust: (delta: number) => void; onEdit: () => void; onDelete: () => void }) {
  const distance = dayDistance(item.expiry_date);
  const danger = item.quantity <= 0 || isExpired(item);
  const warning = isExpiringSoon(item);
  const expiryLabel = !item.expiry_date
    ? "No expiry"
    : distance !== null && distance < 0
      ? `Expired ${Math.abs(distance)}d ago`
      : distance === 0
        ? "Expires today"
        : distance === 1
          ? "Expires tomorrow"
          : `Expires ${formatFriendlyDate(item.expiry_date)}`;

  return (
    <article className={`inventory-card ${danger ? "danger" : warning ? "warning" : ""}`}>
      <div className="inventory-card-top">
        <div>
          <span className="category-pill">{item.category}</span>
          <h2>{item.name}</h2>
        </div>
        <div className="menu-actions">
          <button className="icon-button" aria-label={`Edit ${item.name}`} onClick={onEdit}><Edit3 /></button>
          <button className="icon-button danger-button" aria-label={`Delete ${item.name}`} onClick={onDelete}><Trash2 /></button>
        </div>
      </div>
      <div className="stock-row">
        <button className="quantity-button" aria-label={`Decrease ${item.name}`} onClick={() => onAdjust(-1)} disabled={item.quantity <= 0}><Minus /></button>
        <div className="quantity-display"><strong>{formatQuantity(item.quantity)}</strong><span>{item.unit}</span></div>
        <button className="quantity-button" aria-label={`Increase ${item.name}`} onClick={() => onAdjust(1)}><Plus /></button>
      </div>
      <div className="item-meta">
        <span className={danger ? "meta-danger" : warning ? "meta-warning" : ""}><CalendarDays /> {expiryLabel}</span>
        {item.is_recurring && <span><RotateCw /> Recurring · refill to {formatQuantity(item.default_quantity)}</span>}
      </div>
    </article>
  );
}

function InventoryDialog({
  item,
  householdId,
  onClose,
  onSave,
}: {
  item: InventoryItem | null;
  householdId: string;
  onClose: () => void;
  onSave: (input: { householdId: string; values: InventoryInput; id?: string }) => Promise<void>;
  notify: (message: string, tone?: Toast["tone"]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recurring, setRecurring] = useState(item?.is_recurring ?? false);
  const [tracksExpiry, setTracksExpiry] = useState(Boolean(item?.expiry_date ?? true));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const expiry = tracksExpiry ? String(form.get("expiry_date") ?? "") : "";
    const expiryDaysRaw = recurring ? Number(form.get("default_expiry_days") || 7) : null;
    const parsed = inventorySchema.safeParse({
      name: form.get("name"), category: form.get("category"), quantity: form.get("quantity"), unit: form.get("unit"),
      expiry_date: expiry, is_recurring: recurring, default_quantity: recurring ? form.get("default_quantity") : form.get("quantity"),
      default_expiry_days: expiryDaysRaw,
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the item details.");
    setBusy(true);
    setError(null);
    try {
      await onSave({ householdId, values: parsed.data, id: item?.id });
    } catch {
      setBusy(false);
    }
  };

  return (
    <Modal title={item ? "Edit pantry item" : "Add pantry item"} onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <label className="field span-2"><span>Item name</span><input name="name" autoFocus defaultValue={item?.name} placeholder="e.g. Full cream milk" /></label>
        <label className="field"><span>Category</span><select name="category" defaultValue={item?.category ?? "Pantry"}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
        <label className="field"><span>Unit</span><input name="unit" list="unit-options" defaultValue={item?.unit ?? "pcs"} /><datalist id="unit-options">{UNITS.map((unit) => <option key={unit} value={unit} />)}</datalist></label>
        <label className="field"><span>Current quantity</span><input name="quantity" type="number" min="0" step="0.01" defaultValue={item?.quantity ?? 1} /></label>
        <label className="toggle-field"><input type="checkbox" checked={tracksExpiry} onChange={(event) => setTracksExpiry(event.target.checked)} /><span><strong>Track expiry</strong><small>Show warnings before it goes off</small></span></label>
        {tracksExpiry && <label className="field span-2"><span>Expiry date</span><input name="expiry_date" type="date" defaultValue={item?.expiry_date ?? addDays(new Date(), 7)} /></label>}
        <label className="toggle-field span-2"><input type="checkbox" checked={recurring} onChange={(event) => setRecurring(event.target.checked)} /><span><strong>Recurring item</strong><small>Add it to Next Order when empty or expired</small></span></label>
        {recurring && (
          <>
            <label className="field"><span>Refill quantity</span><input name="default_quantity" type="number" min="0.01" step="0.01" defaultValue={item?.default_quantity ?? 1} /></label>
            <label className="field"><span>Usual shelf life</span><div className="input-suffix"><input name="default_expiry_days" type="number" min="1" defaultValue={item?.default_expiry_days ?? 7} /><span>days</span></div></label>
          </>
        )}
        {error && <p className="form-error span-2" role="alert">{error}</p>}
        <div className="dialog-actions span-2"><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? <Loader2 className="spin" /> : <Check />} Save item</button></div>
      </form>
    </Modal>
  );
}

function NextOrderPage({ context, data, activeDraft, perform, notify }: {
  context: HouseholdContext;
  data: DashboardData;
  activeDraft: Order | null;
  perform: (work: () => Promise<void>, success?: string) => Promise<void>;
  notify: (message: string, tone?: Toast["tone"]) => void;
}) {
  const navigate = useNavigate();
  const [handoff, setHandoff] = useState<Order | null>(null);
  const visible = data.nextOrder.filter((item) => !item.dismissed && !item.locked_order_id);

  const addManual = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = manualOrderSchema.safeParse({ name: form.get("name"), quantity: form.get("quantity"), unit: form.get("unit") });
    if (!parsed.success) return notify(parsed.error.issues[0]?.message ?? "Check the item.", "error");
    await perform(() => api.addManualNextOrder(context.household.id, parsed.data.name, parsed.data.quantity, parsed.data.unit), "Added to Next Order");
    event.currentTarget.reset();
  };

  const start = async () => {
    try {
      const orderId = await api.startOrder(context.household.id);
      const fresh = await api.loadData(context.household.id);
      const order = fresh.orders.find((candidate) => candidate.id === orderId);
      if (!order) throw new Error("The order draft could not be opened.");
      setHandoff(order);
    } catch (cause) {
      notify(messageOf(cause), "error");
    }
  };

  return (
    <>
      <PageHeader eyebrow="THE NEXT RUN" title="Next order" action={<button className="button primary" onClick={() => void start()} disabled={!visible.length && !activeDraft}><ShoppingCart /> {activeDraft ? "Open order" : "Start order"}</button>} />
      {activeDraft && (
        <section className="draft-banner">
          <div className="draft-icon"><Clock3 /></div>
          <div><strong>An order is in progress</strong><span>Started {relativeTime(activeDraft.started_at)} · new additions stay in the next run</span></div>
          <button className="button secondary" onClick={() => navigate("/orders")}>Review order</button>
        </section>
      )}

      <form className="quick-add" onSubmit={addManual}>
        <div className="quick-add-heading"><Plus /><div><strong>Add something</strong><span>No catalogue needed</span></div></div>
        <label className="field grow"><span className="sr-only">Item name</span><input name="name" placeholder="Item name" /></label>
        <label className="field compact-field"><span className="sr-only">Quantity</span><input name="quantity" type="number" min="0.01" step="0.01" defaultValue="1" /></label>
        <label className="field compact-field"><span className="sr-only">Unit</span><input name="unit" list="unit-options" defaultValue="pcs" /></label>
        <button className="button secondary">Add</button>
      </form>

      {visible.length ? (
        <section className="order-list">
          <div className="list-heading"><span>{visible.length} {visible.length === 1 ? "item" : "items"}</span><span>Everyone can edit this list</span></div>
          {visible.map((item) => <NextOrderRow key={item.id} item={item} perform={perform} />)}
          <div className="order-list-footer"><div><strong>Ready to shop?</strong><span>We’ll copy a clean list and open your AI assistant.</span></div><button className="button primary large" onClick={() => void start()}><Bot /> Start order</button></div>
        </section>
      ) : (
        <EmptyState title="The next order is clear" message="Manual additions and depleted recurring items will gather here." />
      )}

      {handoff && <HandoffDialog order={handoff} onClose={() => setHandoff(null)} notify={notify} />}
    </>
  );
}

function NextOrderRow({ item, perform }: { item: NextOrderItem; perform: (work: () => Promise<void>, success?: string) => Promise<void> }) {
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [unit, setUnit] = useState(item.unit);
  useEffect(() => { setQuantity(String(item.quantity)); setUnit(item.unit); }, [item.quantity, item.unit]);
  return (
    <article className="order-row">
      <div className={`source-badge ${item.source_auto ? "auto" : "manual"}`}>{item.source_auto ? <RotateCw /> : <Plus />}</div>
      <div className="order-row-name"><strong>{item.name}</strong><span>{item.source_auto && item.source_manual ? "Auto + manual" : item.source_auto ? "Added automatically" : "Added manually"}</span></div>
      <label className="inline-field"><span className="sr-only">Quantity for {item.name}</span><input type="number" min="0.01" step="0.01" value={quantity} onChange={(event) => setQuantity(event.target.value)} onBlur={() => {
        const value = Number(quantity);
        if (value > 0 && (value !== item.quantity || unit !== item.unit)) void perform(() => api.updateNextOrder(item.id, value, unit), "Order quantity updated");
      }} /></label>
      <label className="inline-field unit"><span className="sr-only">Unit for {item.name}</span><input value={unit} onChange={(event) => setUnit(event.target.value)} onBlur={() => {
        const value = Number(quantity);
        if (value > 0 && (value !== item.quantity || unit !== item.unit)) void perform(() => api.updateNextOrder(item.id, value, unit), "Order unit updated");
      }} /></label>
      <button className="icon-button danger-button" aria-label={`Remove ${item.name} from Next Order`} onClick={() => void perform(() => api.dismissNextOrder(item.id), "Removed from Next Order")}><X /></button>
    </article>
  );
}

function HandoffDialog({ order, onClose, notify }: { order: Order; onClose: () => void; notify: (message: string, tone?: Toast["tone"]) => void }) {
  const prompt = buildOrderPrompt(order.order_items);
  const open = async (provider: Provider) => {
    try {
      await navigator.clipboard.writeText(prompt);
      window.location.href = providerUrl(provider, prompt);
      notify("List copied. Paste it if the prompt does not appear.", "info");
    } catch {
      notify("Couldn’t copy automatically. Select and copy the prompt below.", "error");
    }
  };
  return (
    <Modal title="Hand off your order" onClose={onClose} wide>
      <p className="dialog-lead">We’ll copy the list first, then try to open it in a new chat. Review the cart before paying.</p>
      <div className="provider-grid">
        <button className="provider-card chatgpt" onClick={() => void open("chatgpt")}><span className="provider-icon">◎</span><span><strong>Open ChatGPT</strong><small>Experimental web prefill</small></span><ExternalLink /></button>
        <button className="provider-card claude" onClick={() => void open("claude")}><span className="provider-icon">AI</span><span><strong>Open Claude</strong><small>Experimental web prefill</small></span><ExternalLink /></button>
      </div>
      <button className="text-button" onClick={() => void open("chatgpt-desktop")}><Bot /> Open in the ChatGPT desktop app instead</button>
      <label className="prompt-preview"><span>Copied prompt</span><textarea readOnly value={prompt} onFocus={(event) => event.currentTarget.select()} /></label>
      <div className="info-callout"><Clipboard /><span>If the new chat opens empty, paste the copied list into the composer.</span></div>
    </Modal>
  );
}

function OrdersPage({ context, data, activeDraft, perform, notify }: {
  context: HouseholdContext;
  data: DashboardData;
  activeDraft: Order | null;
  perform: (work: () => Promise<void>, success?: string) => Promise<void>;
  notify: (message: string, tone?: Toast["tone"]) => void;
}) {
  const [placing, setPlacing] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const placed = data.orders.filter((order) => order.status === "placed");
  return (
    <>
      <PageHeader eyebrow="MONEY & HISTORY" title="Orders" />
      {activeDraft && (
        <section className="active-order-card">
          <div className="active-order-header">
            <div><span className="status-pill">IN PROGRESS</span><h2>Current grocery order</h2><p>{activeDraft.order_items.length} items · started {relativeTime(activeDraft.started_at)}</p></div>
            <ShoppingCart size={42} />
          </div>
          <div className="item-chip-list">{activeDraft.order_items.slice(0, 6).map((item) => <span key={item.id}>{item.name} · {formatQuantity(item.quantity)} {item.unit}</span>)}</div>
          <div className="button-row"><button className="button primary" onClick={() => setPlacing(true)}><PackageCheck /> Mark placed</button><button className="button ghost danger-text" onClick={() => setCancelTarget(activeDraft)}>Cancel order</button></div>
        </section>
      )}

      <section className="section-block">
        <div className="section-title"><div><p className="eyebrow">PAST ORDERS</p><h2>Who owes what</h2></div><span>{placed.length} recorded</span></div>
        {placed.length ? <div className="history-list">{placed.map((order) => <OrderHistoryCard key={order.id} order={order} currentMember={context.member} perform={perform} />)}</div> : <EmptyState title="No placed orders yet" message="Completed grocery runs and their expense splits will appear here." />}
      </section>

      {placing && activeDraft && <PlaceOrderDialog order={activeDraft} members={data.members} onClose={() => setPlacing(false)} onPlaced={async (input) => {
        await perform(() => api.placeOrder(input), "Order placed and pantry updated");
        setPlacing(false);
      }} notify={notify} />}
      {cancelTarget && <ConfirmDialog title="Cancel this order?" message="The snapshot will be released back to Next Order. Nothing in the pantry will change." confirmLabel="Cancel order" onClose={() => setCancelTarget(null)} onConfirm={async () => {
        await perform(() => api.cancelOrder(cancelTarget.id), "Order cancelled");
        setCancelTarget(null);
      }} />}
    </>
  );
}

type PlacementRow = PlacementItem & { key: string };

function PlaceOrderDialog({ order, members, onClose, onPlaced, notify }: {
  order: Order;
  members: Member[];
  onClose: () => void;
  onPlaced: (input: { orderId: string; totalPaise: number; participantIds: string[]; items: PlacementItem[] }) => Promise<void>;
  notify: (message: string, tone?: Toast["tone"]) => void;
}) {
  const toRow = (item: OrderItem): PlacementRow => ({
    key: item.id,
    inventory_item_id: item.inventory_item_id,
    next_order_item_id: item.next_order_item_id,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    category: item.category,
    expiry_date: item.expiry_date,
    bought: item.bought,
    source: item.source,
  });
  const [rows, setRows] = useState<PlacementRow[]>(order.order_items.map(toRow));
  const [participants, setParticipants] = useState<Set<string>>(new Set(members.map((member) => member.id)));
  const [totalRupees, setTotalRupees] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const totalPaise = Math.round(Number(totalRupees || 0) * 100);
  const splitPreview = splitPaise(totalPaise, members.filter((member) => participants.has(member.id)));

  const updateRow = (key: string, patch: Partial<PlacementRow>) => setRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row));
  const addRow = () => setRows((current) => [...current, {
    key: crypto.randomUUID(), inventory_item_id: null, next_order_item_id: null, name: "", quantity: 1,
    unit: "pcs", category: "Other", expiry_date: addDays(new Date(), 7), bought: true, source: "ad_hoc",
  }]);

  const submit = async () => {
    const payload = { totalPaise, participantIds: [...participants], items: rows.map(({ key: _key, ...row }) => row) };
    const parsed = placementSchema.safeParse(payload);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the order details.");
    if (!rows.some((row) => row.bought)) return setError("Mark at least one item as bought.");
    setBusy(true);
    setError(null);
    try {
      await onPlaced({ orderId: order.id, ...parsed.data });
    } catch (cause) {
      setError(messageOf(cause));
      setBusy(false);
    }
  };

  return (
    <Modal title="Review placed order" onClose={onClose} wide>
      <p className="dialog-lead">Confirm what came home. These quantities and expiry dates will update the pantry.</p>
      <div className="placement-list">
        <div className="placement-heading"><span>Final items</span><button className="button ghost compact-button" onClick={addRow}><Plus /> Add ad-hoc item</button></div>
        {rows.map((row) => (
          <div className={`placement-row ${!row.bought ? "skipped" : ""}`} key={row.key}>
            <label className="check-control"><input type="checkbox" checked={row.bought} onChange={(event) => updateRow(row.key, { bought: event.target.checked })} /><span>{row.bought ? "Bought" : "Skipped"}</span></label>
            <label className="field item-name"><span>Item</span><input value={row.name} onChange={(event) => updateRow(row.key, { name: event.target.value })} /></label>
            <label className="field small-input"><span>Qty</span><input type="number" min="0.01" step="0.01" value={row.quantity} onChange={(event) => updateRow(row.key, { quantity: Number(event.target.value) })} /></label>
            <label className="field small-input"><span>Unit</span><input value={row.unit} onChange={(event) => updateRow(row.key, { unit: event.target.value })} /></label>
            <label className="field category-input"><span>Category</span><select value={row.category} onChange={(event) => updateRow(row.key, { category: event.target.value })}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label className="field date-input"><span>Expiry</span><input type="date" value={row.expiry_date ?? ""} onChange={(event) => updateRow(row.key, { expiry_date: event.target.value || null })} /></label>
            {row.source === "ad_hoc" && <button className="icon-button danger-button placement-remove" aria-label={`Remove ${row.name || "new item"}`} onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}><Trash2 /></button>}
          </div>
        ))}
      </div>
      <div className="split-panel">
        <div>
          <label className="field total-field"><span>Total paid</span><div className="currency-input"><span>₹</span><input type="number" min="0" step="0.01" value={totalRupees} onChange={(event) => setTotalRupees(event.target.value)} placeholder="0.00" /></div></label>
          <p className="field-hint">Paid by the person who started this order.</p>
        </div>
        <div>
          <span className="field-label">Split between</span>
          <div className="participant-list">{members.map((member) => <label key={member.id} className="participant"><input type="checkbox" checked={participants.has(member.id)} onChange={(event) => {
            const next = new Set(participants); if (event.target.checked) next.add(member.id); else next.delete(member.id); setParticipants(next);
          }} /><Avatar name={member.name} small /><span>{member.name}</span><strong>{formatMoney(splitPreview.find((split) => split.member.id === member.id)?.amountPaise ?? 0)}</strong></label>)}</div>
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button className="button ghost" onClick={onClose}>Back</button><button className="button primary" disabled={busy || totalPaise < 0 || participants.size === 0} onClick={() => void submit()}>{busy ? <Loader2 className="spin" /> : <PackageCheck />} Confirm placed</button></div>
    </Modal>
  );
}

function OrderHistoryCard({ order, currentMember, perform }: { order: Order; currentMember: Member; perform: (work: () => Promise<void>, success?: string) => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const unsettled = order.order_splits.filter((split) => !split.settled_at);
  const complete = unsettled.length === 0;
  return (
    <article className="history-card">
      <button className="history-summary" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
        <div className={`history-icon ${complete ? "complete" : "pending"}`}>{complete ? <CheckCircle2 /> : <Clock3 />}</div>
        <div><strong>{formatOrderDate(order.placed_at)}</strong><span>{order.order_items.filter((item) => item.bought).length} items · {complete ? "all settled" : `${unsettled.length} unsettled`}</span></div>
        <strong className="history-total">{formatMoney(order.total_amount_paise)}</strong>
        <ChevronRight className={expanded ? "rotate-90" : ""} />
      </button>
      {expanded && (
        <div className="history-details">
          <div className="bought-list">{order.order_items.filter((item) => item.bought).map((item) => <span key={item.id}>{item.name} <small>{formatQuantity(item.quantity)} {item.unit}</small></span>)}</div>
          <div className="split-list">
            {order.order_splits.map((split) => (
              <div className="split-row" key={split.member_id}>
                <Avatar name={split.member?.name ?? "Member"} small />
                <div><strong>{split.member?.name ?? "Member"}{split.member_id === order.placed_by_member_id ? " · paid" : ""}</strong><span>{split.settled_at ? "Settled" : "Owes the orderer"}</span></div>
                <strong>{formatMoney(split.amount_paise)}</strong>
                {split.member_id !== order.placed_by_member_id && <button className={`settle-button ${split.settled_at ? "settled" : ""}`} onClick={() => void perform(() => api.setSplitSettled(order.id, split.member_id, !split.settled_at), split.settled_at ? "Marked unsettled" : "Marked settled")}>{split.settled_at ? <><Check /> Settled</> : "Mark settled"}</button>}
              </div>
            ))}
          </div>
          {currentMember.id === order.placed_by_member_id && !complete && <div className="outstanding-line"><span>Still to collect</span><strong>{formatMoney(unsettled.reduce((sum, split) => sum + split.amount_paise, 0))}</strong></div>}
        </div>
      )}
    </article>
  );
}

function HouseholdPage({ context, data, onContextChange, notify }: {
  context: HouseholdContext;
  data: DashboardData;
  onContextChange: (context: HouseholdContext) => void;
  notify: (message: string, tone?: Toast["tone"]) => void;
}) {
  const [token, setToken] = useState(() => loadInviteToken(context.household.id));
  const [rotating, setRotating] = useState(false);
  const inviteUrl = token ? `${window.location.origin}${window.location.pathname}#/join/${token}` : null;

  const copy = async () => {
    if (!inviteUrl) return;
    try { await navigator.clipboard.writeText(inviteUrl); notify("Invite link copied"); }
    catch { notify("Couldn’t copy the link.", "error"); }
  };

  const rotate = async () => {
    setRotating(true);
    try {
      const next = await api.rotateInvite();
      saveInviteToken(context.household.id, next);
      setToken(next);
      onContextChange(context);
      notify(token ? "Fresh invite link created. The old link no longer works." : "Invite link created");
    } catch (cause) {
      notify(messageOf(cause), "error");
    } finally { setRotating(false); }
  };

  return (
    <>
      <PageHeader eyebrow="YOUR FLATMATES" title={context.household.name} />
      <section className="household-grid">
        <div className="panel invite-panel">
          <div className="panel-icon saffron"><Share2 /></div>
          <div><p className="eyebrow">HOUSEHOLD KEY</p><h2>Invite a flatmate</h2><p className="muted">Anyone with this link can join, choose a household name, and edit shared data.</p></div>
          {inviteUrl ? <div className="invite-link"><input readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} /><button className="button primary" onClick={() => void copy()}><Copy /> Copy</button></div> : <button className="button primary" onClick={() => void rotate()} disabled={rotating}>{rotating ? <Loader2 className="spin" /> : <Share2 />} Create invite link</button>}
          {inviteUrl && <button className="text-button danger-text" onClick={() => void rotate()} disabled={rotating}><RotateCw /> Rotate link</button>}
        </div>
        <div className="panel">
          <div className="section-title compact-title"><div><p className="eyebrow">MEMBERS</p><h2>{data.members.length} flatmates</h2></div><Users /></div>
          <div className="member-grid">{data.members.map((member) => <div className="member-card" key={member.id}><Avatar name={member.name} /><div><strong>{member.name}</strong><span>{member.id === context.member.id ? "This device" : "Household member"}</span></div>{member.id === context.member.id && <span className="you-pill">YOU</span>}</div>)}</div>
        </div>
      </section>
      <section className="trust-card"><Home /><div><strong>Built on flat trust</strong><span>Everyone can edit inventory, order lists, and settlement status. There are no household admins.</span></div></section>
    </>
  );
}

function PageHeader({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return <header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>{action}</header>;
}

function MetricCard({ icon, value, label, tone }: { icon: ReactNode; value: number; label: string; tone: string }) {
  return <article className={`metric-card ${tone}`}><div className="metric-icon">{icon}</div><div><strong>{value}</strong><span>{label}</span></div></article>;
}

function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return <section className="empty-state"><img src="./grocery-tote.png" alt="A colourful grocery tote filled with pantry staples" /><div><h2>{title}</h2><p>{message}</p>{action}</div></section>;
}

function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const hue = [...name].reduce((total, char) => total + char.charCodeAt(0), 0) % 360;
  return <span className={`avatar ${small ? "small" : ""}`} style={{ "--avatar-hue": hue } as React.CSSProperties}>{initials}</span>;
}

function NavItem({ to, icon, label, badge, compact = false }: { to: string; icon: ReactNode; label: string; badge?: number; compact?: boolean }) {
  return <NavLink to={to} className={({ isActive }) => `${compact ? "bottom-nav-item" : "nav-item"} ${isActive ? "active" : ""}`}>{icon}<span>{label}</span>{badge ? <small className="nav-badge">{badge}</small> : null}</NavLink>;
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X /></button></header><div className="modal-body">{children}</div></section></div>;
}

function ConfirmDialog({ title, message, confirmLabel, onClose, onConfirm }: { title: string; message: string; confirmLabel: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return <Modal title={title} onClose={onClose}><p className="dialog-lead">{message}</p><div className="dialog-actions"><button className="button ghost" onClick={onClose}>Keep it</button><button className="button destructive" disabled={busy} onClick={() => { setBusy(true); void onConfirm().finally(() => setBusy(false)); }}>{busy ? <Loader2 className="spin" /> : <Trash2 />}{confirmLabel}</button></div></Modal>;
}

const messageOf = (cause: unknown) => cause instanceof Error ? cause.message : "Something went wrong. Please try again.";
const saveInviteToken = (householdId: string, token: string) => localStorage.setItem(`pantryhouse.invite.${householdId}`, token);
const loadInviteToken = (householdId: string) => localStorage.getItem(`pantryhouse.invite.${householdId}`);
const relativeTime = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return formatOrderDate(iso);
};
const formatOrderDate = (iso: string | null) => iso ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : "Not placed";
