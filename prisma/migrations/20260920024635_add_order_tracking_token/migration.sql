/*
  Warnings:

  - Added the required column `publicTrackingToken` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNo" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLACED',
    "publicTrackingToken" TEXT NOT NULL,
    "placedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("completedAt", "contractId", "createdAt", "id", "orderNo", "placedAt", "status", "updatedAt") SELECT "completedAt", "contractId", "createdAt", "id", "orderNo", "placedAt", "status", "updatedAt" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_orderNo_key" ON "Order"("orderNo");
CREATE UNIQUE INDEX "Order_contractId_key" ON "Order"("contractId");
CREATE UNIQUE INDEX "Order_publicTrackingToken_key" ON "Order"("publicTrackingToken");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
