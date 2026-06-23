-- CreateTable
CREATE TABLE "HiddenDirectChat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "chatId" TEXT NOT NULL,
    CONSTRAINT "HiddenDirectChat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HiddenDirectChat_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "DirectChat" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "HiddenDirectChat_userId_chatId_key" ON "HiddenDirectChat"("userId", "chatId");
