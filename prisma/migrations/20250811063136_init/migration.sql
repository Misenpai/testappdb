-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `empId` VARCHAR(255) NOT NULL,
    `username` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `location` VARCHAR(255) NOT NULL DEFAULT 'all',
    `role` ENUM('USER', 'ADMIN', 'SUPER_ADMIN') NOT NULL DEFAULT 'USER',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_empId_key`(`empId`),
    UNIQUE INDEX `users_username_key`(`username`),
    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_role_idx`(`role`),
    INDEX `users_isActive_idx`(`isActive`),
    INDEX `users_empId_idx`(`empId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_locations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empId` VARCHAR(255) NOT NULL,
    `username` VARCHAR(255) NOT NULL,
    `locationType` ENUM('ABSOLUTE', 'APPROX', 'FIELDTRIP') NOT NULL DEFAULT 'ABSOLUTE',
    `updatedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `notes` TEXT NULL,

    UNIQUE INDEX `user_locations_empId_key`(`empId`),
    INDEX `user_locations_locationType_idx`(`locationType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empId` VARCHAR(255) NOT NULL,
    `username` VARCHAR(255) NOT NULL,
    `takenLocation` VARCHAR(255) NULL,
    `date` DATE NOT NULL,
    `checkInTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `checkOutTime` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `attendance_date_idx`(`date`),
    INDEX `attendance_empId_date_idx`(`empId`, `date`),
    INDEX `attendance_empId_idx`(`empId`),
    UNIQUE INDEX `attendance_empId_date_key`(`empId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_dates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `empId` VARCHAR(255) NOT NULL,
    `date` DATE NOT NULL,
    `year` INTEGER NOT NULL,
    `month` INTEGER NOT NULL,
    `day` INTEGER NOT NULL,
    `dayOfWeek` INTEGER NOT NULL,
    `weekOfYear` INTEGER NOT NULL,
    `isPresent` BOOLEAN NOT NULL DEFAULT true,
    `attendanceId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `attendance_dates_attendanceId_key`(`attendanceId`),
    INDEX `attendance_dates_empId_year_month_idx`(`empId`, `year`, `month`),
    INDEX `attendance_dates_empId_date_idx`(`empId`, `date`),
    INDEX `attendance_dates_year_month_idx`(`year`, `month`),
    INDEX `attendance_dates_empId_idx`(`empId`),
    UNIQUE INDEX `attendance_dates_empId_date_key`(`empId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_photos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `attendanceId` INTEGER NOT NULL,
    `photoUrl` VARCHAR(500) NOT NULL,
    `photoType` VARCHAR(50) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `attendance_photos_attendanceId_idx`(`attendanceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_audio` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `attendanceId` INTEGER NOT NULL,
    `audioUrl` VARCHAR(500) NOT NULL,
    `duration` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `attendance_audio_attendanceId_idx`(`attendanceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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

-- AddForeignKey
ALTER TABLE `user_locations` ADD CONSTRAINT `user_locations_empId_fkey` FOREIGN KEY (`empId`) REFERENCES `users`(`empId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_empId_fkey` FOREIGN KEY (`empId`) REFERENCES `users`(`empId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_dates` ADD CONSTRAINT `attendance_dates_empId_fkey` FOREIGN KEY (`empId`) REFERENCES `users`(`empId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_dates` ADD CONSTRAINT `attendance_dates_attendanceId_fkey` FOREIGN KEY (`attendanceId`) REFERENCES `attendance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_photos` ADD CONSTRAINT `attendance_photos_attendanceId_fkey` FOREIGN KEY (`attendanceId`) REFERENCES `attendance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_audio` ADD CONSTRAINT `attendance_audio_attendanceId_fkey` FOREIGN KEY (`attendanceId`) REFERENCES `attendance`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
