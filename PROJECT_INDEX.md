# Stock & POS Management Backend - Project Index

This document provides a comprehensive overview of the backend architecture, folder structure, database models, API routing, and core functionalities. It is designed to help developers and AI agents quickly understand the codebase without needing to read every file.

## 1. Project Overview

**Purpose of the Application**
This is the backend API for a multi-tenant Point of Sale (POS), Inventory, and Business Management platform. It supports complex operations like role-based access control, billing, Khata (customer ledgers), multi-outlet stock tracking, multi-tier subscription plans, and real-time notifications.

**Tech Stack**
- **Runtime:** Node.js (ES Modules)
- **Web Framework:** Express.js
- **Database:** MongoDB with Mongoose ORM
- **In-Memory Store / PubSub:** Redis (via `redis` client)
- **Real-Time:** Socket.IO with Redis Adapter (for horizontal scaling)
- **Validation:** Zod schemas
- **Background Jobs:** node-cron
- **Security:** Helmet, CORS, JWT-based authentication
- **Payment Gateway:** Razorpay

**Folder Structure**
```text
/src
  /config         # Configuration (DB, Redis, Socket.IO, Env vars, Feature maps)
  /controllers    # Core business logic for API endpoints
  /cron           # Scheduled background tasks (e.g., subscription checks)
  /middlewares    # Express middlewares (auth, validation, rate limiting, context)
  /migrations     # Database migration scripts
  /models         # Mongoose schema definitions
  /routes         # Express route declarations (mapping paths to controllers)
  /seeders        # Data seeders for initial setup (admin, plans, etc.)
  /utils          # General utilities, logging, formatters
  /validators     # Zod schema definitions for request payload validation
```

---

## 2. Overall Architecture

The backend follows a standard MVC-like architecture (Routes -> Controllers -> Models), heavily relying on middleware for cross-cutting concerns.

- **Multi-Tenancy:** Data is scoped by `businessId` and `outletId`. 
- **Middlewares as Gates:** A typical protected route goes through:
  1. `requireAuth` (validates JWT).
  2. `requireActiveSubscription` (ensures the business hasn't expired).
  3. `loadBusinessContext` (injects business info and allowed features into the request).
  4. `validate(schema)` (ensures request body/params meet Zod schemas).
  5. Finally, the controller handles business logic.
- **Real-Time Communication:** A Socket.IO server runs alongside the HTTP server, utilizing a Redis adapter to allow broadcasting across multiple API instances. Users join specific rooms (`business:ID`, `outlet:ID`, `user:ID`).
- **Rate Limiting:** Redis-backed rate limiters are strictly enforced on authentication and other high-load endpoints.

---

## 3. Core Domain & Models

The database is built on MongoDB using Mongoose. Here are the critical models:

### Multi-Tenancy & Access
- **`Business`**: The root tenant. Contains subscription state, billing config, and enabled features.
- **`Outlet`**: Branches belonging to a Business.
- **`User`**: Application users (Superadmin, Owner, Manager, Staff, Agent).
- **`Role`**: Custom RBAC definitions mapping to specific modules and actions.
- **`Session`**: Tracks active login sessions and JWT refresh tokens.

### Catalog & Inventory
- **`Product` & `Category`**: Core catalog definition. Supports variant pricing and unit tracking.
- **`Unit`**: Measurement units (kg, pcs, boxes).
- **`Inventory`**: Current stock levels mapped per Product per Outlet.
- **`StockEntry` & `StockTransfer`**: Audit trails for stock moving in, out, or between outlets.

### Sales & Customers
- **`Order`**: POS transaction records containing itemized lines, taxes (CGST/SGST), discounts, and payment methods.
- **`Customer` & `CustomerTransaction`**: The "Khata" module. Tracks customer details, outstanding balances, and ledger payments.

### Platform Management
- **`Plan` & `Subscription`**: Defines the SaaS tiers (Retail, Wholesale, Hybrid) and tracks business active periods.
- **`Payment` & `ManualPayment`**: Records of payments made to the platform (via Razorpay or manual verification).
- **`AuditLog`**: System-wide logs tracking who modified what.
- **`Notification`**: Real-time alerts mapped to users.

---

## 4. API Routing Map

Routes are defined in `src/routes/` and stitched together in `src/app.js`.

### Authentication & Public (`/api/auth`)
- `/register`, `/login`, `/send-otp`, `/verify-otp`, `/forgot-password`, `/me`
- Heavily rate-limited.

### Subsystem: Superadmin Platform (`/api/admin`)
- Operations to manage the entire SaaS platform.
- Approving custom plans, verifying manual payments, viewing global stats, and agent management.

### Subsystem: Agent Portal (`/api/agent`)
- Dedicated routes for sales agents to onboard clients, view their commission wallet, and request payouts.

### Subsystem: Business Core (`/api/*`)
Protected by the `withSub` middleware chain (`requireAuth`, `requireActiveSubscription`, `loadBusinessContext`):
- **`/businesses`, `/outlets`**: Business settings and branch management.
- **`/products`, `/categories`, `/units`**: Catalog setup.
- **`/stock`**: Inventory adjustments and transfers.
- **`/orders`, `/invoices`**: Sales transactions and tax document generation.
- **`/customers`**: Directory and Khata management.
- **`/reports`, `/expenses`**: Analytics and operational cost tracking.
- **`/users`, `/roles`**: Staff and access control.
- **`/audit-logs`**: Compliance tracking.
- **`/notifications`**: Fetching and marking in-app notifications as read.

---

## 5. Key Middlewares & Configurations

- **`src/config/features.js`**: A centralized registry of features (e.g., `retail_billing`, `gst_invoices`, `credit_khata`). This is used to map subscription plans to available functionality and enforce access at runtime.
- **`src/config/socket.js`**: Initializes Socket.IO. Handles automatic room joining when a user connects and pushes the initial unread notification count.
- **`src/middlewares/error.js`**: Global error handler catching unhandled exceptions, formatting Mongoose validation errors, and ensuring a standard API envelope is returned to the client (`{ success: false, message: ... }`).
- **`src/middlewares/rateLimiter/index.js`**: Standardized buckets (e.g., `login`, `register`, `api`) utilizing Redis to prevent abuse.

---

## 6. Background Jobs (Cron)

Located in `src/cron/`. The system uses `node-cron` to execute scheduled background tasks.
- **`subscriptionReminders.js`**: Runs daily to check for expiring subscriptions, trial ends, and grace periods. It orchestrates locking accounts and pushing notifications/emails as required.
