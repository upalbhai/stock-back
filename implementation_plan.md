# Internal Team Chat & Real-Time Notifications

A phased implementation plan for adding Socket.IO-based real-time notifications and an internal team chat system to the upal platform.  Everything is gated behind your existing feature flag and permission systems.

---

## Current Architecture Snapshot

| Layer | What exists today |
|---|---|
| **Server entry** | [index.js](file:///f:/projects/upal/stock-back/src/index.js) — `app.listen()` (plain Express, no HTTP server exposed) |
| **Feature system** | [features.js](file:///f:/projects/upal/stock-back/src/config/features.js) — `FEATURES` registry + `PLAN_FEATURE_TEMPLATES` per plan |
| **Feature middleware** | [feature.js](file:///f:/projects/upal/stock-back/src/middlewares/feature.js) — `requireFeature(key)`, `loadBusinessContext()` |
| **Permission system** | [permission.js](file:///f:/projects/upal/stock-back/src/middlewares/permission.js) — role-based + custom user-level, with `MODULES` and `ACTIONS` in [Role.js](file:///f:/projects/upal/stock-back/src/models/Role.js) |
| **Redis** | [redis.js](file:///f:/projects/upal/stock-back/src/config/redis.js) — already connected, used for rate limiting |
| **Frontend feature hook** | [useFeature.ts](file:///f:/projects/upal/stock-front/hooks/useFeature.ts) — checks `user.enabledFeatures` |

---

## Phase 1 — Socket.IO Infrastructure (Foundation)

> **Goal:** Wire up Socket.IO on the existing Express server with JWT auth, business-scoped rooms, and Redis adapter for horizontal scaling. No user-facing features yet — just the plumbing.

### Backend

#### [MODIFY] [index.js](file:///f:/projects/upal/stock-back/src/index.js)
- Replace `app.listen()` with `http.createServer(app)`.
- Pass the `httpServer` to a new `initSocket(httpServer)` function.
- Call `httpServer.listen(env.PORT)` instead.

```javascript
import http from "http";
// ...
const app = createApp();
const httpServer = http.createServer(app);
initSocket(httpServer);
httpServer.listen(env.PORT, () => { ... });
```

#### [NEW] `src/config/socket.js`
- Create and export a singleton `io` instance.
- Use `@socket.io/redis-adapter` with the existing `redisClient` so multiple server instances share socket state.
- CORS config mirrors the existing Express CORS origins from [env.js](file:///f:/projects/upal/stock-back/src/config/env.js).

```
Exports:
  - initSocket(httpServer)  — one-time setup
  - getIO()                 — returns the io instance for emitting from controllers
```

#### [NEW] `src/middlewares/socketAuth.js`
- A Socket.IO middleware that runs on every `connection` event.
- Extracts the JWT from `socket.handshake.auth.token`.
- Verifies with the same `jwt.verify(token, env.JWT_SECRET)` used in [auth.js](file:///f:/projects/upal/stock-back/src/middlewares/auth.js).
- Validates the session (same logic as `validateSession` in auth.js).
- Attaches `socket.user = { userId, businessId, role, ... }` on success.
- On failure, calls `next(new Error("Unauthorized"))` to reject the connection.

#### Room Strategy
On successful connection, auto-join rooms:
- `business:{businessId}` — all business-wide events
- `user:{userId}` — personal notifications
- `outlet:{outletId}` — for each outlet the user belongs to

#### [NEW] `src/utils/socketEmitter.js`
A thin utility so any controller can emit events without importing the full `io` object:

```javascript
import { getIO } from "../config/socket.js";

export function emitToUser(userId, event, data) { ... }
export function emitToBusiness(businessId, event, data) { ... }
export function emitToOutlet(outletId, event, data) { ... }
```

---

## Phase 2 — Real-Time Notifications

> **Goal:** A persistent notification system with in-app real-time delivery. Feature-gated behind `"notifications"`.

### Feature & Permission Registration

#### [MODIFY] [features.js](file:///f:/projects/upal/stock-back/src/config/features.js)
Add to `FEATURES`:
```javascript
notifications: {
  key: "notifications",
  label: "Notifications",
  group: "communication",
  description: "Real-time in-app notifications for orders, stock alerts, etc."
}
```
Add `"notifications"` to all `PLAN_FEATURE_TEMPLATES` (retail, wholesale, hybrid) since it's a core feature.

#### [MODIFY] [Role.js](file:///f:/projects/upal/stock-back/src/models/Role.js)
Add `"notifications"` to the `MODULES` array. Actions: `read`, `create`, `delete`.

### Backend

#### [NEW] `src/models/Notification.js`

```javascript
const notificationSchema = new Schema({
  businessId:  { type: ObjectId, ref: "Business", required: true, index: true },
  recipientId: { type: ObjectId, ref: "User", required: true, index: true },
  type:        { type: String, enum: [
    "order_created", "order_voided", "low_stock",
    "payment_received", "staff_invited", "chat_message", "system"
  ], required: true },
  title:       { type: String, required: true },
  body:        { type: String },
  metadata:    { type: Schema.Types.Mixed },   // e.g. { orderId, orderNumber }
  isRead:      { type: Boolean, default: false },
  readAt:      { type: Date }
}, { timestamps: true });

notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });
```

#### [NEW] `src/controllers/notificationController.js`
- `listNotifications` — paginated, for the logged-in user, sorted by newest first.
- `markAsRead` — mark a single notification as read.
- `markAllAsRead` — mark all unread notifications as read.
- `getUnreadCount` — returns the count of unread notifications (for the badge).

#### [NEW] `src/routes/notifications.js`
```
GET    /              → listNotifications       (requireAuth, requireFeature("notifications"), requirePermission("notifications","read"))
PATCH  /:id/read      → markAsRead              (requireAuth, requirePermission("notifications","read"))
POST   /mark-all-read → markAllAsRead           (requireAuth)
GET    /unread-count   → getUnreadCount          (requireAuth)
```

#### [MODIFY] [app.js](file:///f:/projects/upal/stock-back/src/app.js)
Register the new route: `app.use("/api/notifications", ...withSub, notificationRouter);`

#### [NEW] `src/utils/notificationService.js`
A centralized helper to create + emit a notification in one call:

```javascript
export async function notify({ businessId, recipientId, type, title, body, metadata }) {
  const notification = await Notification.create({ ... });
  emitToUser(recipientId, "notification:new", notification);
  return notification;
}

export async function notifyBusiness({ businessId, type, title, body, metadata, excludeUserId }) {
  // Find all active users in the business, create notifications in bulk, emit to each
}
```

#### Trigger Points (sprinkle `notify()` calls into existing controllers)

| Event | Where | Recipients |
|---|---|---|
| Order created | [orderController.js](file:///f:/projects/upal/stock-back/src/controllers/orderController.js) `createOrder` | Owner + managers of that outlet |
| Order voided | `voidOrder` | Owner |
| Low stock alert | Stock entry logic (when `onHandQty < lowStockThreshold`) | Owner + managers |
| Staff invited | `createInvite` in userController | The invitee |
| Payment received | Existing payment logic | Owner |

### Frontend

#### [NEW] `services/notification.service.ts`
```typescript
export const notificationService = {
  getNotifications: (token, params) => getJson("/notifications", token, params),
  markAsRead: (id, token) => apiFetch(`/notifications/${id}/read`, { method: "PATCH", token }),
  markAllAsRead: (token) => apiFetch("/notifications/mark-all-read", { method: "POST", token }),
  getUnreadCount: (token) => getJson("/notifications/unread-count", token),
};
```

#### [NEW] `hooks/useSocket.ts`
- Creates and manages a singleton `socket.io-client` connection.
- Connects on login (when `token` is available), disconnects on logout.
- Exposes `socket`, `isConnected`, `on`, `off`, `emit`.

#### [NEW] `hooks/useNotifications.ts`
- Uses `useQuery` for the unread count (polled every 60s as fallback).
- Listens to `notification:new` via the socket hook to optimistically update the count.
- Exposes `unreadCount`, `notifications`, `markAsRead`, `markAllAsRead`.

#### [NEW] `components/notifications/notification-bell.tsx`
- A bell icon in the top nav with an animated badge showing the unread count.
- Click opens a dropdown/sheet with the notification list.
- Each notification is clickable (navigates to the relevant page, e.g. order details).

#### [NEW] `app/dashboard/notifications/page.tsx`
- Full-page notification center with pagination, "mark all as read", and filters.

#### Feature Gate
- Wrap the bell component: `const hasNotifications = useFeature("notifications");`  
- Only render `<NotificationBell />` if `hasNotifications` is true.

---

## Phase 3 — Internal Team Chat

> **Goal:** 1-on-1 and group conversations between staff members within a business. Feature-gated behind `"team_chat"`.

### Feature & Permission Registration

#### [MODIFY] [features.js](file:///f:/projects/upal/stock-back/src/config/features.js)
```javascript
team_chat: {
  key: "team_chat",
  label: "Team Chat",
  group: "communication",
  description: "Internal messaging between staff members"
}
```
Add `"team_chat"` to `wholesale` and `hybrid` templates (not retail free tier).

#### [MODIFY] [Role.js](file:///f:/projects/upal/stock-back/src/models/Role.js)
Add `"chat"` to the `MODULES` array. Actions: `read`, `create`, `delete`.

### Backend

#### [NEW] `src/models/Conversation.js`

```javascript
const conversationSchema = new Schema({
  businessId:   { type: ObjectId, ref: "Business", required: true },
  type:         { type: String, enum: ["direct", "group"], default: "direct" },
  name:         { type: String },                       // only for group chats
  participants: [{ type: ObjectId, ref: "User" }],
  lastMessage:  {
    text:     String,
    senderId: { type: ObjectId, ref: "User" },
    sentAt:   Date
  },
  createdBy:    { type: ObjectId, ref: "User" }
}, { timestamps: true });

conversationSchema.index({ businessId: 1, participants: 1 });
conversationSchema.index({ businessId: 1, updatedAt: -1 });
```

#### [NEW] `src/models/Message.js`

```javascript
const messageSchema = new Schema({
  conversationId: { type: ObjectId, ref: "Conversation", required: true },
  senderId:       { type: ObjectId, ref: "User", required: true },
  text:           { type: String },
  type:           { type: String, enum: ["text", "system"], default: "text" },
  isEdited:       { type: Boolean, default: false },
  editedAt:       { type: Date },
  readBy:         [{ userId: ObjectId, readAt: Date }]
}, { timestamps: true });

messageSchema.index({ conversationId: 1, createdAt: -1 });
```

#### [NEW] `src/controllers/chatController.js`

| Function | Purpose |
|---|---|
| `listConversations` | Paginated list of conversations the user is a participant of, sorted by `updatedAt` |
| `getOrCreateDirect` | Find existing direct conversation between two users, or create one |
| `createGroupChat` | Create a group conversation with multiple participants |
| `getMessages` | Paginated messages for a conversation (cursor-based, newest first) |
| `sendMessage` | Save message → update `lastMessage` on conversation → emit via socket |
| `editMessage` | Only sender can edit, within 15-minute window |
| `deleteMessage` | Soft-delete or hard-delete (only sender or owner) |
| `markConversationRead` | Mark all messages in a conversation as read for the user |

**Real-time flow for `sendMessage`:**
```
1. Save Message to MongoDB
2. Update Conversation.lastMessage
3. For each participant (except sender):
   a. emitToUser(participantId, "chat:message", { conversationId, message })
   b. notify({ recipientId, type: "chat_message", title: "New message from ..." })
4. Return the saved message to the sender via HTTP response
```

#### [NEW] `src/routes/chat.js`
```
GET    /conversations                → listConversations
POST   /conversations/direct         → getOrCreateDirect        (body: { userId })
POST   /conversations/group          → createGroupChat           (body: { name, participantIds })
GET    /conversations/:id/messages   → getMessages               (query: cursor, limit)
POST   /conversations/:id/messages   → sendMessage               (body: { text })
PATCH  /messages/:id                 → editMessage               (body: { text })
DELETE /messages/:id                 → deleteMessage
POST   /conversations/:id/read      → markConversationRead
```

All routes use: `requireAuth`, `requireFeature("team_chat")`, `requirePermission("chat", "read"|"create"|"delete")`, `rateLimit("chatCrud")`.

#### [MODIFY] [app.js](file:///f:/projects/upal/stock-back/src/app.js)
Register: `app.use("/api/chat", ...withSub, chatRouter);`

#### [MODIFY] [endpointConfigs.js](file:///f:/projects/upal/stock-back/src/middlewares/rateLimiter/endpointConfigs.js)
Add a `chatCrud` rate limit config (e.g. 60 requests/min, higher than standard CRUD).

#### Socket Events (handled in `src/config/socket.js`)

| Event | Direction | Purpose |
|---|---|---|
| `chat:message` | Server → Client | New message in a conversation |
| `chat:typing` | Client → Server → Client | Typing indicator (broadcast to conversation participants) |
| `chat:stop_typing` | Client → Server → Client | Stop typing indicator |
| `chat:read` | Server → Client | Read receipt |

**Typing indicator optimization:** Use Redis pub/sub with a 3-second debounce, don't persist to MongoDB.

### Frontend

#### [NEW] `services/chat.service.ts`
Standard API service matching all the chat routes above.

#### [NEW] `hooks/useChat.ts`
- `useConversationsQuery` — fetches conversation list with `useQuery`.
- `useMessagesQuery(conversationId)` — cursor-based infinite scroll with `useInfiniteQuery`.
- `useSendMessageMutation` — optimistic update, adds message to cache immediately.
- Socket listeners for `chat:message` to update conversation list + message list in real-time.

#### [NEW] `app/dashboard/chat/page.tsx`
- **Desktop:** Two-panel layout — conversation list (left), message thread (right).
- **Mobile:** Single-panel with navigation between list and thread views.
- Conversation list shows: participant name/group name, last message preview, unread count, timestamp.
- Message thread shows: messages with avatars, timestamps, read receipts, edit/delete actions.
- Typing indicator at the bottom of the thread.
- New conversation button opens a modal to pick a staff member or create a group.

#### [NEW] `components/chat/chat-sidebar-badge.tsx`
- A small badge on the "Chat" sidebar item showing total unread messages.

#### [MODIFY] `components/layout/use-visible-sidebar.ts`
- Add the "Chat" menu item, gated behind `useFeature("team_chat")`.

#### Feature Gate
```tsx
const hasTeamChat = useFeature("team_chat");
// Only show Chat in sidebar if hasTeamChat
// Only render chat page if hasTeamChat
```

---

## Phase 4 — Polish & Production Hardening

> **Goal:** Make everything production-ready, scalable, and secure.

### Backend Optimizations

| Area | Action |
|---|---|
| **Message pagination** | Use cursor-based pagination (by `_id` or `createdAt`) instead of skip/limit for large conversations |
| **Notification cleanup** | Add a TTL index on `Notification` — auto-delete after 30 days: `notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 })` |
| **Socket connection limits** | Limit max connections per user (e.g. 5 tabs) to prevent resource exhaustion |
| **Rate limiting on sockets** | Throttle `chat:typing` events (max 1 per 3 seconds per user per conversation) |
| **Message size limits** | Cap text at 2000 characters |
| **Redis adapter** | Already planned in Phase 1 — ensures horizontal scaling works |

### Security

| Area | Action |
|---|---|
| **Input sanitization** | Sanitize message text (strip HTML, prevent XSS) before saving |
| **Authorization checks** | Every message/conversation operation verifies the user is a participant |
| **Business isolation** | All queries include `businessId` filter — no cross-business data leaks |
| **Socket disconnection** | On token expiry or session revocation, forcefully disconnect the socket |

### Frontend Polish

| Area | Action |
|---|---|
| **Offline queue** | Queue messages sent while offline, flush when reconnected (extend existing `flushOfflineQueue`) |
| **Sound/vibration** | Optional notification sound for new messages (respects user preference) |
| **Unread badges** | Sidebar badge for chat, bell badge for notifications |
| **Empty states** | Beautiful empty states for "no conversations yet", "no notifications" |

---

## New Files Summary

### Backend (`stock-back/src/`)

| File | Phase |
|---|---|
| `config/socket.js` | 1 |
| `middlewares/socketAuth.js` | 1 |
| `utils/socketEmitter.js` | 1 |
| `models/Notification.js` | 2 |
| `controllers/notificationController.js` | 2 |
| `routes/notifications.js` | 2 |
| `utils/notificationService.js` | 2 |
| `models/Conversation.js` | 3 |
| `models/Message.js` | 3 |
| `controllers/chatController.js` | 3 |
| `routes/chat.js` | 3 |

### Frontend (`stock-front/`)

| File | Phase |
|---|---|
| `hooks/useSocket.ts` | 2 |
| `services/notification.service.ts` | 2 |
| `hooks/useNotifications.ts` | 2 |
| `components/notifications/notification-bell.tsx` | 2 |
| `app/dashboard/notifications/page.tsx` | 2 |
| `services/chat.service.ts` | 3 |
| `hooks/useChat.ts` | 3 |
| `app/dashboard/chat/page.tsx` | 3 |
| `components/chat/chat-sidebar-badge.tsx` | 3 |

### Modified Files

| File | Phase | Change |
|---|---|---|
| `src/index.js` | 1 | HTTP server + socket init |
| `src/config/features.js` | 2, 3 | Add `notifications` and `team_chat` features |
| `src/models/Role.js` | 2, 3 | Add `notifications` and `chat` modules |
| `src/app.js` | 2, 3 | Register notification + chat routes |
| `src/middlewares/rateLimiter/endpointConfigs.js` | 3 | Add `chatCrud` config |
| `src/controllers/orderController.js` | 2 | Add `notify()` calls |
| `components/layout/use-visible-sidebar.ts` | 3 | Add Chat sidebar item |

---

## Dependencies to Install

### Backend
```
socket.io
@socket.io/redis-adapter
```

### Frontend
```
socket.io-client
```

---

## Open Questions

> [!IMPORTANT]
> **1. File attachments in chat?**  
> Should chat messages support file/image attachments? This would require adding file upload infrastructure (e.g. S3/Cloudinary). I've excluded it for now to keep Phase 3 focused, but it can be added as a Phase 5 enhancement.

> [!IMPORTANT]
> **2. Push notifications?**  
> Do you want browser push notifications (Web Push API) in addition to in-app real-time notifications? This adds complexity (service workers, VAPID keys) but enables notifications even when the tab is closed.

> [!IMPORTANT]
> **3. Chat for retail plan?**  
> I've put `team_chat` in wholesale/hybrid plans only (not retail). Should retail plans also get chat, or is it a premium feature?

> [!IMPORTANT]
> **4. Message read receipts?**  
> Should we show "seen" indicators (like WhatsApp blue ticks) in chat, or just track unread counts? Read receipts add more socket traffic and DB writes.
