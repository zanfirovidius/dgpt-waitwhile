export interface ProjectFeedbackConfig {
  projectSlug?: string;
  eventName?: string;
  city?: string;
  venue?: string;
  operatorName?: string;
  dpoEmail?: string;
  privacyNoticeText?: string;
  feedbackRetentionDays?: number;
  feedbackFormTitle?: string;
  feedbackSuccessMessage?: string;
  [key: string]: any;
}

export function validateProjectFeedbackSetup(config: ProjectFeedbackConfig) {
  const missingItems: string[] = [];

  if (!config.projectSlug) missingItems.push('Slug Proiect Unic');
  if (!config.operatorName) missingItems.push('Nume Legal Operator');
  if (!config.dpoEmail) missingItems.push('Email Contact DPO');
  if (!config.privacyNoticeText || config.privacyNoticeText.length < 50) missingItems.push('Text Notă Confidențialitate');
  if (!config.feedbackRetentionDays) missingItems.push('Perioadă Retenție (Zile)');
  if (!config.feedbackFormTitle) missingItems.push('Titlu Formular Feedback');
  if (!config.feedbackSuccessMessage) missingItems.push('Mesaj de Succes');

  // Event info (at least name + location)
  if (!config.eventName) missingItems.push('Nume Eveniment');
  if (!config.city && !config.venue) missingItems.push('Oraș sau Sală');

  return {
    setupCompleted: missingItems.length === 0,
    missingItems,
  };
}
