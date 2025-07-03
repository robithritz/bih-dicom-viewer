-- Create OTP table for email authentication
CREATE TABLE IF NOT EXISTS `otps` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `session_id` varchar(255) NOT NULL,
  `otp` varchar(10) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expires_at` datetime(3) NOT NULL,
  `verified` boolean NOT NULL DEFAULT false,
  `retry_count` int NOT NULL DEFAULT 1,
  `attempts` int NOT NULL DEFAULT 0,
  `last_request_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `otps_session_id_key` (`session_id`),
  KEY `otps_email_idx` (`email`),
  KEY `otps_session_id_idx` (`session_id`),
  KEY `otps_expires_at_idx` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create DICOM Patients table for patient authentication and file access
CREATE TABLE IF NOT EXISTS `dicom_patients` (
  `id` int NOT NULL AUTO_INCREMENT,
  `patient_id` varchar(50) NOT NULL,
  `email` varchar(255) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `gender` varchar(10) DEFAULT NULL,
  `address` text,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `last_login` datetime(3) DEFAULT NULL,
  `is_active` boolean NOT NULL DEFAULT true,
  PRIMARY KEY (`id`),
  UNIQUE KEY `dicom_patients_patient_id_key` (`patient_id`),
  UNIQUE KEY `dicom_patients_email_key` (`email`),
  KEY `dicom_patients_email_idx` (`email`),
  KEY `dicom_patients_patient_id_idx` (`patient_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
