import { BkperAuth } from '@bkper/web-auth';
import { Account, AccountType, Bkper, Book, Group } from 'bkper-js';

const VENDORS_GROUP_NAME = 'Vendors';

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
let vendorsGroup: Group | null = null;

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
        const groups = await book.getGroups();
        const found = groups.find(g => g.getName() === VENDORS_GROUP_NAME);
        if (!found) {
            showError(
                `This book does not have a "${VENDORS_GROUP_NAME}" group. Create the group first.`,
            );
            return;
        }
        vendorsGroup = found;
        showForm();
    } catch (err) {
        showError(err instanceof Error ? err.message : String(err));
    }
}

function showLogin() {
    renderPage(`
        <section class="card centered">
            <h1>Seacape Input</h1>
            <p>Please sign in to register vendors.</p>
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
        </section>
    `);
}

function showForm(successMessage?: string) {
    renderPage(`
        <section class="card">
            <p class="eyebrow">${escapeHtml(book?.getName() ?? '')}</p>
            <h1>Register Vendor</h1>
            <p>Creates a Liability account in the <strong>${escapeHtml(VENDORS_GROUP_NAME)}</strong> group.</p>
            <form id="vendor-form" autocomplete="off">
                <label for="vendor-name">Vendor name</label>
                <input id="vendor-name" name="name" type="text" required autofocus />
                <div class="actions">
                    <button type="submit" class="primary" id="submit-btn">Create vendor</button>
                </div>
            </form>
            ${
                successMessage
                    ? `<div class="success">${escapeHtml(successMessage)}</div>`
                    : ''
            }
        </section>
    `);

    document
        .getElementById('vendor-form')
        ?.addEventListener('submit', event => void handleSubmit(event));
}

async function handleSubmit(event: Event) {
    event.preventDefault();
    const input = document.getElementById('vendor-name') as HTMLInputElement | null;
    const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement | null;
    const name = input?.value.trim() ?? '';
    if (!name || !book || !vendorsGroup) {
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';
    }

    try {
        await new Account(book)
            .setName(name)
            .setType(AccountType.LIABILITY)
            .addGroup(vendorsGroup)
            .create();
        showForm(`Created vendor "${name}".`);
    } catch (err) {
        showError(err instanceof Error ? err.message : String(err));
    }
}

function renderPage(content: string) {
    document.body.innerHTML = `<main>${content}</main>`;
}

function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
