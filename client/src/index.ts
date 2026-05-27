import { BkperAuth } from '@bkper/web-auth';
import { Account, AccountType, Bkper, Book, Group, Transaction } from 'bkper-js';

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type TopTabId = 'registration' | 'ap' | 'ar';
type RegTabId = 'vendor' | 'customer' | 'port' | 'voyage';

interface TopTab {
    id: TopTabId;
    label: string;
}

const TOP_TABS: TopTab[] = [
    { id: 'registration', label: 'Registration' },
    { id: 'ap', label: 'Accounts Payable' },
    { id: 'ar', label: 'Accounts Receivable' },
];

interface AccountTabConfig {
    id: RegTabId;
    kind: 'account';
    label: string;
    entityLabel: string;
    accountType: AccountType;
    groupName: string;
}

interface CatalogTabConfig {
    id: RegTabId;
    kind: 'catalog';
    label: string;
    entityLabel: string;
    propertyKey: string;
}

interface VoyageTabConfig {
    id: RegTabId;
    kind: 'voyage';
    label: string;
    entityLabel: string;
    propertyKey: string;
}

type RegTabConfig = AccountTabConfig | CatalogTabConfig | VoyageTabConfig;

const PORTS_PROPERTY_KEY = 'ports';
const VOYAGES_PROPERTY_KEY = 'voyages';

const REG_TABS: RegTabConfig[] = [
    {
        id: 'vendor',
        kind: 'account',
        label: 'Vendor',
        entityLabel: 'vendor',
        accountType: AccountType.LIABILITY,
        groupName: 'Vendors',
    },
    {
        id: 'customer',
        kind: 'account',
        label: 'Customer',
        entityLabel: 'customer',
        accountType: AccountType.ASSET,
        groupName: 'Customers',
    },
    {
        id: 'port',
        kind: 'catalog',
        label: 'Port',
        entityLabel: 'port',
        propertyKey: PORTS_PROPERTY_KEY,
    },
    {
        id: 'voyage',
        kind: 'voyage',
        label: 'Voyage',
        entityLabel: 'voyage',
        propertyKey: VOYAGES_PROPERTY_KEY,
    },
];

// Pattern for expense category groups in SEACAPE: `001 HIRE`, `002 BUNKERS`, ...
const EXPENSE_GROUP_PATTERN = /^00[1-9]\s/;

const PORT_COUNTRIES: string[] = [
    'Argentina', 'Australia', 'Bahamas', 'Bangladesh', 'Belgium', 'Brazil', 'Canada',
    'Chile', 'China', 'Colombia', 'Cyprus', 'Denmark', 'Ecuador', 'Egypt', 'France',
    'Germany', 'Greece', 'Hong Kong', 'India', 'Indonesia', 'Italy', 'Japan',
    'Liberia', 'Malaysia', 'Malta', 'Marshall Islands', 'Mexico', 'Netherlands',
    'Nigeria', 'Norway', 'Panama', 'Peru', 'Philippines', 'Poland', 'Portugal',
    'Russia', 'Saudi Arabia', 'Singapore', 'South Africa', 'South Korea', 'Spain',
    'Sweden', 'Taiwan', 'Thailand', 'Turkey', 'Ukraine', 'United Arab Emirates',
    'United Kingdom', 'United States', 'Uruguay', 'Venezuela', 'Vietnam',
];

interface PortRecord {
    name: string;
    country: string;
}

interface VoyageRecord {
    vessel: string;
    cp: string;
    hashtag: string;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const isLocalDev =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

const params = new URLSearchParams(window.location.search);
const bookId = params.get('bookId');

const auth = new BkperAuth({
    baseUrl: isLocalDev ? window.location.origin : undefined,
    onLoginSuccess: () => start(),
    onLoginRequired: () => showLogin(),
    onError: (error: Error) => showError(`Auth error: ${error.message}`),
});

void auth.init();

let bkper: Bkper | null = null;
let book: Book | null = null;
const groupsByTab = new Map<RegTabId, Group>();
let allAccounts: Account[] = [];
let vendorAccounts: Account[] = [];
let expenseAccounts: Account[] = [];

let activeTopTab: TopTabId = 'registration';
let activeRegTab: RegTabId = 'vendor';

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function start() {
    if (!bookId) {
        showError('Missing bookId in URL. Open this app from a Bkper book menu.');
        return;
    }

    showLoading('Loading book...');

    try {
        bkper = new Bkper({
            oauthTokenProvider: async () => auth.getAccessToken(),
        });
        book = await bkper.getBook(bookId);
        await loadBookData(book);
        showShell();
    } catch (err) {
        showError(err instanceof Error ? err.message : String(err));
    }
}

async function loadBookData(targetBook: Book): Promise<void> {
    const groups = await targetBook.getGroups();

    const missing: string[] = [];
    for (const tab of REG_TABS) {
        if (tab.kind !== 'account') continue;
        const group = groups.find(g => g.getName() === tab.groupName);
        if (!group) {
            missing.push(tab.groupName);
        } else {
            groupsByTab.set(tab.id, group);
        }
    }
    if (missing.length > 0) {
        throw new Error(
            `This book is missing required groups: ${missing.join(', ')}. Create them first.`,
        );
    }

    const expenseGroupIds = new Set<string>();
    for (const group of groups) {
        if (group.getName() && EXPENSE_GROUP_PATTERN.test(group.getName() as string)) {
            for (const id of group.getDescendantTreeIds()) {
                expenseGroupIds.add(id);
            }
        }
    }

    allAccounts = await targetBook.getAccounts();

    const vendorsGroup = groupsByTab.get('vendor');
    const vendorsGroupId = vendorsGroup?.getId();

    vendorAccounts = [];
    expenseAccounts = [];

    for (const account of allAccounts) {
        const groupsOfAccount = await account.getGroups();
        const groupIds = groupsOfAccount.map(g => g.getId()).filter((id): id is string => !!id);

        if (vendorsGroupId && groupIds.includes(vendorsGroupId)) {
            vendorAccounts.push(account);
        }
        if (groupIds.some(id => expenseGroupIds.has(id))) {
            expenseAccounts.push(account);
        }
    }

    sortAccountsByName(vendorAccounts);
    sortAccountsByName(expenseAccounts);
}

function sortAccountsByName(accounts: Account[]): void {
    accounts.sort((a, b) => (a.getName() ?? '').localeCompare(b.getName() ?? ''));
}

// ---------------------------------------------------------------------------
// Top-level shell
// ---------------------------------------------------------------------------

function showShell(toast?: string) {
    const topTabsHtml = TOP_TABS.map(
        t => `
            <button
                type="button"
                role="tab"
                data-toptab="${t.id}"
                class="top-tab ${t.id === activeTopTab ? 'active' : ''}"
                aria-selected="${t.id === activeTopTab}"
            >${escapeHtml(t.label)}</button>
        `,
    ).join('');

    let body = '';
    if (activeTopTab === 'registration') body = renderRegistration();
    else if (activeTopTab === 'ap') body = renderAP();
    else body = renderComingSoon('Accounts Receivable');

    renderPage(`
        <section class="card">
            <p class="eyebrow">${escapeHtml(book?.getName() ?? '')}</p>
            <div class="top-tabs" role="tablist">${topTabsHtml}</div>
            ${body}
            ${toast ? `<div class="success">${escapeHtml(toast)}</div>` : ''}
        </section>
    `);

    document.querySelectorAll<HTMLButtonElement>('.top-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const next = btn.dataset.toptab as TopTabId | undefined;
            if (next && next !== activeTopTab) {
                activeTopTab = next;
                showShell();
            }
        });
    });

    if (activeTopTab === 'registration') wireRegistration();
    if (activeTopTab === 'ap') wireAP();
}

// ---------------------------------------------------------------------------
// Registration tab
// ---------------------------------------------------------------------------

function renderRegistration(): string {
    const subTabsHtml = REG_TABS.map(
        t => `
            <button
                type="button"
                role="tab"
                data-regtab="${t.id}"
                class="tab ${t.id === activeRegTab ? 'active' : ''}"
                aria-selected="${t.id === activeRegTab}"
            >${escapeHtml(t.label)}</button>
        `,
    ).join('');

    const tab = REG_TABS.find(t => t.id === activeRegTab) ?? REG_TABS[0];

    return `
        <div class="tabs" role="tablist">${subTabsHtml}</div>
        <h1>Register ${escapeHtml(tab.label)}</h1>
        <p>${describeTarget(tab)}</p>
        <form id="entity-form" autocomplete="off">
            ${renderEntityFormBody(tab)}
            <div class="actions">
                <button type="submit" class="primary" id="submit-btn">
                    Create ${escapeHtml(tab.entityLabel)}
                </button>
            </div>
        </form>
    `;
}

function wireRegistration(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-regtab]').forEach(btn => {
        btn.addEventListener('click', () => {
            const next = btn.dataset.regtab as RegTabId | undefined;
            if (next && next !== activeRegTab) {
                activeRegTab = next;
                showShell();
            }
        });
    });

    document
        .getElementById('entity-form')
        ?.addEventListener('submit', event => void handleRegistrationSubmit(event));
}

function describeTarget(tab: RegTabConfig): string {
    if (tab.kind === 'account') {
        const article = tab.accountType === AccountType.ASSET ? 'an Asset' : 'a Liability';
        return `Creates ${article} account in the <strong>${escapeHtml(tab.groupName)}</strong> group.`;
    }
    if (tab.kind === 'voyage') {
        return `Adds a voyage to the <strong>${escapeHtml(tab.propertyKey)}</strong> catalog and registers a hashtag for use in transactions.`;
    }
    return `Adds a port to the <strong>${escapeHtml(tab.propertyKey)}</strong> catalog.`;
}

function renderEntityFormBody(tab: RegTabConfig): string {
    if (tab.kind === 'account') {
        return `
            <label for="entity-name">${escapeHtml(tab.label)} name</label>
            <input id="entity-name" name="name" type="text" required autofocus />
        `;
    }
    if (tab.kind === 'voyage') {
        return `
            <label for="voyage-vessel">Vessel name</label>
            <input id="voyage-vessel" name="vessel" type="text" required autofocus placeholder="e.g. ISE HARMONY" />
            <label for="voyage-cp">CP number</label>
            <input id="voyage-cp" name="cp" type="text" required placeholder="e.g. CP123125" />
        `;
    }
    return `
        <label for="port-country">Country</label>
        <select id="port-country" name="country" required autofocus>
            <option value="" disabled selected>Select a country…</option>
            ${PORT_COUNTRIES.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
        </select>
        <label for="entity-name">Port name</label>
        <input id="entity-name" name="name" type="text" required />
    `;
}

async function handleRegistrationSubmit(event: Event) {
    event.preventDefault();
    const tab = REG_TABS.find(t => t.id === activeRegTab);
    const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement | null;
    if (!book || !tab) return;

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';
    }

    try {
        if (tab.kind === 'account') {
            const input = document.getElementById('entity-name') as HTMLInputElement | null;
            const name = input?.value.trim() ?? '';
            if (!name) throw new Error('Please enter a name.');
            const group = groupsByTab.get(tab.id);
            if (!group) throw new Error(`Group "${tab.groupName}" is not loaded.`);
            const created = await new Account(book)
                .setName(name)
                .setType(tab.accountType)
                .addGroup(group)
                .create();
            allAccounts.push(created);
            if (tab.id === 'vendor') {
                vendorAccounts.push(created);
                sortAccountsByName(vendorAccounts);
            }
            showShell(`Created ${tab.entityLabel} "${name}".`);
        } else if (tab.kind === 'catalog') {
            const input = document.getElementById('entity-name') as HTMLInputElement | null;
            const countrySelect = document.getElementById('port-country') as HTMLSelectElement | null;
            const name = input?.value.trim() ?? '';
            const country = countrySelect?.value ?? '';
            if (!name) throw new Error('Please enter a port name.');
            if (!country) throw new Error('Please select a country.');
            await registerPort(book, name, country);
            showShell(`Created port "${name}, ${country}".`);
        } else {
            const vesselInput = document.getElementById('voyage-vessel') as HTMLInputElement | null;
            const cpInput = document.getElementById('voyage-cp') as HTMLInputElement | null;
            const vessel = vesselInput?.value.trim() ?? '';
            const cp = cpInput?.value.trim() ?? '';
            if (!vessel) throw new Error('Please enter a vessel name.');
            if (!cp) throw new Error('Please enter a CP number.');
            const hashtag = await registerVoyage(book, vessel, cp);
            showShell(`Created voyage "${vessel} ${cp}" — hashtag ${hashtag}`);
        }
    } catch (err) {
        showError(err instanceof Error ? err.message : String(err));
    }
}

// ---------------------------------------------------------------------------
// A/P tab
// ---------------------------------------------------------------------------

function renderAP(): string {
    if (vendorAccounts.length === 0) {
        return `<h1>Accounts Payable</h1>
            <p class="muted">No vendors registered yet. Add one in the Registration tab first.</p>`;
    }
    if (expenseAccounts.length === 0) {
        return `<h1>Accounts Payable</h1>
            <p class="muted">This book has no expense accounts in groups <code>001\u2026009</code>. Add them first.</p>`;
    }

    const ports = book ? readPorts(book) : [];
    const voyages = book ? readVoyages(book) : [];

    if (voyages.length === 0) {
        return `<h1>Accounts Payable</h1>
            <p class="muted">No voyages registered yet. Add one in the Registration tab first.</p>`;
    }
    if (ports.length === 0) {
        return `<h1>Accounts Payable</h1>
            <p class="muted">No ports registered yet. Add one in the Registration tab first.</p>`;
    }

    const today = new Date().toISOString().slice(0, 10);

    return `
        <h1>Record A/P entry</h1>
        <p>Creates a draft transaction crediting a vendor and debiting an expense account.</p>
        <form id="ap-form" autocomplete="off">
            <label for="ap-vendor">Vendor</label>
            <select id="ap-vendor" required autofocus>
                <option value="" disabled selected>Select a vendor…</option>
                ${vendorAccounts
                    .map(a => `<option value="${escapeHtml(a.getId() ?? '')}">${escapeHtml(a.getName() ?? '')}</option>`)
                    .join('')}
            </select>

            <label for="ap-date">Date</label>
            <input id="ap-date" type="date" required value="${today}" />

            <label for="ap-amount">Amount</label>
            <input id="ap-amount" type="number" step="0.01" min="0" required placeholder="0.00" />

            <label for="ap-voyage">Voyage</label>
            <select id="ap-voyage" required>
                <option value="" disabled selected>Select a voyage…</option>
                ${voyages
                    .map(
                        v =>
                            `<option value="${escapeHtml(v.hashtag)}">${escapeHtml(v.vessel)} ${escapeHtml(v.cp)} (${escapeHtml(v.hashtag)})</option>`,
                    )
                    .join('')}
            </select>

            <label for="ap-port">Port</label>
            <select id="ap-port" required>
                <option value="" disabled selected>Select a port…</option>
                ${ports
                    .map(
                        (p, i) =>
                            `<option value="${i}">${escapeHtml(p.name)}, ${escapeHtml(p.country)}</option>`,
                    )
                    .join('')}
            </select>

            <label for="ap-expense">Expense account</label>
            <select id="ap-expense" required>
                <option value="" disabled selected>Select an expense account…</option>
                ${expenseAccounts
                    .map(a => `<option value="${escapeHtml(a.getId() ?? '')}">${escapeHtml(a.getName() ?? '')}</option>`)
                    .join('')}
            </select>

            <div class="actions">
                <button type="submit" class="primary" id="ap-submit">Create draft</button>
            </div>
        </form>
    `;
}

function wireAP(): void {
    document.getElementById('ap-form')?.addEventListener('submit', event => void handleAPSubmit(event));
}

async function handleAPSubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (!book) return;
    const submitBtn = document.getElementById('ap-submit') as HTMLButtonElement | null;
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';
    }

    try {
        const vendorId = (document.getElementById('ap-vendor') as HTMLSelectElement).value;
        const date = (document.getElementById('ap-date') as HTMLInputElement).value;
        const amount = (document.getElementById('ap-amount') as HTMLInputElement).value;
        const voyageHashtag = (document.getElementById('ap-voyage') as HTMLSelectElement).value;
        const portIndex = parseInt((document.getElementById('ap-port') as HTMLSelectElement).value, 10);
        const expenseId = (document.getElementById('ap-expense') as HTMLSelectElement).value;

        if (!vendorId || !date || !amount || !voyageHashtag || isNaN(portIndex) || !expenseId) {
            throw new Error('Please fill in all fields.');
        }

        const vendor = vendorAccounts.find(a => a.getId() === vendorId);
        const expense = expenseAccounts.find(a => a.getId() === expenseId);
        const port = readPorts(book)[portIndex];
        if (!vendor || !expense || !port) throw new Error('Selection no longer valid. Reload and try again.');

        const description = buildAPDescription(voyageHashtag, port);

        await new Transaction(book)
            .setCreditAccount(vendor)
            .setDebitAccount(expense)
            .setAmount(amount)
            .setDate(date)
            .setDescription(description)
            .create();

        activeTopTab = 'ap';
        showShell(`Draft created: ${description} — ${amount}`);
    } catch (err) {
        showError(err instanceof Error ? err.message : String(err));
    }
}

function buildAPDescription(voyageHashtag: string, port: PortRecord): string {
    const country = `#${slugCondensed(port.country)}`;
    const portName = `#${slugCondensed(port.name)}`;
    const portCountry = `#${slugCondensed(port.name + port.country)}`;
    return `${voyageHashtag} ${country} ${portName} ${portCountry}`;
}

function slugCondensed(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// ---------------------------------------------------------------------------
// A/R placeholder
// ---------------------------------------------------------------------------

function renderComingSoon(name: string): string {
    return `
        <h1>${escapeHtml(name)}</h1>
        <p class="muted">Coming soon.</p>
    `;
}

// ---------------------------------------------------------------------------
// Catalog helpers (ports + voyages)
// ---------------------------------------------------------------------------

async function registerPort(targetBook: Book, name: string, country: string): Promise<void> {
    const ports = readPorts(targetBook);
    const exists = ports.some(
        p =>
            p.name.toLowerCase() === name.toLowerCase() &&
            p.country.toLowerCase() === country.toLowerCase(),
    );
    if (exists) throw new Error(`Port "${name}, ${country}" is already registered.`);
    ports.push({ name, country });
    targetBook.setProperty(PORTS_PROPERTY_KEY, JSON.stringify(ports));
    await targetBook.update();
}

function readPorts(targetBook: Book): PortRecord[] {
    const raw = targetBook.getProperty(PORTS_PROPERTY_KEY);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed
                .filter(
                    (p): p is { name: string; country?: string } =>
                        typeof p === 'object' && p !== null && typeof (p as { name: unknown }).name === 'string',
                )
                .map(p => ({ name: p.name, country: p.country ?? '' }));
        }
    } catch {
        // fall through
    }
    return [];
}

function toHashtag(vessel: string, cp: string): string {
    const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const v = slug(vessel);
    const c = slug(cp);
    if (!v || !c) throw new Error('Vessel and CP number must contain letters or numbers.');
    return `#${v}_${c}`;
}

async function registerVoyage(targetBook: Book, vessel: string, cp: string): Promise<string> {
    const hashtag = toHashtag(vessel, cp);
    const voyages = readVoyages(targetBook);
    const exists = voyages.some(v => v.hashtag.toLowerCase() === hashtag.toLowerCase());
    if (exists) throw new Error(`Voyage ${hashtag} is already registered.`);
    voyages.push({ vessel, cp, hashtag });
    targetBook.setProperty(VOYAGES_PROPERTY_KEY, JSON.stringify(voyages));
    await targetBook.update();
    return hashtag;
}

function readVoyages(targetBook: Book): VoyageRecord[] {
    const raw = targetBook.getProperty(VOYAGES_PROPERTY_KEY);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed.filter(
                (v): v is VoyageRecord =>
                    typeof v === 'object' &&
                    v !== null &&
                    typeof (v as VoyageRecord).vessel === 'string' &&
                    typeof (v as VoyageRecord).cp === 'string' &&
                    typeof (v as VoyageRecord).hashtag === 'string',
            );
        }
    } catch {
        // fall through
    }
    return [];
}

// ---------------------------------------------------------------------------
// Generic views
// ---------------------------------------------------------------------------

function showLogin() {
    renderPage(`
        <section class="card centered">
            <h1>Seacape Input</h1>
            <p>Please sign in to register reference data.</p>
            <div class="actions" style="justify-content: center">
                <button id="login-btn" class="primary" type="button">Sign in</button>
            </div>
        </section>
    `);
    document.getElementById('login-btn')?.addEventListener('click', () => auth.login());
}

function showLoading(message = 'Loading...') {
    renderPage(`
        <section class="card centered">
            <div class="spinner" aria-hidden="true"></div>
            <p>${escapeHtml(message)}</p>
        </section>
    `);
}

function showError(message: string) {
    renderPage(`
        <section class="card error">
            <h1>Something went wrong</h1>
            <p>${escapeHtml(message)}</p>
            <div class="actions">
                <button class="primary" id="back-btn" type="button">Back</button>
            </div>
        </section>
    `);
    document.getElementById('back-btn')?.addEventListener('click', () => showShell());
}

function renderPage(content: string) {
    document.body.innerHTML = `<main>${content}</main>`;
}

function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
