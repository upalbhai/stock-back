import mongoose, { Schema } from "mongoose";

const notificationSchema = new Schema({
  businessId:  { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
  recipientId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  type:        { type: String, enum: [
    "order_created", "order_voided", "low_stock",
    "payment_received", "staff_invited", "chat_message", "system"
  ], required: true },
  title:       { type: String, required: true },
  body:        { type: String },
  metadata:    { type: Schema.Types.Mixed },   // e.g. { orderId, orderNumber }
  link:        { type: String },               // For frontend navigation
  isRead:      { type: Boolean, default: false },
  readAt:      { type: Date }
}, { timestamps: true });

notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });

export const Notification = mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
