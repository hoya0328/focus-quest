# 소스·SQL 탐색 지도

자동 생성 문서. `npm run docs:generate`로 갱신한다. 계약의 의미는 기능 명세를 따른다. 줄 번호는 현재 소스 위치이며 변경 시 다시 생성한다.

## 모듈과 export

| 소스 | export 이름 · 위치 |
| --- | --- |
| [app/adventure-motion-v2.css](../../app/adventure-motion-v2.css) | 스타일시트 |
| [app/api/account/route.ts](../../app/api/account/route.ts) | `dynamic` (L10), `DELETE` (L132) |
| [app/api/cloud-state/route.ts](../../app/api/cloud-state/route.ts) | `dynamic` (L14), `GET` (L111), `PUT` (L132), `DELETE` (L244) |
| [app/api/operations/route.ts](../../app/api/operations/route.ts) | `dynamic` (L5), `GET` (L7) |
| [app/api/push-subscriptions/route.ts](../../app/api/push-subscriptions/route.ts) | `dynamic` (L6), `POST` (L60), `DELETE` (L113) |
| [app/api/visit-analytics/route.ts](../../app/api/visit-analytics/route.ts) | `GET` (L5) |
| [app/base.css](../../app/base.css) | 스타일시트 |
| [app/chatgpt-auth.ts](../../app/chatgpt-auth.ts) | `ChatGPTUser` (L4), `getChatGPTUser` (L19), `requireChatGPTUser` (L38), `chatGPTSignInPath` (L47), `chatGPTSignOutPath` (L52) |
| [app/components/AdventureArchive.tsx](../../app/components/AdventureArchive.tsx) | `AdventureArchive` (L23) |
| [app/components/AdventureQuestScene.tsx](../../app/components/AdventureQuestScene.tsx) | `AdventureQuestScene` (L34) |
| [app/components/AuthDialog.tsx](../../app/components/AuthDialog.tsx) | `AuthDialog` (L22) |
| [app/components/CampLobby.tsx](../../app/components/CampLobby.tsx) | `CampCompanion` (L18), `CampLobby` (L76) |
| [app/components/CampReflectionPanel.tsx](../../app/components/CampReflectionPanel.tsx) | `CampReflectionPanel` (L27) |
| [app/components/CompanionEvolutionSprite.tsx](../../app/components/CompanionEvolutionSprite.tsx) | `CompanionEvolutionSprite` (L17) |
| [app/components/ExamExpeditionPanel.tsx](../../app/components/ExamExpeditionPanel.tsx) | `ExamExpeditionPanel` (L6) |
| [app/components/FishingQuestScene.tsx](../../app/components/FishingQuestScene.tsx) | `FishingQuestScene` (L31) |
| [app/components/InstallGuide.tsx](../../app/components/InstallGuide.tsx) | `InstallGuide` (L16) |
| [app/components/PlusInterestPanel.tsx](../../app/components/PlusInterestPanel.tsx) | `PlusInterestPanel` (L11) |
| [app/components/QuestBoard.tsx](../../app/components/QuestBoard.tsx) | `QuestBoard` (L73) |
| [app/components/RestQuestScene.tsx](../../app/components/RestQuestScene.tsx) | `RestQuestScene` (L42) |
| [app/components/RetentionPanel.tsx](../../app/components/RetentionPanel.tsx) | `RetentionPanel` (L36) |
| [app/components/StudyMaterialLibrary.tsx](../../app/components/StudyMaterialLibrary.tsx) | `StudyMaterialLibrary` (L32) |
| [app/components/StudyQuizPanel.tsx](../../app/components/StudyQuizPanel.tsx) | `StudyCheckpointPanel` (L103), `StudyRecallPanel` (L176) |
| [app/components/VisitAnalytics.tsx](../../app/components/VisitAnalytics.tsx) | `VisitAnalytics` (L8) |
| [app/components/WeeklyAdventureLog.tsx](../../app/components/WeeklyAdventureLog.tsx) | `WeeklyAdventureLog` (L50) |
| [app/components/visit-analytics.css](../../app/components/visit-analytics.css) | 스타일시트 |
| [app/focus-quest-2026.css](../../app/focus-quest-2026.css) | 스타일시트 |
| [app/globals.css](../../app/globals.css) | 스타일시트 |
| [app/hooks/useCloudSync.ts](../../app/hooks/useCloudSync.ts) | `CloudSyncStatus` (L28), `AuthActionResult` (L36), `useCloudSync` (L52) |
| [app/hooks/usePlusInterest.ts](../../app/hooks/usePlusInterest.ts) | `PlusInterestLevel` (L6), `PlusPriceBand` (L7), `usePlusInterest` (L19) |
| [app/hooks/useProductTelemetry.ts](../../app/hooks/useProductTelemetry.ts) | `ProductEventName` (L12), `useProductTelemetry` (L40) |
| [app/hooks/useSilentCamp.ts](../../app/hooks/useSilentCamp.ts) | `CampStatus` (L23), `CampRole` (L24), `CampContact` (L25), `CampHistoryEntry` (L32), `CampInvitation` (L40), `useSilentCamp` (L105) |
| [app/hooks/useStudyMaterials.ts](../../app/hooks/useStudyMaterials.ts) | `MaterialPhase` (L16), `useStudyMaterials` (L58) |
| [app/hooks/useStudyProgress.ts](../../app/hooks/useStudyProgress.ts) | `useStudyProgress` (L24) |
| [app/hooks/useStudyQuests.ts](../../app/hooks/useStudyQuests.ts) | `QuestStoreStatus` (L18), `useStudyQuests` (L20) |
| [app/layout.tsx](../../app/layout.tsx) | `metadata` (L16), `viewport` (L54), `RootLayout` (L61) |
| [app/operations/OperationsDashboard.tsx](../../app/operations/OperationsDashboard.tsx) | `OperationsDashboard` (L12) |
| [app/operations/operations.css](../../app/operations/operations.css) | 스타일시트 |
| [app/operations/page.tsx](../../app/operations/page.tsx) | `metadata` (L5), `OperationsPage` (L11) |
| [app/page.tsx](../../app/page.tsx) | `Home` (L528) |
| [app/privacy/page.tsx](../../app/privacy/page.tsx) | `metadata` (L10), `PrivacyPage` (L29) |
| [app/privacy/privacy.css](../../app/privacy/privacy.css) | 스타일시트 |
| [app/robots.txt/route.ts](../../app/robots.txt/route.ts) | `GET` (L3) |
| [app/sitemap.xml/route.ts](../../app/sitemap.xml/route.ts) | `GET` (L3) |
| [app/terms/page.tsx](../../app/terms/page.tsx) | `metadata` (L7), `TermsPage` (L13) |
| [app/tokens.css](../../app/tokens.css) | 스타일시트 |
| [build/sites-vite-plugin.ts](../../build/sites-vite-plugin.ts) | `sites` (L18) |
| [db/index.ts](../../db/index.ts) | `getDb` (L5) |
| [db/schema.ts](../../db/schema.ts) | `userCloudStates` (L3) |
| [e2e/guest.spec.ts](../../e2e/guest.spec.ts) | — |
| [e2e/helpers.ts](../../e2e/helpers.ts) | `AdventureId` (L3), `completedHistory` (L12), `resetGuestStorage` (L37), `seedHistory` (L42), `expectNoHorizontalOverflow` (L50), `openHome` (L58), `openSetup` (L74), `setInputValue` (L83) |
| [e2e/launch.spec.ts](../../e2e/launch.spec.ts) | — |
| [e2e/privacy.spec.ts](../../e2e/privacy.spec.ts) | — |
| [e2e/responsive.spec.ts](../../e2e/responsive.spec.ts) | — |
| [e2e/staging.spec.ts](../../e2e/staging.spec.ts) | — |
| [e2e/world-growth.spec.ts](../../e2e/world-growth.spec.ts) | — |
| [lib/adventure-archive.ts](../../lib/adventure-archive.ts) | `ArchiveRelic` (L3), `AdventureArchive` (L11), `isAdventureArchiveUnlocked` (L21), `getAdventureArchive` (L48), `getNextMasteryTarget` (L74) |
| [lib/camp-reflection.ts](../../lib/camp-reflection.ts) | `getCampReflectionRecommendation` (L4) |
| [lib/cleanup-deleted-pdfs.ts](../../lib/cleanup-deleted-pdfs.ts) | `cleanupDeletedPdfs` (L5) |
| [lib/cloud-state.ts](../../lib/cloud-state.ts) | `CLOUD_STATE_SCHEMA_VERSION` (L21), `CLOUD_SYNC_DISABLED_KEY` (L22), `CLOUD_LOCAL_OWNER_KEY` (L23), `ACTIVE_SESSION_UPDATED_AT_KEY` (L24), `EMPTY_SESSION_UPDATED_AT` (L26), `CloudPreferences` (L28), `CloudStateData` (L36), `CloudStateRecord` (L47), `CloudAccount` (L53), `AccountLocalStateResolution` (L58), `createEmptyCloudState` (L66), `resolveLocalStateForAccount` (L89), `isCloudSyncDisabledForAccount` (L106), `parseCloudStateData` (L157), `mergeCloudStates` (L234) |
| [lib/cloud-sync-backends.ts](../../lib/cloud-sync-backends.ts) | `CloudBackendResponse` (L19), `CloudBackend` (L24), `createApiCloudBackend` (L83), `createSupabaseCloudBackend` (L117) |
| [lib/companion-growth.ts](../../lib/companion-growth.ts) | `COMPANION_GROWTH_STORAGE_KEY` (L3), `MAX_COMPANION_GROWTH_ENTRIES` (L4), `CompanionGrowthEntry` (L6), `CompanionStage` (L13), `CompanionGrowth` (L15), `parseCompanionGrowthEntries` (L50), `parseStoredCompanionGrowth` (L58), `growthEntriesFromHistory` (L67), `mergeCompanionGrowthEntries` (L79), `addCompanionGrowthRecord` (L97), `getCompanionGrowth` (L105) |
| [lib/local-study-coach.ts](../../lib/local-study-coach.ts) | `LocalStudyGuide` (L3), `createLocalStudyGuide` (L33) |
| [lib/operating-policy.ts](../../lib/operating-policy.ts) | `OPERATING_POLICY_VERSION` (L1), `TERMS_VERSION` (L2), `TERMS_PATH` (L3), `BACKUP_RETENTION_DAYS` (L4), `EVENT_RETENTION_DAYS` (L5), `RESOLVED_CASE_RETENTION_DAYS` (L6), `MAX_STUDY_PDFS` (L7), `MAX_STUDY_PDF_TOTAL_BYTES` (L8), `expirationDate` (L9) |
| [lib/operations-dashboard.ts](../../lib/operations-dashboard.ts) | `DashboardEvent` (L3), `operatorIds` (L13), `buildDashboard` (L22), `OperationsDashboard` (L61), `createOperationsEndpoint` (L72) |
| [lib/operations.ts](../../lib/operations.ts) | `ProductEventSnapshot` (L1), `OperationsReport` (L7), `buildOperationsReport` (L23), `BackupManifest` (L74), `validateBackupManifest` (L81) |
| [lib/pdf-analysis.ts](../../lib/pdf-analysis.ts) | `MAX_PDF_BYTES` (L6), `MAX_PDF_PAGES` (L7), `MAX_EXTRACTED_TEXT_CHARACTERS` (L8), `createStudyMaterialStoragePath` (L14), `StudyMaterial` (L24), `MaterialRow` (L40), `materialFromRow` (L56) |
| [lib/pdf-client.ts](../../lib/pdf-client.ts) | `PdfInputError` (L10), `validatePdfFile` (L17), `extractPdfText` (L31) |
| [lib/pomodoro.ts](../../lib/pomodoro.ts) | `SessionMode` (L1), `AdventureId` (L2), `BgmId` (L3), `CampOutcome` (L4), `CampDifficulty` (L5), `CampReflection` (L7), `ExpeditionProgress` (L14), `ActiveSession` (L22), `FocusRecord` (L39), `WeeklyDay` (L54), `WeeklySummary` (L61), `ACTIVE_SESSION_KEY` (L68), `HISTORY_KEY` (L69), `MAX_HISTORY_RECORDS` (L70), `MAX_FOCUS_INTENT_LENGTH` (L71), `MAX_CAMP_REFLECTION_LENGTH` (L72), `normalizeFocusIntent` (L110), `normalizeCampReflectionNote` (L115), `localDateKey` (L136), `createActiveSession` (L145), `remainingForSession` (L186), `pauseActiveSession` (L193), `resumeActiveSession` (L205), `parseActiveSession` (L219), `parseHistory` (L257), `createFocusRecord` (L299), `addFocusRecord` (L339), `addCampOutcome` (L347), `addCampReflection` (L357), `getDailyCount` (L377), `getFocusStreak` (L386), `getWeeklySummary` (L408), `createExpeditionProgress` (L445) |
| [lib/privacy.ts](../../lib/privacy.ts) | `PRIVACY_NOTICE_PATH` (L1), `PRIVACY_NOTICE_VERSION` (L4), `PRIVACY_CONTACT` (L5), `SignupPrivacyConfirmation` (L10), `signupPrivacyMetadata` (L18) |
| [lib/push-reminders.ts](../../lib/push-reminders.ts) | `VAPID_PUBLIC_KEY` (L1), `PushSubscriptionBody` (L4), `urlBase64ToUint8Array` (L13), `nextReminderAt` (L20), `parsePushSubscription` (L32) |
| [lib/quiz-feedback.ts](../../lib/quiz-feedback.ts) | `QuizFeedbackStage` (L1), `QuizFeedbackValue` (L3), `QuizFeedbackState` (L5), `QUIZ_FEEDBACK_OPTIONS` (L10), `emptyQuizFeedback` (L19) |
| [lib/retention.ts](../../lib/retention.ts) | `RECOVERY_QUEST_LIFETIME_MS` (L8), `RECOVERY_QUEST_KEY` (L9), `RECOVERY_UPDATED_AT_KEY` (L10), `RecoveryQuest` (L13), `WorldProgress` (L23), `AdventureTraceProgress` (L34), `CompanionMemory` (L44), `BehaviorInsights` (L50), `WORLD_GROWTH_MINIMUM_MINUTES` (L61), `WORLD_GROWTH_MILESTONES` (L62), `createRecoveryQuest` (L92), `parseRecoveryQuest` (L118), `getWorldProgress` (L165), `getAdventureTraceProgress` (L198), `getCompanionMemory` (L231), `getBehaviorInsights` (L260) |
| [lib/search-discovery.ts](../../lib/search-discovery.ts) | `PUBLIC_INDEX_PATHS` (L3), `websiteJsonLd` (L6), `sitemapXml` (L16), `robotsText` (L21) |
| [lib/seasonal-events.ts](../../lib/seasonal-events.ts) | `SeasonalWorldEvent` (L3), `getSeasonIndex` (L32), `getSeasonalWorldEvent` (L40) |
| [lib/server-observability.ts](../../lib/server-observability.ts) | `ApiRequestContext` (L1), `createApiRequestContext` (L8), `addOperationalHeaders` (L22), `logApiFailure` (L30) |
| [lib/service-config.ts](../../lib/service-config.ts) | `PUBLIC_SERVICE_URL` (L2), `PUBLIC_SERVICE_NAME` (L3), `PUBLIC_SERVICE_KOREAN_NAME` (L4), `PUBLIC_SERVICE_TITLE` (L5), `PUBLIC_SERVICE_DESCRIPTION` (L6), `GOOGLE_SITE_VERIFICATION` (L9) |
| [lib/silent-camp.ts](../../lib/silent-camp.ts) | `SilentCampMember` (L13), `SilentCampChatMessage` (L21), `SilentCampTimer` (L29), `SilentCampResumeState` (L41), `normalizeCampCode` (L48), `createCampCode` (L52), `createSecureCampCode` (L60), `readCampCodeFromUrl` (L69), `createCampInviteUrl` (L76), `normalizeCampNickname` (L86), `normalizeCampChatMessage` (L90), `parseSilentCampResumeState` (L94), `parseSilentCampMember` (L119), `parseSilentCampChatMessage` (L147), `electSilentCampLeader` (L177), `toSilentCampTimer` (L200), `parseSilentCampTimer` (L217), `createLocalCampSession` (L249) |
| [lib/study-progress.ts](../../lib/study-progress.ts) | `StudyQuizStage` (L3), `StudyQuestProgressRow` (L5), `StudyQuizAttemptRow` (L13), `StudyLearningSignal` (L22), `StudyQuizFeedbackRow` (L30), `StudyQuizQualitySignal` (L37), `AdaptiveReviewPlan` (L45), `StudyAttemptSummary` (L52), `EMPTY_STUDY_QUALITY_SIGNAL` (L57), `summarizeStudyAttempts` (L65), `summarizeStudyQuizFeedback` (L103), `getAdaptiveReviewPlan` (L141), `StudyQuizAttemptDraft` (L180), `clampStudyPage` (L194), `studyProgressStorageKey` (L198) |
| [lib/study-quests.ts](../../lib/study-quests.ts) | `QuestContract` (L9), `QuestStatus` (L15), `StudySubject` (L17), `StudyQuest` (L28), `SubjectDraft` (L51), `SubjectProgress` (L58), `QuestLearningState` (L67), `ExamExpedition` (L69), `ExamExpeditionReport` (L81), `QuestDraft` (L94), `SubjectRow` (L110), `QuestRow` (L121), `subjectFromRow` (L144), `questFromRow` (L157), `questProgress` (L190), `getQuestLearningState` (L202), `getRecommendedQuest` (L212), `getExamExpedition` (L233), `getExamExpeditionReport` (L318), `getSubjectProgress` (L407), `normalizeQuestDraft` (L476), `normalizeSubjectDraft` (L505) |
| [lib/study-quiz.ts](../../lib/study-quiz.ts) | `QUIZ_SOURCE_KIND` (L1), `MAX_QUIZ_SOURCE_CHARACTERS` (L2), `StudyQuizSource` (L4), `StudyPageText` (L9), `StudyQuiz` (L11), `createStudyQuizSource` (L34), `parseStudyQuizSource` (L48), `parseStudyPageRange` (L67), `createStudyQuiz` (L110), `createUnseenStudyQuiz` (L155) |
| [lib/supabase-client.ts](../../lib/supabase-client.ts) | `isSupabaseConfigured` (L11), `isGoogleAuthEnabled` (L15), `getSupabaseBrowserClient` (L18) |
| [lib/telemetry-session.ts](../../lib/telemetry-session.ts) | `telemetryStorageKeys` (L3), `isDormantReturn` (L10) |
| [lib/visit-analytics.ts](../../lib/visit-analytics.ts) | `VISIT_ANALYTICS_PREFERENCE` (L1), `visitAnalyticsAllowed` (L4), `validAnalyticsToken` (L8) |
| [lib/world-growth.ts](../../lib/world-growth.ts) | `WORLD_LEVEL_MIN` (L3), `WORLD_LEVEL_MAX` (L4), `clampWorldLevel` (L12), `getWorldBackgroundKey` (L20), `getWorldBackgroundPath` (L27) |
| [scripts/backup-production.mjs](../../scripts/backup-production.mjs) | — |
| [scripts/build-e2e.mjs](../../scripts/build-e2e.mjs) | — |
| [scripts/check-build-budget.mjs](../../scripts/check-build-budget.mjs) | — |
| [scripts/check-documentation.mjs](../../scripts/check-documentation.mjs) | — |
| [scripts/configure-launch.mjs](../../scripts/configure-launch.mjs) | — |
| [scripts/daily-backup.mjs](../../scripts/daily-backup.mjs) | — |
| [scripts/diagnose-isolated-auth.mjs](../../scripts/diagnose-isolated-auth.mjs) | — |
| [scripts/encrypted-backup.mjs](../../scripts/encrypted-backup.mjs) | `encrypt` (L11), `decrypt` (L20), `protectDirectory` (L28), `loadBackupKey` (L47), `writeArchive` (L71), `readArchive` (L89), `removeArchive` (L108), `pruneArchives` (L120), `withBackupLock` (L139), `BACKUP_RETENTION_DAYS` (L155) |
| [scripts/export-local-supabase-env.mjs](../../scripts/export-local-supabase-env.mjs) | — |
| [scripts/generate-source-map.mjs](../../scripts/generate-source-map.mjs) | `projectRoot` (L6), `runtimeSyntaxShape` (L13), `createSourceMap` (L58) |
| [scripts/inspect-operations-access.mjs](../../scripts/inspect-operations-access.mjs) | — |
| [scripts/moderate-camp-report.mjs](../../scripts/moderate-camp-report.mjs) | — |
| [scripts/operations-data.mjs](../../scripts/operations-data.mjs) | `backupTables` (L3), `readAllRows` (L23) |
| [scripts/operations-maintenance.mjs](../../scripts/operations-maintenance.mjs) | — |
| [scripts/operations-report.mjs](../../scripts/operations-report.mjs) | — |
| [scripts/optimize-static-assets.mjs](../../scripts/optimize-static-assets.mjs) | — |
| [scripts/provision-staging.mjs](../../scripts/provision-staging.mjs) | — |
| [scripts/run-linked-operations.mjs](../../scripts/run-linked-operations.mjs) | — |
| [scripts/security-anonymous.mjs](../../scripts/security-anonymous.mjs) | — |
| [scripts/security-secret-scan.mjs](../../scripts/security-secret-scan.mjs) | — |
| [scripts/verify-backup.mjs](../../scripts/verify-backup.mjs) | — |
| [scripts/verify-encrypted-backups.mjs](../../scripts/verify-encrypted-backups.mjs) | — |
| [scripts/verify-staging-env.mjs](../../scripts/verify-staging-env.mjs) | — |
| [scripts/weekly-backup.mjs](../../scripts/weekly-backup.mjs) | — |
| [tests/adventure-archive.test.mjs](../../tests/adventure-archive.test.mjs) | — |
| [tests/cloud-state.test.mjs](../../tests/cloud-state.test.mjs) | — |
| [tests/documentation.test.mjs](../../tests/documentation.test.mjs) | — |
| [tests/launch-analytics.test.mjs](../../tests/launch-analytics.test.mjs) | — |
| [tests/local-study-coach.test.mjs](../../tests/local-study-coach.test.mjs) | — |
| [tests/operating-policy.test.mjs](../../tests/operating-policy.test.mjs) | — |
| [tests/operations.test.mjs](../../tests/operations.test.mjs) | — |
| [tests/pdf-analysis.test.mjs](../../tests/pdf-analysis.test.mjs) | — |
| [tests/pomodoro.test.mjs](../../tests/pomodoro.test.mjs) | — |
| [tests/privacy.test.mjs](../../tests/privacy.test.mjs) | — |
| [tests/public-auth.test.mjs](../../tests/public-auth.test.mjs) | — |
| [tests/push-reminders.test.mjs](../../tests/push-reminders.test.mjs) | — |
| [tests/pwa.test.mjs](../../tests/pwa.test.mjs) | — |
| [tests/release-readiness.test.mjs](../../tests/release-readiness.test.mjs) | — |
| [tests/rendered-html.test.mjs](../../tests/rendered-html.test.mjs) | — |
| [tests/retention.test.mjs](../../tests/retention.test.mjs) | — |
| [tests/seasonal-events.test.mjs](../../tests/seasonal-events.test.mjs) | — |
| [tests/silent-camp.test.mjs](../../tests/silent-camp.test.mjs) | — |
| [tests/study-quests.test.mjs](../../tests/study-quests.test.mjs) | — |
| [tests/virtual-user-qa.test.mjs](../../tests/virtual-user-qa.test.mjs) | — |
| [worker/index.ts](../../worker/index.ts) | `default` (L199) |

## SQL 테이블 최초 정의

후속 ALTER·정책 변경까지 누적해야 최종 스키마다. 이 표는 운영 DB 조회 결과가 아니다.

| 테이블 | 정의 |
| --- | --- |
| `focus_quest_account_acknowledgements` | [supabase/migrations/202611250009_operating_policy.sql L3](../../supabase/migrations/202611250009_operating_policy.sql#L3) |
| `focus_quest_camp_blocks` | [supabase/migrations/202611250001_secure_silent_camps.sql L20](../../supabase/migrations/202611250001_secure_silent_camps.sql#L20) |
| `focus_quest_camp_contacts` | [supabase/migrations/202611250005_camp_relationships.sql L13](../../supabase/migrations/202611250005_camp_relationships.sql#L13) |
| `focus_quest_camp_history` | [supabase/migrations/202611250005_camp_relationships.sql L1](../../supabase/migrations/202611250005_camp_relationships.sql#L1) |
| `focus_quest_camp_invitations` | [supabase/migrations/202611250005_camp_relationships.sql L25](../../supabase/migrations/202611250005_camp_relationships.sql#L25) |
| `focus_quest_camp_members` | [supabase/migrations/202611250001_secure_silent_camps.sql L9](../../supabase/migrations/202611250001_secure_silent_camps.sql#L9) |
| `focus_quest_camp_reports` | [supabase/migrations/202611250005_camp_relationships.sql L39](../../supabase/migrations/202611250005_camp_relationships.sql#L39) |
| `focus_quest_camps` | [supabase/migrations/202611250001_secure_silent_camps.sql L1](../../supabase/migrations/202611250001_secure_silent_camps.sql#L1) |
| `focus_quest_cloud_states` | [supabase/migrations/202607260001_focus_quest_cloud_states.sql L1](../../supabase/migrations/202607260001_focus_quest_cloud_states.sql#L1) |
| `focus_quest_deletion_ledger` | [supabase/migrations/202611250009_operating_policy.sql L10](../../supabase/migrations/202611250009_operating_policy.sql#L10) |
| `focus_quest_operation_runs` | [supabase/migrations/202611250009_operating_policy.sql L21](../../supabase/migrations/202611250009_operating_policy.sql#L21) |
| `focus_quest_pdf_quotas` | [supabase/migrations/202611250009_operating_policy.sql L27](../../supabase/migrations/202611250009_operating_policy.sql#L27) |
| `focus_quest_plus_interest` | [supabase/migrations/202611240003_plus_interest_research.sql L1](../../supabase/migrations/202611240003_plus_interest_research.sql#L1) |
| `focus_quest_product_events` | [supabase/migrations/202611130001_product_readiness.sql L52](../../supabase/migrations/202611130001_product_readiness.sql#L52) |
| `focus_quest_push_subscriptions` | [supabase/migrations/202611250002_web_push_reminders.sql L1](../../supabase/migrations/202611250002_web_push_reminders.sql#L1) |
| `study_materials` | [supabase/migrations/202607280001_study_materials.sql L1](../../supabase/migrations/202607280001_study_materials.sql#L1) |
| `study_quest_focus_sessions` | [supabase/migrations/202607260002_study_quests.sql L43](../../supabase/migrations/202607260002_study_quests.sql#L43) |
| `study_quest_progress` | [supabase/migrations/202611130001_product_readiness.sql L1](../../supabase/migrations/202611130001_product_readiness.sql#L1) |
| `study_quests` | [supabase/migrations/202607260002_study_quests.sql L13](../../supabase/migrations/202607260002_study_quests.sql#L13) |
| `study_quiz_attempts` | [supabase/migrations/202611130001_product_readiness.sql L18](../../supabase/migrations/202611130001_product_readiness.sql#L18) |
| `study_subjects` | [supabase/migrations/202607260002_study_quests.sql L1](../../supabase/migrations/202607260002_study_quests.sql#L1) |

## SQL 함수 마지막 정의

동일 이름은 마지막 정의 위치를 표시한다. 과거 overload의 revoke/drop과 grants도 함께 확인한다. trigger 함수는 클라이언트 API가 아니다.

| 함수 | 선언 인자 | 마지막 정의 |
| --- | --- | --- |
| `accept_focus_quest_camp_invitation` | requested_camp_id uuid | [supabase/migrations/202611250005_camp_relationships.sql L180](../../supabase/migrations/202611250005_camp_relationships.sql#L180) |
| `acknowledge_focus_quest_backup_cleanup` | request_ids uuid[] | [supabase/migrations/202611250009_operating_policy.sql L131](../../supabase/migrations/202611250009_operating_policy.sql#L131) |
| `acknowledge_focus_quest_pdf_cleanup` | request_ids uuid[] | [supabase/migrations/202611250009_operating_policy.sql L200](../../supabase/migrations/202611250009_operating_policy.sql#L200) |
| `complete_study_quest_set` | p_quest_id uuid, p_session_id text, p_duration_minutes integer | [supabase/migrations/202607260002_study_quests.sql L94](../../supabase/migrations/202607260002_study_quests.sql#L94) |
| `create_focus_quest_camp` | requested_code text, requested_nickname text, requested_adventure_id text, requested_focus_minutes integer | [supabase/migrations/202611250001_secure_silent_camps.sql L78](../../supabase/migrations/202611250001_secure_silent_camps.sql#L78) |
| `enforce_focus_quest_pdf_quota` | 없음 | [supabase/migrations/202611250009_operating_policy.sql L80](../../supabase/migrations/202611250009_operating_policy.sql#L80) |
| `enforce_focus_quest_signup` | 없음 | [supabase/migrations/202611250009_operating_policy.sql L43](../../supabase/migrations/202611250009_operating_policy.sql#L43) |
| `export_focus_quest_backup` | 없음 | [supabase/migrations/202611250009_operating_policy.sql L145](../../supabase/migrations/202611250009_operating_policy.sql#L145) |
| `focus_quest_operation_status` | 없음 | [supabase/migrations/202611250009_operating_policy.sql L172](../../supabase/migrations/202611250009_operating_policy.sql#L172) |
| `focus_quest_pending_pdf_cleanup` | 없음 | [supabase/migrations/202611250009_operating_policy.sql L187](../../supabase/migrations/202611250009_operating_policy.sql#L187) |
| `invite_focus_quest_camp_contact` | requested_camp_id uuid, requested_contact_user_id uuid | [supabase/migrations/202611250005_camp_relationships.sql L144](../../supabase/migrations/202611250005_camp_relationships.sql#L144) |
| `is_active_focus_quest_camp_member` | requested_camp_id uuid | [supabase/migrations/202611250003_harden_camp_membership_check.sql L8](../../supabase/migrations/202611250003_harden_camp_membership_check.sql#L8) |
| `join_focus_quest_camp` | requested_code text, requested_nickname text, requested_adventure_id text, requested_focus_minutes integer | [supabase/migrations/202611250008_fix_camp_upsert_targets.sql L2](../../supabase/migrations/202611250008_fix_camp_upsert_targets.sql#L2) |
| `leave_focus_quest_camp` | requested_camp_id uuid | [supabase/migrations/202611250001_secure_silent_camps.sql L198](../../supabase/migrations/202611250001_secure_silent_camps.sql#L198) |
| `record_focus_quest_camp_completion` | requested_camp_id uuid, requested_duration_minutes integer | [supabase/migrations/202611250005_camp_relationships.sql L85](../../supabase/migrations/202611250005_camp_relationships.sql#L85) |
| `record_focus_quest_deletion` | 없음 | [supabase/migrations/202611250009_operating_policy.sql L60](../../supabase/migrations/202611250009_operating_policy.sql#L60) |
| `remove_focus_quest_camp_member` | requested_camp_id uuid, requested_user_id uuid, should_block boolean default false | [supabase/migrations/202611250001_secure_silent_camps.sql L236](../../supabase/migrations/202611250001_secure_silent_camps.sql#L236) |
| `reopen_focus_quest_camp` | previous_camp_id uuid, requested_code text, requested_nickname text, requested_adventure_id text, requested_focus_minutes integer | [supabase/migrations/202611250008_fix_camp_upsert_targets.sql L51](../../supabase/migrations/202611250008_fix_camp_upsert_targets.sql#L51) |
| `report_focus_quest_camp_member` | requested_camp_id uuid, requested_user_id uuid, requested_reason text | [supabase/migrations/202611250005_camp_relationships.sql L193](../../supabase/migrations/202611250005_camp_relationships.sql#L193) |
| `run_focus_quest_retention` | 없음 | [supabase/migrations/202611250009_operating_policy.sql L111](../../supabase/migrations/202611250009_operating_policy.sql#L111) |
| `save_study_quest_progress` | p_quest_id uuid, p_material_id uuid, p_reached_page integer | [supabase/migrations/202611130001_product_readiness.sql L141](../../supabase/migrations/202611130001_product_readiness.sql#L141) |
| `update_focus_quest_camp_member` | requested_camp_id uuid, requested_nickname text, requested_adventure_id text, requested_focus_minutes integer | [supabase/migrations/202611250001_secure_silent_camps.sql L164](../../supabase/migrations/202611250001_secure_silent_camps.sql#L164) |
