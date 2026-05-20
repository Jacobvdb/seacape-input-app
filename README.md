# Seacape Input

Seacape Input is a Bkper app that registers reference data with a consistent shape, so transactions in your Seacape books always carry the right accounts, groups, and labels.

## What it does

Today, the app supports registering **Vendors**:

- Open the app from the book's **More** menu (**Seacape Input**).
- Type a vendor name and click **Create vendor**.
- The app creates a Liability account and adds it to the **Vendors** group under **Accounts Payables**, so the vendor is ready to be used in transactions immediately.

The app does not modify existing accounts or transactions.

## Requirements

- The book must already have a group named **Vendors** (under **Accounts Payables → Vendors**). If the group is missing, the app shows a clear message and does nothing.

## Roadmap

Planned tabs (not yet implemented):

- **Customer** — register an Asset account in **Customers**.
- **Voyage** — register a voyage as a hashtag stored in a Book-level catalog.
- **Port** — register a port stored in a Book-level catalog.

## Install

Once installed on a book, the app appears as **Seacape Input** in the book's **More** menu.
