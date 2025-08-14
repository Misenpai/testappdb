-- AlterTable
ALTER TABLE `user_locations` ADD COLUMN `approxLat` FLOAT NULL,
    ADD COLUMN `approxLng` FLOAT NULL,
    ADD COLUMN `approxRadius` INTEGER NULL DEFAULT 100;

-- CreateTable
CREATE TABLE `field_trips` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empId` VARCHAR(255) NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `description` TEXT NULL,
    `createdBy` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    INDEX `field_trips_empId_idx`(`empId`),
    INDEX `field_trips_startDate_endDate_idx`(`startDate`, `endDate`),
    INDEX `field_trips_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `field_trips` ADD CONSTRAINT `field_trips_empId_fkey` FOREIGN KEY (`empId`) REFERENCES `user_locations`(`empId`) ON DELETE CASCADE ON UPDATE CASCADE;
