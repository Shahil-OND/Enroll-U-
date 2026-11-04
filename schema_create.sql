-- ============================================================
-- Schema execution file
-- Tables removed per request:
--   payment_methods, academic_period_payment_method,
--   user_academic_periods, sales,
--   academic_period_scheduled_payment_discounts
-- Remaining 18 tables ordered so every FOREIGN KEY reference
-- points to a table already created above it.
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------
-- 1. countries
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `countries`;
CREATE TABLE `countries` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `iso_code` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `intro` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `text` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `attribute_1` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `attribute_2` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `attribute_3` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `attribute_4` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `icon` char(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `main_image` char(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image` char(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `countries_name_unique` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 2. currencies
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `currencies`;
CREATE TABLE `currencies` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `iso_code` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `symbol` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 3. knowledge_areas
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `knowledge_areas`;
CREATE TABLE `knowledge_areas` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `key` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 4. modalities
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `modalities`;
CREATE TABLE `modalities` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `key` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `modalities_key_unique` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 5. periodicities
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `periodicities`;
CREATE TABLE `periodicities` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `plural` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `singular` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `key` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `periodicities_key_unique` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 6. media
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `media`;
CREATE TABLE `media` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `type` tinyint NOT NULL DEFAULT '0',
  `name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `thumbnail` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `extension` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `size` double DEFAULT NULL,
  `mime_type` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `path` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` tinyint NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 7. academic_degrees (self-referencing)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `academic_degrees`;
CREATE TABLE `academic_degrees` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `parent_id` int unsigned DEFAULT NULL,
  `key` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `route` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `meta_description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `meta_keywords` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `academic_degrees_parent_id_foreign` (`parent_id`),
  CONSTRAINT `academic_degrees_parent_id_foreign` FOREIGN KEY (`parent_id`) REFERENCES `academic_degrees` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 8. zones
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `zones`;
CREATE TABLE `zones` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `country_id` int unsigned DEFAULT NULL,
  `name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_international` tinyint(1) DEFAULT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `main_image` char(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` int unsigned NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `zones_name_unique` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 9. academic_institutions (needs media, zones)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `academic_institutions`;
CREATE TABLE `academic_institutions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `logo_id` int unsigned DEFAULT NULL,
  `country_id` int unsigned DEFAULT NULL,
  `zone_id` int unsigned DEFAULT NULL,
  `order` int unsigned DEFAULT NULL,
  `name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `short_name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_relevant` smallint NOT NULL DEFAULT '0',
  `relevant` smallint NOT NULL DEFAULT '0',
  `destacado` smallint NOT NULL DEFAULT '0',
  `stars` smallint NOT NULL DEFAULT '0',
  `email` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `url` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `openpay_merchant_id` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `openpay_production_mode` tinyint(1) NOT NULL DEFAULT '0',
  `openpay_private_key` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `openpay_public_key` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `openpay_private_sandbox_key` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `openpay_public_sanbox_key` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `paypal_production_mode` tinyint(1) DEFAULT '0',
  `paypal_client_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `paypal_secret_key` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `paypal_sandbox_client_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `paypal_sandbox_secret_key` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `paycode_token` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `stripe_public_key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `stripe_secret_key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `stripe_account_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `is_active` tinyint(1) NOT NULL DEFAULT '0',
  `is_allied` tinyint(1) NOT NULL DEFAULT '0',
  `lat` double(12,6) NOT NULL,
  `lng` double(12,6) DEFAULT NULL,
  `dont_show_price` tinyint(1) DEFAULT NULL,
  `meta_url` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `meta_title` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `meta_keys` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `meta_description` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `fideicomiso` int DEFAULT NULL,
  PRIMARY KEY (`id`,`lat`),
  UNIQUE KEY `academic_institutions_meta_url_unique` (`meta_url`),
  KEY `academic_institutions_logo_id_foreign` (`logo_id`),
  KEY `academic_institutions_zone_id_foreign` (`zone_id`),
  KEY `academic_institution_name` (`name`),
  KEY `academic_institution_allied` (`is_allied`),
  KEY `academic_institution_active` (`is_active`),
  FULLTEXT KEY `fulltext_index` (`name`,`short_name`,`meta_keys`),
  FULLTEXT KEY `name` (`name`,`short_name`),
  CONSTRAINT `academic_institutions_logo_id_foreign` FOREIGN KEY (`logo_id`) REFERENCES `media` (`id`),
  CONSTRAINT `academic_institutions_zone_id_foreign` FOREIGN KEY (`zone_id`) REFERENCES `zones` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 10. study_areas (needs media, knowledge_areas)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `study_areas`;
CREATE TABLE `study_areas` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `knowledge_area_id` int unsigned DEFAULT NULL,
  `icon_file` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_id` int unsigned DEFAULT NULL,
  `key` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `meta_title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `meta_description` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `meta_keywords` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `has_landing` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` char(1) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '1',
  `icon` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `color` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `study_areas_key_unique` (`key`),
  KEY `study_areas_knowledge_area_id_foreign` (`knowledge_area_id`),
  KEY `study_areas_image_id_foreign` (`image_id`),
  CONSTRAINT `study_areas_image_id_foreign` FOREIGN KEY (`image_id`) REFERENCES `media` (`id`),
  CONSTRAINT `study_areas_knowledge_area_id_foreign` FOREIGN KEY (`knowledge_area_id`) REFERENCES `knowledge_areas` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 11. academic_institution_zones (needs academic_institutions)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `academic_institution_zones`;
CREATE TABLE `academic_institution_zones` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `academic_institution_id` int unsigned NOT NULL,
  `name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `academic_institution_zones_academic_institution_id_foreign` (`academic_institution_id`),
  CONSTRAINT `academic_institution_zones_academic_institution_id_foreign` FOREIGN KEY (`academic_institution_id`) REFERENCES `academic_institutions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 12. campuses (needs academic_institutions, media, zones)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `campuses`;
CREATE TABLE `campuses` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `academic_institution_id` int unsigned NOT NULL,
  `logo_id` int unsigned DEFAULT NULL,
  `zone_id` int unsigned DEFAULT NULL,
  `name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `short_name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `url` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lat` double(12,6) DEFAULT NULL,
  `lng` double(12,6) DEFAULT NULL,
  `meta_url` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `meta_title` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `meta_keys` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `meta_description` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `campuses_meta_url_unique` (`meta_url`),
  KEY `campuses_academic_institution_id_foreign` (`academic_institution_id`),
  KEY `campuses_logo_id_foreign` (`logo_id`),
  KEY `campuses_zone_id_foreign` (`zone_id`),
  CONSTRAINT `campuses_academic_institution_id_foreign` FOREIGN KEY (`academic_institution_id`) REFERENCES `academic_institutions` (`id`),
  CONSTRAINT `campuses_logo_id_foreign` FOREIGN KEY (`logo_id`) REFERENCES `media` (`id`),
  CONSTRAINT `campuses_zone_id_foreign` FOREIGN KEY (`zone_id`) REFERENCES `zones` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 13. institution_administrators (needs academic_institutions, media)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `institution_administrators`;
CREATE TABLE `institution_administrators` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `academic_institution_id` int unsigned NOT NULL,
  `photo_id` int unsigned DEFAULT NULL,
  `first_name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `birth_date` date DEFAULT NULL,
  `phone` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `type_user` tinyint NOT NULL DEFAULT '1',
  `remember_token` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `institution_administrators_email_unique` (`email`),
  KEY `institution_administrators_academic_institution_id_foreign` (`academic_institution_id`),
  KEY `institution_administrators_photo_id_foreign` (`photo_id`),
  CONSTRAINT `institution_administrators_academic_institution_id_foreign` FOREIGN KEY (`academic_institution_id`) REFERENCES `academic_institutions` (`id`),
  CONSTRAINT `institution_administrators_photo_id_foreign` FOREIGN KEY (`photo_id`) REFERENCES `media` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 14. academic_periods (needs campuses, periodicities)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `academic_periods`;
CREATE TABLE `academic_periods` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `campus_id` int unsigned NOT NULL,
  `periodicity_id` int unsigned NOT NULL,
  `title` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `start_registration_at` date DEFAULT NULL,
  `end_registration_at` date DEFAULT NULL,
  `start_at` date DEFAULT NULL,
  `end_at` date DEFAULT NULL,
  `is_custom` int unsigned NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '0',
  `cancelled_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `academic_periods_campus_id_foreign` (`campus_id`),
  KEY `academic_periods_periodicity_id_foreign` (`periodicity_id`),
  CONSTRAINT `academic_periods_campus_id_foreign` FOREIGN KEY (`campus_id`) REFERENCES `campuses` (`id`),
  CONSTRAINT `academic_periods_periodicity_id_foreign` FOREIGN KEY (`periodicity_id`) REFERENCES `periodicities` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 15. academic_programs
-- (needs academic_institutions, campuses, academic_degrees,
--  periodicities, study_areas, modalities, media, institution_administrators)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `academic_programs`;
CREATE TABLE `academic_programs` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `zoho_id` char(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `academic_institution_id` int unsigned NOT NULL,
  `campus_id` int unsigned DEFAULT NULL,
  `academic_degree_id` int unsigned NOT NULL,
  `periodicity_id` int unsigned NOT NULL,
  `study_area_id` int unsigned DEFAULT NULL,
  `modality_id` int unsigned NOT NULL,
  `image_id` int unsigned DEFAULT NULL,
  `study_program_id` int unsigned DEFAULT NULL,
  `executive_id` int unsigned DEFAULT NULL,
  `name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `short_name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `periods_qty` int DEFAULT NULL,
  `url` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duration` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rvoe` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `description_title` char(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `about` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `about_title` char(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `labor_field` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `labor_field_title` char(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `requirements` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `requirements_title` char(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `meta_url` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `meta_title` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `meta_keys` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `meta_description` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `redirect_payment` enum('url','mail') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `button_text` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `has_admission_test` tinyint(1) NOT NULL DEFAULT '0',
  `is_already` tinyint(1) NOT NULL DEFAULT '0',
  `is_oficial` tinyint(1) NOT NULL DEFAULT '0',
  `has_exchange` tinyint(1) NOT NULL DEFAULT '0',
  `has_scholarship` tinyint(1) NOT NULL DEFAULT '0',
  `is_enrollu_recommendation` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `academic_programs_meta_url_unique` (`meta_url`),
  KEY `academic_programs_academic_institution_id_foreign` (`academic_institution_id`),
  KEY `academic_programs_campus_id_foreign` (`campus_id`),
  KEY `academic_programs_academic_degree_id_foreign` (`academic_degree_id`),
  KEY `academic_programs_periodicity_id_foreign` (`periodicity_id`),
  KEY `academic_programs_study_area_id_foreign` (`study_area_id`),
  KEY `academic_programs_modality_id_foreign` (`modality_id`),
  KEY `academic_programs_image_id_foreign` (`image_id`),
  KEY `academic_programs_study_program_id_foreign` (`study_program_id`),
  KEY `academic_programs_executive_id_foreign` (`executive_id`),
  FULLTEXT KEY `fulltext_index` (`name`,`short_name`,`meta_keys`),
  FULLTEXT KEY `fulltext_two_columns` (`name`,`short_name`),
  FULLTEXT KEY `one_columna` (`name`),
  CONSTRAINT `academic_programs_academic_degree_id_foreign` FOREIGN KEY (`academic_degree_id`) REFERENCES `academic_degrees` (`id`),
  CONSTRAINT `academic_programs_academic_institution_id_foreign` FOREIGN KEY (`academic_institution_id`) REFERENCES `academic_institutions` (`id`),
  CONSTRAINT `academic_programs_campus_id_foreign` FOREIGN KEY (`campus_id`) REFERENCES `campuses` (`id`),
  CONSTRAINT `academic_programs_executive_id_foreign` FOREIGN KEY (`executive_id`) REFERENCES `institution_administrators` (`id`),
  CONSTRAINT `academic_programs_image_id_foreign` FOREIGN KEY (`image_id`) REFERENCES `media` (`id`),
  CONSTRAINT `academic_programs_modality_id_foreign` FOREIGN KEY (`modality_id`) REFERENCES `modalities` (`id`),
  CONSTRAINT `academic_programs_periodicity_id_foreign` FOREIGN KEY (`periodicity_id`) REFERENCES `periodicities` (`id`),
  CONSTRAINT `academic_programs_study_area_id_foreign` FOREIGN KEY (`study_area_id`) REFERENCES `study_areas` (`id`),
  CONSTRAINT `academic_programs_study_program_id_foreign` FOREIGN KEY (`study_program_id`) REFERENCES `media` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 16. academic_period_programs (needs academic_periods, academic_programs)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `academic_period_programs`;
CREATE TABLE `academic_period_programs` (
  `academic_period_id` int unsigned NOT NULL,
  `academic_program_id` int unsigned NOT NULL,
  KEY `academic_period_programs_academic_period_id_foreign` (`academic_period_id`),
  KEY `academic_period_programs_academic_program_id_foreign` (`academic_program_id`),
  CONSTRAINT `academic_period_programs_academic_period_id_foreign` FOREIGN KEY (`academic_period_id`) REFERENCES `academic_periods` (`id`),
  CONSTRAINT `academic_period_programs_academic_program_id_foreign` FOREIGN KEY (`academic_program_id`) REFERENCES `academic_programs` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 17. academic_period_scheduled_payments
-- (needs academic_periods, academic_programs, currencies)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `academic_period_scheduled_payments`;
CREATE TABLE `academic_period_scheduled_payments` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `academic_period_id` int unsigned NOT NULL,
  `academic_program_id` int unsigned NOT NULL,
  `currency_id` int unsigned NOT NULL,
  `concept_type` tinyint DEFAULT NULL,
  `concept` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(15,2) DEFAULT NULL,
  `discount_type` tinyint DEFAULT NULL,
  `discount` decimal(15,2) DEFAULT NULL,
  `has_scholarship` tinyint(1) NOT NULL DEFAULT '0',
  `date` date DEFAULT NULL,
  `limit_date` date DEFAULT NULL,
  `recharge_type` tinyint DEFAULT NULL,
  `recharge` decimal(15,2) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `academic_period_scheduled_payments_academic_period_id_foreign` (`academic_period_id`),
  KEY `academic_period_scheduled_payments_academic_program_id_foreign` (`academic_program_id`),
  KEY `academic_period_scheduled_payments_currency_id_foreign` (`currency_id`),
  CONSTRAINT `academic_period_scheduled_payments_academic_period_id_foreign` FOREIGN KEY (`academic_period_id`) REFERENCES `academic_periods` (`id`),
  CONSTRAINT `academic_period_scheduled_payments_academic_program_id_foreign` FOREIGN KEY (`academic_program_id`) REFERENCES `academic_programs` (`id`),
  CONSTRAINT `academic_period_scheduled_payments_currency_id_foreign` FOREIGN KEY (`currency_id`) REFERENCES `currencies` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 18. periods (needs academic_programs)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `periods`;
CREATE TABLE `periods` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `academic_program_id` int unsigned DEFAULT NULL,
  `period_number` int NOT NULL,
  `academic_subject` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `periods_academic_program_id_foreign` (`academic_program_id`),
  CONSTRAINT `periods_academic_program_id_foreign` FOREIGN KEY (`academic_program_id`) REFERENCES `academic_programs` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- End of schema. 18 tables created successfully in dependency order.
-- ============================================================