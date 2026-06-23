/*
  Warnings:

  - Added the required column `updatedAt` to the `DirectMessage` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Message` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DirectMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "authorId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DirectMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "DirectChat" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DirectMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_DirectMessage" ("authorId", "chatId", "content", "createdAt", "updatedAt", "id") SELECT "authorId", "chatId", "content", "createdAt", "createdAt", "id" FROM "DirectMessage";
DROP TABLE "DirectMessage";
ALTER TABLE "new_DirectMessage" RENAME TO "DirectMessage";
CREATE INDEX "DirectMessage_chatId_createdAt_idx" ON "DirectMessage"("chatId", "createdAt");
CREATE TABLE "new_Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "room" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "authorUsername" TEXT,
    "avatar" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Message" ("author", "authorUsername", "avatar", "content", "createdAt", "updatedAt", "id", "room") SELECT "author", "authorUsername", "avatar", "content", "createdAt", "createdAt", "id", "room" FROM "Message";
DROP TABLE "Message";
ALTER TABLE "new_Message" RENAME TO "Message";
CREATE INDEX "Message_room_createdAt_idx" ON "Message"("room", "createdAt");
CREATE INDEX "Message_authorUsername_idx" ON "Message"("authorUsername");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
