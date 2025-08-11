/*
  Warnings:

  - You are about to alter the column `action` on the `admin_activities` table. The data in that column could be lost. The data in that column will be cast from `VarChar(255)` to `Enum(EnumId(2))`.
  - Added the required column `adminEmpId` to the `admin_activities` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `admin_activities` ADD COLUMN `adminEmpId` VARCHAR(255) NOT NULL,
    MODIFY `action` ENUM('CHANGED_LOCATION_TYPE', 'VIEWED_ATTENDANCE', 'VIEWED_ALL_USERS', 'CREATED_USER', 'UPDATED_USER', 'DEACTIVATED_USER') NOT NULL;

-- AlterTable
ALTER TABLE `attendance_dates` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `attendance_statistics` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `firstAttendance` DATETIME(3) NULL,
    ADD COLUMN `thisMonthCount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `thisWeekCount` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `user_locations` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- CreateTable
CREATE TABLE `attendance_calendar` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empId` VARCHAR(255) NOT NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `daysMask` VARCHAR(31) NOT NULL,
    `totalDays` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `attendance_calendar_empId_idx`(`empId`),
    INDEX `attendance_calendar_year_month_idx`(`year`, `month`),
    UNIQUE INDEX `attendance_calendar_empId_year_month_key`(`empId`, `year`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `admin_activities_adminEmpId_idx` ON `admin_activities`(`adminEmpId`);

-- CreateIndex
CREATE INDEX `admin_activities_action_idx` ON `admin_activities`(`action`);

-- CreateIndex
CREATE INDEX `attendance_empId_idx` ON `attendance`(`empId`);

-- CreateIndex
CREATE INDEX `attendance_dates_empId_idx` ON `attendance_dates`(`empId`);

-- CreateIndex
CREATE INDEX `user_locations_updatedBy_idx` ON `user_locations`(`updatedBy`);

-- CreateIndex
CREATE INDEX `users_empId_idx` ON `users`(`empId`);

-- AddForeignKey
ALTER TABLE `attendance_statistics` ADD CONSTRAINT `attendance_statistics_empId_fkey` FOREIGN KEY (`empId`) REFERENCES `users`(`empId`) ON DELETE CASCADE ON UPDATE CASCADE;
