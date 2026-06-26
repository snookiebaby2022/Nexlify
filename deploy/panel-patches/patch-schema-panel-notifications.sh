#!/usr/bin/env bash
set -euo pipefail
PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
SCHEMA="$PANEL/prisma/schema.prisma"
export SCHEMA

python3 << 'PY'
import os
from pathlib import Path
p = Path(os.environ["SCHEMA"])
text = p.read_text()
changed = False

enums = '''
enum PanelNotificationKind {
  UPDATE
  MESSAGE
  ALERT
}

enum PanelNotificationPriority {
  NORMAL
  HIGH
  URGENT
}

enum PanelNotificationTarget {
  ALL_RESELLERS
  SPECIFIC_USER
}
'''

if "enum PanelNotificationKind" not in text:
    anchor = "enum TicketPriority {"
    if anchor not in text:
        raise SystemExit("Could not find TicketPriority enum anchor")
    text = text.replace(
        "enum TicketPriority {",
        "enum TicketPriority {",
        1,
    )
    # Insert after TicketPriority block
    end = text.find("}", text.find("enum TicketPriority"))
    if end == -1:
        raise SystemExit("Could not find end of TicketPriority enum")
    text = text[: end + 1] + enums + text[end + 1 :]
    changed = True

user_rel = '''  notificationsCreated  PanelNotification[] @relation("NotificationCreator")
  notificationsReceived PanelNotification[] @relation("NotificationRecipient")
  notificationReads     PanelNotificationRead[]'''

if "notificationsCreated" not in text:
    anchor = "  chatMessages       PanelChatMessage[]\n  groupId"
    insert = "  chatMessages       PanelChatMessage[]\n" + user_rel + "\n  groupId"
    if anchor not in text:
        raise SystemExit("Could not find PanelUser relations anchor")
    text = text.replace(anchor, insert, 1)
    changed = True

models = '''
model PanelNotification {
  id           String                    @id @default(cuid())
  title        String
  body         String                    @db.Text
  kind         PanelNotificationKind
  priority     PanelNotificationPriority @default(NORMAL)
  target       PanelNotificationTarget
  recipientId  String?
  recipient    PanelUser?                @relation("NotificationRecipient", fields: [recipientId], references: [id], onDelete: SetNull)
  createdById  String
  createdBy    PanelUser                 @relation("NotificationCreator", fields: [createdById], references: [id], onDelete: Cascade)
  isPinned     Boolean                   @default(false)
  isActive     Boolean                   @default(true)
  expiresAt    DateTime?
  createdAt    DateTime                  @default(now())
  updatedAt    DateTime                  @updatedAt
  reads        PanelNotificationRead[]

  @@index([isActive, createdAt])
  @@index([target, recipientId])
}

model PanelNotificationRead {
  id             String            @id @default(cuid())
  notificationId String
  notification   PanelNotification @relation(fields: [notificationId], references: [id], onDelete: Cascade)
  userId         String
  user           PanelUser         @relation(fields: [userId], references: [id], onDelete: Cascade)
  readAt         DateTime          @default(now())

  @@unique([notificationId, userId])
  @@index([userId])
}
'''

if "model PanelNotification" not in text:
    anchor = "model UserGroup {"
    if anchor not in text:
        raise SystemExit("Could not find UserGroup model anchor")
    text = text.replace(anchor, models + "\n" + anchor, 1)
    changed = True

if changed:
    p.write_text(text)
    print("schema.prisma updated with panel notifications")
else:
    print("schema.prisma already has panel notification models")
PY
