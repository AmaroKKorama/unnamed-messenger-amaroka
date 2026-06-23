-- AlterTable
ALTER TABLE "Message" ADD COLUMN "authorUsername" TEXT;

-- CreateIndex
CREATE INDEX "Message_authorUsername_idx" ON "Message"("authorUsername");
