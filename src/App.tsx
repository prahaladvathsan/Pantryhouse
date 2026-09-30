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
  FileInput,
  GripVertical,
  Home,
  House,
  Loader2,
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
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Utensils,
  Users,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
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
  normaliseName,
  splitPaise,
} from "./lib/domain";
import { buildOrderPrompt, pantryhouseConnectorUrl, parseOrderResult, providerUrl, type Provider } from "./lib/providers";
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
  ProductFeedback,
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
      <div className="main-column">
        <header className="app-header">
          <div className="brand"><span className="brand-mark"><ShoppingBasket /></span><span>Pantryhouse</span></div>
          <div className="app-identity">
            <div><strong>{context.member.name}</strong><span>{context.household.name}</span></div>
            <Avatar name={context.member.name} small />
          </div>
        </header>
        <nav className="top-nav" aria-label="Main navigation">
          <NavItem to="/pantry" icon={<Refrigerator />} label="Pantry" compact />
          <NavItem to="/next-order" icon={<ShoppingCart />} label="Next order" badge={visibleNextOrder.length || undefined} compact />
          <NavItem to="/orders" icon={<CircleDollarSign />} label="Orders" badge={activeDraft ? 1 : undefined} compact />
          <NavItem to="/household" icon={<Users />} label="Household" compact />
        </nav>
        {api.isDemo && (
          <div className="demo-banner"><Sparkles size={16} /><span>Demo data is active. Connect Supabase to share this household.</span></div>
        )}
        {loadError && (
          <div className="error-banner"><AlertTriangle size={18} /><span>{loadError}</span><button onClick={() => void refresh()}>Retry</button></div>
        )}
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
  const shelves = Object.entries(
    filtered.reduce<Record<string, InventoryItem[]>>((groups, item) => {
      (groups[item.category] ??= []).push(item);
      return groups;
    }, {}),
  ).sort(([left], [right]) => {
    const leftIndex = CATEGORIES.indexOf(left);
    const rightIndex = CATEGORIES.indexOf(right);
    if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });

  return (
    <>
      <div className="pantry-filters" role="group" aria-label="Filter pantry">
        <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All <span>({data.inventory.length})</span></button>
        <button className={filter === "expiring" ? "active" : ""} onClick={() => setFilter("expiring")}>Expiring <span>({expiringCount})</span></button>
        <button className={filter === "out" ? "active" : ""} onClick={() => setFilter("out")}>Out <span>({outCount})</span></button>
      </div>
      <section className="pantry-toolbar">
        <label className="search-box"><Search size={18} /><span className="sr-only">Search pantry</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search the pantry" /></label>
        <button className="button primary" onClick={() => setEditing("new")}><Plus /> Add item</button>
      </section>

      {filtered.length ? (
        <>
          <section className="pantry-shelves">
            {shelves.map(([category, items]) => (
              <section className="pantry-shelf" key={category}>
                <header className="shelf-header"><h2>{category}</h2><span>{items.length} {items.length === 1 ? "item" : "items"}</span></header>
                <div className="shelf-items">
                  {items.map((item) => (
                    <InventoryCard
                      key={item.id}
                      item={item}
                      onAdjust={(delta) => void perform(() => api.adjustInventory(item.id, delta))}
                      onEdit={() => setEditing(item)}
                      onDelete={() => setDeleteTarget(item)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </section>
          <footer className="pantry-gesture-guide">
            <span><Utensils /> Hold and drag any item to consume one</span>
            <span><Plus /> Double-tap any item to add one</span>
          </footer>
        </>
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
          title={`Stop tracking ${deleteTarget.name}?`}
          message="This removes the item from your pantry; it does not mark it as consumed. A manual Next Order entry with the same name will stay."
          confirmLabel="Stop tracking"
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            await perform(() => api.deleteInventory(deleteTarget.id), "Stopped tracking item");
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number; overTarget: boolean } | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragging = useRef(false);
  const lastTapAt = useRef(0);
  const touchIdentifier = useRef<number | null>(null);
  const consumeTarget = useRef<HTMLDivElement | null>(null);
  const expiryLabel = !item.expiry_date
    ? "No expiry"
    : distance !== null && distance < 0
      ? `Expired ${Math.abs(distance)}d ago`
      : distance === 0
        ? "Expires today"
        : distance === 1
          ? "Expires tomorrow"
          : `Expires ${formatFriendlyDate(item.expiry_date)}`;

  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  useEffect(() => () => {
    clearHold();
    document.body.classList.remove("dragging-pantry-item");
  }, []);

  const overConsumeTarget = (x: number, y: number) => {
    const bounds = consumeTarget.current?.getBoundingClientRect();
    return Boolean(bounds && x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom);
  };

  const isNestedControl = (target: EventTarget) => target instanceof Element && Boolean(target.closest("button, input, select, textarea, a"));

  const startGesture = (event: ReactPointerEvent<HTMLElement>) => {
    if (!event.isPrimary || event.pointerType === "touch" || isNestedControl(event.target)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (item.quantity > 0) {
      holdTimer.current = setTimeout(() => {
        dragging.current = true;
        setDrag({ x: event.clientX, y: event.clientY, overTarget: false });
        navigator.vibrate?.(18);
      }, 360);
    }
  };

  const moveGesture = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    if (!dragging.current) return;
    event.preventDefault();
    setDrag({ x: event.clientX, y: event.clientY, overTarget: overConsumeTarget(event.clientX, event.clientY) });
  };

  const finishGesture = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    if (isNestedControl(event.target)) return;
    clearHold();
    if (dragging.current) {
      if (overConsumeTarget(event.clientX, event.clientY)) {
        onAdjust(-1);
        navigator.vibrate?.([16, 32, 16]);
      }
      dragging.current = false;
      setDrag(null);
      return;
    }
    const now = Date.now();
    if (now - lastTapAt.current < 340) {
      onAdjust(1);
      lastTapAt.current = 0;
    } else {
      lastTapAt.current = now;
    }
  };

  const startTouchGesture = (event: ReactTouchEvent<HTMLElement>) => {
    if (isNestedControl(event.target)) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    touchIdentifier.current = touch.identifier;
    if (item.quantity > 0) {
      holdTimer.current = setTimeout(() => {
        dragging.current = true;
        document.body.classList.add("dragging-pantry-item");
        setDrag({ x: touch.clientX, y: touch.clientY, overTarget: false });
        navigator.vibrate?.(18);
      }, 360);
    }
  };

  const moveTouchGesture = (event: ReactTouchEvent<HTMLElement>) => {
    if (!dragging.current) return;
    event.preventDefault();
    const touch = Array.from(event.changedTouches).find((candidate) => candidate.identifier === touchIdentifier.current) ?? event.changedTouches[0];
    if (!touch) return;
    setDrag({ x: touch.clientX, y: touch.clientY, overTarget: overConsumeTarget(touch.clientX, touch.clientY) });
  };

  const finishTouchGesture = (event: ReactTouchEvent<HTMLElement>) => {
    if (isNestedControl(event.target)) return;
    clearHold();
    const touch = Array.from(event.changedTouches).find((candidate) => candidate.identifier === touchIdentifier.current) ?? event.changedTouches[0];
    if (dragging.current) {
      if (touch && overConsumeTarget(touch.clientX, touch.clientY)) {
        onAdjust(-1);
        navigator.vibrate?.([16, 32, 16]);
      }
      dragging.current = false;
      setDrag(null);
      document.body.classList.remove("dragging-pantry-item");
      touchIdentifier.current = null;
      return;
    }
    const now = Date.now();
    if (now - lastTapAt.current < 340) {
      onAdjust(1);
      lastTapAt.current = 0;
    } else {
      lastTapAt.current = now;
    }
    touchIdentifier.current = null;
  };

  return (
    <article
      className={`inventory-card ${danger ? "danger" : warning ? "warning" : ""}`}
      tabIndex={0}
      aria-label={`${item.name}, ${formatQuantity(item.quantity)} ${item.unit}. Double tap to add one. Hold and drag to consume one. Keyboard: up to add, down to consume.`}
      onPointerDown={startGesture}
      onPointerMove={moveGesture}
      onPointerUp={finishGesture}
      onPointerCancel={(event) => { if (event.pointerType !== "touch") { clearHold(); dragging.current = false; setDrag(null); } }}
      onTouchStart={startTouchGesture}
      onTouchMove={moveTouchGesture}
      onTouchEnd={finishTouchGesture}
      onTouchCancel={() => { clearHold(); dragging.current = false; touchIdentifier.current = null; setDrag(null); document.body.classList.remove("dragging-pantry-item"); }}
      onContextMenu={(event) => { if (!isNestedControl(event.target)) event.preventDefault(); }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") { event.preventDefault(); onAdjust(1); }
        if (event.key === "ArrowDown" && item.quantity > 0) { event.preventDefault(); onAdjust(-1); }
      }}
    >
      <div className="inventory-card-top">
        <div>
          <h2>{item.name}</h2>
        </div>
        <div className="item-menu">
          <button className="icon-button" aria-label={`Item settings for ${item.name}`} aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}><MoreHorizontal /></button>
          {menuOpen && <div className="item-menu-popover">
            <button onClick={() => { setMenuOpen(false); onEdit(); }}><Edit3 /> Edit details</button>
            <button className="danger-text" onClick={() => { setMenuOpen(false); onDelete(); }}><Trash2 /> Stop tracking</button>
          </div>}
        </div>
      </div>
      <div className="stock-reading"><GripVertical aria-hidden="true" /><span className="quantity-display"><strong>{formatQuantity(item.quantity)}</strong><span>{item.unit}</span></span></div>
      <div className="item-meta">
        <span className={danger ? "meta-danger" : warning ? "meta-warning" : ""}><CalendarDays /> {expiryLabel}</span>
        {item.is_recurring && <span><RotateCw /> Recurring · refill to {formatQuantity(item.default_quantity)}</span>}
      </div>
      {drag && createPortal(<div className="consume-layer" aria-hidden="true">
        <div className="dragged-item" style={{ left: drag.x, top: drag.y }}><strong>{item.name}</strong><span>1 {item.unit}</span></div>
        <div ref={consumeTarget} className={`consume-target ${drag.overTarget ? "ready" : ""}`}><Utensils /><div><strong>{drag.overTarget ? "Release to consume" : "Drag here to consume"}</strong><span>Uses 1 {item.unit}</span></div></div>
      </div>, document.body)}
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
    <Modal title={item ? "Edit item details" : "Add pantry item"} onClose={onClose}>
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
      <PageHeader title="Ready to order?" action={<button className="button primary" onClick={() => void start()} disabled={!visible.length && !activeDraft}><ShoppingCart /> {activeDraft ? "Open order" : "Start order"}</button>} />
      {activeDraft && (
        <section className="draft-banner">
          <div className="draft-icon">{activeDraft.assistant_capture_received_at ? <Sparkles /> : <Clock3 />}</div>
          <div><strong>{activeDraft.assistant_capture_received_at ? "Claude’s products are ready" : "An order is in progress"}</strong><span>{activeDraft.assistant_capture_received_at ? `${activeDraft.order_items.filter((item) => item.bought && item.product_name).length} exact products received · review before confirming` : `Started ${relativeTime(activeDraft.started_at)} · new additions stay in the next run`}</span></div>
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

      {handoff && <HandoffDialog order={handoff} history={data.orders.filter((order) => order.status === "placed").flatMap((order) => order.order_items)} onClose={() => setHandoff(null)} notify={notify} />}
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

function HandoffDialog({ order, history, onClose, notify }: { order: Order; history: OrderItem[]; onClose: () => void; notify: (message: string, tone?: Toast["tone"]) => void }) {
  const fallbackPrompt = buildOrderPrompt(order.order_items, history);
  const [prompt, setPrompt] = useState(fallbackPrompt);
  const [opening, setOpening] = useState<Provider | null>(null);
  const open = async (provider: Provider) => {
    setOpening(provider);
    try {
      const nextPrompt = provider === "claude" && !api.isDemo
        ? buildOrderPrompt(order.order_items, history, await api.createOrderHandoff(order.id))
        : fallbackPrompt;
      setPrompt(nextPrompt);
      try {
        await navigator.clipboard.writeText(nextPrompt);
        notify(provider === "claude" && !api.isDemo ? "Secure return enabled for this order." : "List copied. Paste it if the prompt does not appear.", "info");
      } catch {
        notify("Couldn’t copy automatically. Select and copy the prompt below.", "error");
      }
      window.location.href = providerUrl(provider, nextPrompt);
    } catch (cause) {
      notify(messageOf(cause), "error");
      setOpening(null);
    }
  };
  const copyConnectorUrl = async () => {
    if (!pantryhouseConnectorUrl) return;
    try {
      await navigator.clipboard.writeText(pantryhouseConnectorUrl);
      notify("Connector URL copied");
    } catch {
      notify("Couldn’t copy the connector URL.", "error");
    }
  };
  return (
    <Modal title="Hand off your order" onClose={onClose} wide>
      <p className="dialog-lead">Claude can send the exact cart back to this draft automatically. You will still review it before Pantryhouse records the order.</p>
      {pantryhouseConnectorUrl && <section className="connector-setup">
        <div><Sparkles /><span><strong>One-time Claude setup</strong><small>In Claude, open Settings → Connectors → Add custom connector, paste this URL, and enable Pantryhouse in the shopping chat.</small></span></div>
        <div className="connector-url"><input readOnly value={pantryhouseConnectorUrl} onFocus={(event) => event.currentTarget.select()} /><button className="button secondary compact-button" onClick={() => void copyConnectorUrl()}><Copy /> Copy URL</button></div>
      </section>}
      <div className="provider-grid">
        <button className="provider-card chatgpt" disabled={opening !== null} onClick={() => void open("chatgpt")}><span className="provider-icon">◎</span><span><strong>Open ChatGPT</strong><small>Copy-and-import fallback</small></span>{opening === "chatgpt" ? <Loader2 className="spin" /> : <ExternalLink />}</button>
        <button className="provider-card claude" disabled={opening !== null} onClick={() => void open("claude")}><span className="provider-icon">AI</span><span><strong>Open Claude</strong><small>{api.isDemo ? "Copy-and-import demo" : "Direct, secure return"}</small></span>{opening === "claude" ? <Loader2 className="spin" /> : <ExternalLink />}</button>
      </div>
      <button className="text-button" disabled={opening !== null} onClick={() => void open("chatgpt-desktop")}><Bot /> Open in the ChatGPT desktop app instead</button>
      <label className="prompt-preview"><span>Copied prompt</span><textarea readOnly value={prompt} onFocus={(event) => event.currentTarget.select()} /></label>
      <div className="info-callout"><Clipboard /><span>The order code expires after two hours and can update only this draft. If the connector is unavailable, Claude will provide the existing pasteable fallback.</span></div>
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
  const exactProducts = placed.flatMap((order) => order.order_items).filter((item) => item.bought && item.product_name);
  const capturedProducts = activeDraft?.order_items.filter((item) => item.bought && item.product_name).length ?? 0;
  return (
    <>
      <PageHeader title="Past orders (and splits)" />
      {activeDraft && (
        <section className={`active-order-card ${activeDraft.assistant_capture_received_at ? "capture-ready" : ""}`}>
          <div className="active-order-header">
            <div><span className="status-pill">{activeDraft.assistant_capture_received_at ? "READY TO REVIEW" : "IN PROGRESS"}</span><h2>{activeDraft.assistant_capture_received_at ? "Claude sent the exact products" : "Current grocery order"}</h2><p>{activeDraft.assistant_capture_received_at ? `${capturedProducts} products received ${relativeTime(activeDraft.assistant_capture_received_at)}` : `${activeDraft.order_items.length} items · started ${relativeTime(activeDraft.started_at)}`}</p></div>
            {activeDraft.assistant_capture_received_at ? <Sparkles size={42} /> : <ShoppingCart size={42} />}
          </div>
          <div className="item-chip-list">{activeDraft.order_items.filter((item) => item.bought).slice(0, 6).map((item) => <span key={item.id}>{item.product_name || item.name} · {formatQuantity(item.quantity)} {item.unit}</span>)}</div>
          <div className="button-row"><button className="button primary" onClick={() => setPlacing(true)}>{activeDraft.assistant_capture_received_at ? <Sparkles /> : <PackageCheck />} {activeDraft.assistant_capture_received_at ? "Review products" : "Mark placed"}</button><button className="button ghost danger-text" onClick={() => setCancelTarget(activeDraft)}>Cancel order</button></div>
        </section>
      )}

      {exactProducts.length > 0 && <ProductMemory items={exactProducts} perform={perform} />}

      <section className="section-block">
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

function ProductMemory({ items, perform }: { items: OrderItem[]; perform: (work: () => Promise<void>, success?: string) => Promise<void> }) {
  const groups = items.reduce<Map<string, { name: string; variants: Map<string, { item: OrderItem; purchases: number; feedback: ProductFeedback }> }>>((memory, item) => {
    const group = memory.get(item.name_key) ?? { name: item.name, variants: new Map() };
    const variantKey = [item.brand, item.product_name, item.package_size].map((value) => normaliseName(value ?? "")).join("|");
    const variant = group.variants.get(variantKey);
    if (variant) {
      variant.purchases += 1;
      if (variant.feedback === 0 && item.feedback !== 0) variant.feedback = item.feedback;
    } else {
      group.variants.set(variantKey, { item, purchases: 1, feedback: item.feedback });
    }
    memory.set(item.name_key, group);
    return memory;
  }, new Map());

  return <section className="section-block product-memory">
    <div className="section-title"><div><p className="eyebrow">PRODUCT MEMORY</p><h2>What this house likes</h2></div><span>{groups.size} item {groups.size === 1 ? "type" : "types"}</span></div>
    <div className="preference-board">{Array.from(groups.entries()).map(([key, group]) => <section className="preference-group" key={key}>
      <header><strong>{group.name}</strong><span>{group.variants.size} tried</span></header>
      {Array.from(group.variants.values()).map((variant) => <div className="preference-variant" key={variant.item.id}>
        <div><strong>{variant.item.product_name}</strong><span>{[variant.item.brand, variant.item.package_size, variant.purchases > 1 ? `${variant.purchases} orders` : "1 order"].filter(Boolean).join(" · ")}</span></div>
        {variant.item.unit_price_paise !== null && <strong>{formatMoney(variant.item.unit_price_paise)}</strong>}
        <ProductFeedbackButtons item={{ ...variant.item, feedback: variant.feedback }} perform={perform} />
      </div>)}
    </section>)}</div>
  </section>;
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
    product_name: item.product_name,
    brand: item.brand,
    package_size: item.package_size,
    unit_price_paise: item.unit_price_paise,
    line_total_paise: item.line_total_paise,
    bought: item.bought,
    source: item.source,
  });
  const [rows, setRows] = useState<PlacementRow[]>(order.order_items.map(toRow));
  const [participants, setParticipants] = useState<Set<string>>(new Set(members.map((member) => member.id)));
  const [totalRupees, setTotalRupees] = useState(order.assistant_capture_total_amount_paise === null ? "" : (order.assistant_capture_total_amount_paise / 100).toFixed(2));
  const [importText, setImportText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const totalPaise = Math.round(Number(totalRupees || 0) * 100);
  const splitPreview = splitPaise(totalPaise, members.filter((member) => participants.has(member.id)));

  const updateRow = (key: string, patch: Partial<PlacementRow>) => setRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row));
  const addRow = () => setRows((current) => [...current, {
    key: crypto.randomUUID(), inventory_item_id: null, next_order_item_id: null, name: "", quantity: 1,
    unit: "pcs", category: "Other", expiry_date: addDays(new Date(), 7), product_name: null, brand: null,
    package_size: null, unit_price_paise: null, line_total_paise: null, bought: true, source: "ad_hoc",
  }]);

  const importAssistantResult = () => {
    try {
      const products = parseOrderResult(importText);
      const usedKeys = new Set<string>();
      setRows((current) => {
        const next = current.map((row) => {
          const matchIndex = products.findIndex((product, index) => !usedKeys.has(String(index)) && normaliseName(product.requestedName) === normaliseName(row.name));
          if (matchIndex < 0) return row;
          usedKeys.add(String(matchIndex));
          const product = products[matchIndex];
          return {
            ...row,
            product_name: product.productName,
            brand: product.brand,
            package_size: product.packageSize,
            quantity: product.quantity,
            unit: product.unit,
            unit_price_paise: product.unitPrice === null ? null : Math.round(product.unitPrice * 100),
            line_total_paise: product.lineTotal === null ? null : Math.round(product.lineTotal * 100),
            bought: true,
          };
        });
        const unmatched = products.filter((_product, index) => !usedKeys.has(String(index))).map((product) => ({
          key: crypto.randomUUID(), inventory_item_id: null, next_order_item_id: null, name: product.requestedName,
          quantity: product.quantity, unit: product.unit, category: "Other", expiry_date: addDays(new Date(), 7),
          product_name: product.productName, brand: product.brand, package_size: product.packageSize,
          unit_price_paise: product.unitPrice === null ? null : Math.round(product.unitPrice * 100),
          line_total_paise: product.lineTotal === null ? null : Math.round(product.lineTotal * 100),
          bought: true, source: "ad_hoc" as const,
        }));
        return [...next, ...unmatched];
      });
      const resultTotal = products.reduce((sum, product) => sum + (product.lineTotal ?? (product.unitPrice === null ? 0 : product.unitPrice * product.quantity)), 0);
      if (resultTotal > 0) setTotalRupees(resultTotal.toFixed(2));
      setError(null);
      notify(`${products.length} exact ${products.length === 1 ? "product" : "products"} imported`, "success");
    } catch (cause) {
      setError(messageOf(cause));
    }
  };

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
      <p className="dialog-lead">Confirm what came home. Pantry item names drive stock; exact products, brands, sizes, and prices build your household’s preferences.</p>
      {order.assistant_capture_received_at && <div className="capture-callout"><Sparkles /><span><strong>Received directly from Claude</strong><small>Check the products and prices below. Nothing enters pantry history until you confirm.</small></span></div>}
      <details className="assistant-import">
        <summary><FileInput /> Import the assistant’s exact products</summary>
        <p>Paste the <strong>PANTRYHOUSE_ORDER_RESULT</strong> block from ChatGPT or Claude. You can also fill the product fields below by hand.</p>
        <textarea value={importText} onChange={(event) => setImportText(event.target.value)} placeholder='[{"requestedName":"milk","productName":"Amul Taaza Toned Milk","brand":"Amul",...}]' />
        <button className="button secondary" disabled={!importText.trim()} onClick={importAssistantResult}><FileInput /> Import products</button>
      </details>
      <div className="placement-list">
        <div className="placement-heading"><span>Final items</span><button className="button ghost compact-button" onClick={addRow}><Plus /> Add ad-hoc item</button></div>
        {rows.map((row) => (
          <article className={`placement-row ${!row.bought ? "skipped" : ""}`} key={row.key}>
            <header className="placement-row-header">
              <label className="check-control"><input type="checkbox" checked={row.bought} onChange={(event) => updateRow(row.key, { bought: event.target.checked })} /><span>{row.bought ? "Bought" : "Skipped"}</span></label>
              <strong>{row.product_name || row.name || "New item"}</strong>
              {row.source === "ad_hoc" && <button className="icon-button danger-button placement-remove" aria-label={`Remove ${row.name || "new item"}`} onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}><Trash2 /></button>}
            </header>
            <div className="placement-fields">
              <label className="field pantry-name"><span>Pantry item type</span><input value={row.name} onChange={(event) => updateRow(row.key, { name: event.target.value })} placeholder="Milk" /></label>
              <label className="field product-name"><span>Exact product</span><input value={row.product_name ?? ""} onChange={(event) => updateRow(row.key, { product_name: event.target.value || null })} placeholder="Amul Taaza Toned Milk" /></label>
              <label className="field brand-input"><span>Brand</span><input value={row.brand ?? ""} onChange={(event) => updateRow(row.key, { brand: event.target.value || null })} placeholder="Amul" /></label>
              <label className="field pack-input"><span>Pack size</span><input value={row.package_size ?? ""} onChange={(event) => updateRow(row.key, { package_size: event.target.value || null })} placeholder="1 L" /></label>
              <label className="field quantity-input"><span>Qty</span><input type="number" min="0.01" step="0.01" value={row.quantity} onChange={(event) => {
                const quantity = Number(event.target.value);
                updateRow(row.key, { quantity, line_total_paise: row.unit_price_paise === null ? row.line_total_paise : Math.round(row.unit_price_paise * quantity) });
              }} /></label>
              <label className="field unit-input"><span>Unit</span><input value={row.unit} onChange={(event) => updateRow(row.key, { unit: event.target.value })} /></label>
              <label className="field price-input"><span>Unit price</span><div className="currency-input"><span>₹</span><input type="number" min="0" step="0.01" value={row.unit_price_paise === null ? "" : (row.unit_price_paise / 100).toFixed(2)} onChange={(event) => {
                const value = event.target.value === "" ? null : Math.round(Number(event.target.value) * 100);
                updateRow(row.key, { unit_price_paise: value, line_total_paise: value === null ? null : Math.round(value * row.quantity) });
              }} /></div></label>
              <label className="field category-input"><span>Category</span><select value={row.category} onChange={(event) => updateRow(row.key, { category: event.target.value })}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
              <label className="field date-input"><span>Expiry</span><input type="date" value={row.expiry_date ?? ""} onChange={(event) => updateRow(row.key, { expiry_date: event.target.value || null })} /></label>
            </div>
          </article>
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
          <div className="product-history-list">{order.order_items.filter((item) => item.bought).map((item) => <div className="product-history-item" key={item.id}>
            <div><strong>{item.product_name || item.name}</strong><span>{[item.brand, item.package_size, `${formatQuantity(item.quantity)} ${item.unit}`, item.product_name ? `tagged ${item.name}` : null].filter(Boolean).join(" · ")}</span></div>
            {item.line_total_paise !== null || item.unit_price_paise !== null ? <strong>{formatMoney(item.line_total_paise ?? item.unit_price_paise)}</strong> : <span className="price-missing">No price</span>}
            <ProductFeedbackButtons item={item} perform={perform} />
          </div>)}</div>
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

function ProductFeedbackButtons({ item, perform }: { item: OrderItem; perform: (work: () => Promise<void>, success?: string) => Promise<void> }) {
  return <div className="product-feedback" role="group" aria-label={`Rate ${item.product_name || item.name}`}>
    <button className={item.feedback === 1 ? "active positive" : ""} aria-pressed={item.feedback === 1} aria-label={`Like ${item.product_name || item.name}`} onClick={() => void perform(() => api.rateOrderItem(item.id, (item.feedback === 1 ? 0 : 1) as ProductFeedback), item.feedback === 1 ? "Product rating cleared" : "We’ll prefer this product next time")}><ThumbsUp /></button>
    <button className={item.feedback === -1 ? "active negative" : ""} aria-pressed={item.feedback === -1} aria-label={`Dislike ${item.product_name || item.name}`} onClick={() => void perform(() => api.rateOrderItem(item.id, (item.feedback === -1 ? 0 : -1) as ProductFeedback), item.feedback === -1 ? "Product rating cleared" : "We’ll avoid this product next time")}><ThumbsDown /></button>
  </div>;
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

function PageHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return <header className="page-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1></div>{action}</header>;
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
  return <NavLink to={to} className={({ isActive }) => `${compact ? "top-nav-item" : "nav-item"} ${isActive ? "active" : ""}`}>{icon}<span>{label}</span>{badge ? <small className="nav-badge">{badge}</small> : null}</NavLink>;
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const [viewport, setViewport] = useState(() => ({
    height: window.visualViewport?.height ?? window.innerHeight,
    offsetTop: window.visualViewport?.offsetTop ?? 0,
  }));
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const syncViewport = () => setViewport({
      height: window.visualViewport?.height ?? window.innerHeight,
      offsetTop: window.visualViewport?.offsetTop ?? 0,
    });
    window.addEventListener("keydown", close);
    window.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("scroll", syncViewport);
    document.body.classList.add("modal-open");
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("scroll", syncViewport);
      document.body.classList.remove("modal-open");
    };
  }, [onClose]);
  return createPortal(
    <div
      className="modal-backdrop"
      style={{ "--modal-viewport-height": `${viewport.height}px`, "--modal-viewport-offset": `${viewport.offsetTop}px` } as React.CSSProperties}
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X /></button></header>
        <div className="modal-body" onFocusCapture={(event) => {
          const target = event.target as HTMLElement;
          window.setTimeout(() => target.scrollIntoView({ block: "nearest", behavior: "smooth" }), 120);
        }}>{children}</div>
      </section>
    </div>,
    document.body,
  );
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
